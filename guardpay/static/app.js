/* ============================================================
   GuardPay — Neighborhood Security Fee Tracker
   Complete application logic
   ============================================================ */

const API = '';
let state = { settings: {}, houses: [], payments: [], guard_payments: [], fee_change: [], reminders: [], auth: { pin_enabled: false } };
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let filterMode = 'recent';
let statusFilter = 'all';
let histYear = calYear;
let histMonth = calMonth;
let anaYear = calYear;
let currentView = 'dashboard';
let celebrated = false;
const ANA_SECTIONS = ['year-summary', 'year-chart', 'ontime-chart', 'scorecards', 'leaderboard', 'history-table'];
let editContext = null;
let addMode = 'single';
let expType = 'monthly';
let expFmt = 'pdf';
let expPdf = 'monthly';
let searchQuery = '';

/* ---------------- performance: payment index + stats cache ---------------- */
let _payIndex = new Map();      // key `${house_id}|${month_key}` -> payment
let _payByHouse = new Map();    // house_id -> [payments]
let _statsCache = new Map();    // house_id -> computed stats

function buildIndexes() {
  _payIndex = new Map();
  _payByHouse = new Map();
  _statsCache = new Map();
  for (const p of state.payments) {
    _payIndex.set(p.house_id + '|' + p.month_key, p);
    if (!_payByHouse.has(p.house_id)) _payByHouse.set(p.house_id, []);
    _payByHouse.get(p.house_id).push(p);
  }
}
function paymentFor(houseId, monthKey) { return _payIndex.get(houseId + '|' + monthKey) || null; }
function paymentsForHouse(houseId) { return _payByHouse.get(houseId) || []; }

let MONTHS = I18N.MONTHS();

/* ---------------- Dynamic setting accessors ---------------- */
function settingGuardSalary() { const v = parseInt(state.settings.guard_salary); return isNaN(v) ? 30000 : v; }
function settingDefaultFee() { const v = parseInt(state.settings.default_fee); return isNaN(v) ? 4000 : v; }
function settingDueDay() { const v = parseInt(state.settings.due_day); return isNaN(v) ? 5 : v; }

/* Scoring constants (mirrors src/config.py) */
const SCORE_ON_TIME = 100;
const SCORE_LATE_MILD = 55;
const SCORE_LATE_MOD = 30;
const SCORE_LATE_SEVERE = 10;
const SCORE_STREAK_BONUS = 15;
const SCORE_DOT_DIVISOR = 20;
const TIER_EXCELLENT_MIN = 400;
const TIER_RELIABLE_MIN = 200;
const TIER_INCONSISTENT_MIN = 100;

/* ---------------- API helpers ---------------- */
async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(data.error || ('HTTP ' + res.status));
    err.locked = !!data.locked;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function loadState() {
  try {
    state = await api('/api/state');
    if (!state.reminders) state.reminders = [];
    if (!state.fee_change) state.fee_change = [];
    if (!state.aliases) state.aliases = [];
    if (typeof state.sms_pending !== 'number') state.sms_pending = 0;
  } catch (e) {
    if (e.locked) { showLock(); return; }
    toast(I18N.t('toast_server_error'));
  }
}

/* ---------------- auth / lock ---------------- */
async function checkAuth() {
  try {
    const s = await api('/api/auth/status');
    if (s.pin_enabled && !s.authed) { showLock(); return false; }
    hideLock();
    return true;
  } catch (e) { return true; }
}

function showLock() {
  const el = $('#lockScreen');
  if (el) { el.classList.add('show'); setTimeout(() => { const i = $('#lockPin'); if (i) i.focus(); }, 80); }
}
function hideLock() {
  const el = $('#lockScreen');
  if (el) el.classList.remove('show');
}

async function doUnlock() {
  const pin = $('#lockPin').value;
  const err = $('#lockError');
  try {
    await api('/api/auth/login', 'POST', { pin });
    err.textContent = '';
    $('#lockPin').value = '';
    hideLock();
    await refreshAll();
  } catch (e) {
    err.textContent = I18N.t('toast_incorrect_pin');
    $('#lockPin').value = '';
    $('#lockPin').focus();
  }
}

/* ---------------- helpers ---------------- */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
function pad2(n) { return String(n).padStart(2, '0'); }
function todayDate() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function currentMonthKey() { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
function parseMonthKey(k) { const [y, m] = k.split('-').map(Number); return { year: y, month: m }; }
function monthLabel(k) { const { year, month } = parseMonthKey(k); return MONTHS[month - 1] + ' ' + year; }
function formatMoney(n) { const cur = state.settings.currency || 'ETB'; return Number(n || 0).toLocaleString() + ' ' + cur; }
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function initials(name) { return String(name || '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase(); }
function normalizeText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
function debounce(fn, ms) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}
function statusLabel(s) {
  return { ontime: I18N.t('status_ontime'), late: I18N.t('status_late'), overdue: I18N.t('status_overdue'), missed: I18N.t('status_missed'), upcoming: I18N.t('status_not_due') }[s] || s;
}

/* ---------------- theme engine ---------------- */
const THEMES = ['light', 'dark', 'sepia', 'midnight', 'forest'];

function getSavedTheme() {
  try {
    const saved = localStorage.getItem('guardpay_theme');
    if (saved && THEMES.includes(saved)) return saved;
  } catch (e) { /* localStorage blocked */ }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'light';
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('guardpay_theme', theme); } catch (e) { /* ignore */ }
  document.querySelectorAll('.theme-opt').forEach(b => {
    const on = b.dataset.theme === theme;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function wireThemePicker() {
  document.querySelectorAll('.theme-opt').forEach(b => {
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => applyTheme(b.dataset.theme));
  });
}

function wireLangPicker() {
  document.querySelectorAll('.lang-opt').forEach(b => {
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      I18N.setLang(b.dataset.lang);
      applyLanguage();
    });
  });
}

function applyLanguage() {
  MONTHS = I18N.MONTHS();
  renderStats(false);
  renderCalendar();
  renderLedger();
  renderLeaderboard();
  renderHistory();
  renderReminders();
  renderScorecards();
  if (currentView === 'history') renderAnalytics();
  const drawer = $('#drawer');
  if (drawer && drawer.classList.contains('open')) {
    const h = state.houses.find(x => x.id === Number(drawer.dataset.houseId));
    if (h) openDrawer(h);
  }
  if ($('#exportOverlay').classList.contains('open')) renderPdfPreview();
  updateLangPickerState();
}

function updateLangPickerState() {
  const lang = I18N.getLang();
  document.querySelectorAll('.lang-opt').forEach(b => {
    const on = b.dataset.lang === lang;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function toast(msg) {
  const w = $('#toastWrap');
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  w.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2400);
}

function countUp(el, target, dur = 950) {
  const t0 = performance.now();
  function step(t) {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * e).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function ripple(e) {
  const t = e.currentTarget;
  if (t.classList.contains('no-ripple')) return;
  const r = t.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2;
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.left = (e.clientX - r.left) + 'px';
  s.style.top = (e.clientY - r.top) + 'px';
  s.style.setProperty('--rs', size + 'px');
  t.appendChild(s);
  setTimeout(() => s.remove(), 640);
}

/* ---------------- scoring ---------------- */
function computeHouseStats(house) {
  if (_statsCache.has(house.id)) return _statsCache.get(house.id);
  const settings = state.settings;
  const dueDay = settingDueDay();
  const payments = paymentsForHouse(house.id);
  const today = todayDate();
  const created = house.created_month || currentMonthKey();

  const history = [];
  let k = created;
  const end = currentMonthKey();
  let guard = 0;

  while (k <= end) {
    if (++guard > 600) break;
    const { year, month } = parseMonthKey(k);
    const lastDay = new Date(year, month, 0).getDate();
    const effectiveDueDay = Math.min(dueDay, lastDay);
    const dueDate = new Date(year, month - 1, effectiveDueDay);
    const payment = paymentFor(house.id, k);

    let status = 'upcoming';
    let daysDiff = null;
    let paidDate = null;

    if (payment && payment.paid_date) {
      paidDate = new Date(payment.paid_date + 'T00:00:00');
      daysDiff = Math.round((paidDate - dueDate) / 86400000);
      status = daysDiff <= 0 ? 'ontime' : 'late';
    } else if (k === currentMonthKey()) {
      status = today <= dueDate ? 'upcoming' : 'overdue';
    } else if (k < currentMonthKey()) {
      status = 'missed';
    }

    history.push({ month: k, dueDate, status, daysDiff, paidDate, amount: payment ? payment.amount : null });

    // Move to next month
    if (k === end) break;
    const next = new Date(year, month, 1);
    k = next.getFullYear() + '-' + pad2(next.getMonth() + 1);
  }

  const resolved = history.filter(h => h.status !== 'upcoming');
  let currentStreak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].status === 'upcoming') continue;
    if (history[i].status === 'ontime') currentStreak++;
    else break;
  }

  let longest = 0, run = 0;
  for (const h of history) {
    if (h.status === 'upcoming') continue;
    if (h.status === 'ontime') { run++; longest = Math.max(longest, run); }
    else run = 0;
  }

  const onTimeCount = resolved.filter(h => h.status === 'ontime').length;
  const onTimeRate = resolved.length ? Math.round((onTimeCount / resolved.length) * 100) : 0;

  function monthlyPoints(entry) {
    if (entry.status === 'ontime') return SCORE_ON_TIME;
    if (entry.status === 'late') {
      const d = entry.daysDiff;
      if (d <= 3) return SCORE_LATE_MILD;
      if (d <= 7) return SCORE_LATE_MOD;
      return SCORE_LATE_SEVERE;
    }
    return 0;
  }

  const baseScore = resolved.reduce((sum, h) => sum + monthlyPoints(h), 0);
  const streakBonus = currentStreak * SCORE_STREAK_BONUS;
  const totalScore = baseScore + streakBonus;

  const result = { history, resolved, currentStreak, longestStreak: longest, onTimeRate, totalScore, baseScore, streakBonus };
  _statsCache.set(house.id, result);
  return result;
}

function scoreDots(score) {
  const s = Math.max(0, Math.min(100, score));
  const full = Math.floor(s / SCORE_DOT_DIVISOR);
  const half = s % SCORE_DOT_DIVISOR >= (SCORE_DOT_DIVISOR / 2) ? 1 : 0;
  let h = '<div class="score-dots">';
  for (let i = 0; i < 5; i++) h += `<span class="dot ${i < full ? 'filled' : (i === full && half ? 'half' : '')}"></span>`;
  return h + '</div>';
}

/* ---------------- render: stats ---------------- */
function renderStats(animate = true) {
  const houses = state.houses;
  const currentMK = currentMonthKey();
  const settings = state.settings;
  const currency = settings.currency || 'ETB';
  const guardSalary = settingGuardSalary();

  const gnEl = $('#guardName');
  if (gnEl) gnEl.textContent = settings.guard_name || I18N.t('guard_title');
  const gmEl = $('#guardMeta');
  if (gmEl) gmEl.textContent = settings.neighborhood_name || I18N.t('guard_meta');

  $('#statCurrency').textContent = currency;
  $('#statCurrency2').textContent = currency;

  let paid = 0, totalCollected = 0, totalExpected = 0;
  const statsByHouse = {};

  houses.forEach(h => {
    const stats = computeHouseStats(h);
    statsByHouse[h.id] = stats;
    totalExpected += h.fee;
    const cur = stats.history[stats.history.length - 1];
    if (cur && (cur.status === 'ontime' || cur.status === 'late')) {
      paid++;
      const payment = paymentFor(h.id, currentMK);
      totalCollected += payment ? (payment.amount || h.fee) : h.fee;
    }
  });

  const total = houses.length;
  const outstanding = totalExpected - totalCollected;
  const pct = total > 0 ? Math.round(paid / total * 100) : 0;
  const avgScore = total > 0 ? Math.round(houses.reduce((s, h) => s + (statsByHouse[h.id]?.totalScore || 0), 0) / total) : 0;

  const setNum = (id, v) => { const el = $('#' + id); if (animate) countUp(el, v); else el.textContent = v.toLocaleString(); };
  setNum('statCollected', totalCollected);
  setNum('statOutstanding', outstanding);
  setNum('statPct', pct);
  setNum('statScore', avgScore);

  const sealRing = $('#sealRing');
  const sealPct = $('#sealPct');
  if (sealRing && sealPct) {
    const CIRC = 182;
    sealRing.style.strokeDashoffset = (CIRC - (pct / 100) * CIRC).toFixed(1);
    sealPct.textContent = pct + '%';
  }

  $('#outstandingNote').textContent = I18N.t('dyn_households_unpaid', { n: (total - paid) });
  $('#pctNote').textContent = I18N.t('dyn_n_of_total', { n: paid, total: total });
  $('#scoreNote').textContent = I18N.t('dyn_avg_score', { n: avgScore });
  const collectedCompare = $('#collectedCompare');
  if (collectedCompare) collectedCompare.textContent = pct === 100 ? I18N.t('dyn_fully_collected') : formatMoney(outstanding) + ' ' + I18N.t('dyn_to_go');

  // completion band labels (previously unpopulated)
  const stripPaid = $('#stripPaid'); if (stripPaid) stripPaid.textContent = paid + ' ' + I18N.t('cb_paid');
  const stripPct = $('#stripPct'); if (stripPct) stripPct.textContent = pct + '% ' + I18N.t('cb_pct');
  const houseCount = $('#houseCount'); if (houseCount) houseCount.textContent = total + ' ' + (total === 1 ? I18N.t('cb_household') : I18N.t('cb_households_count'));

  $('#guardCollected').textContent = formatMoney(totalCollected);
  $('#guardSalary').textContent = formatMoney(guardSalary);
  $('#guardSurplus').textContent = formatMoney(totalCollected - guardSalary);

  renderTicks(houses);
  renderTimi(avgScore, pct);
  renderProgSquares(pct);
  renderGuardStats(statsByHouse);

  const sq = $('#progSquares');
  if (pct === 100 && total > 0) {
    if (!celebrated) { celebrated = true; sq.classList.add('celebrate'); toast(I18N.t('toast_fund_complete')); }
  } else {
    celebrated = false;
    sq.classList.remove('celebrate');
  }

  return statsByHouse;
}

function renderTicks(houses) {
  const strip = $('#tickStrip');
  strip.innerHTML = '';
  houses.forEach((n, i) => {
    const stats = computeHouseStats(n);
    const cur = stats.history[stats.history.length - 1];
    const isPaid = cur && (cur.status === 'ontime' || cur.status === 'late');
    const t = document.createElement('div');
    t.className = 'tick' + (isPaid ? ' paid' : '');
    t.dataset.tip = '#' + n.house_number + ' · <b>' + escapeHtml(n.name) + '</b>' + (isPaid ? ' · ' + I18N.t('paid_tick') : ' · ' + I18N.t('unpaid_tick'));
    t.style.animationDelay = (i * 18) + 'ms';
    strip.appendChild(t);
  });
}

function renderProgSquares(pct) {
  const wrap = $('#progSquares');
  const N = 50;
  const on = Math.round(pct / 100 * N);
  wrap.innerHTML = '';
  for (let i = 0; i < N; i++) {
    const s = document.createElement('div');
    s.className = 'sq' + (i < on ? ' on' : '');
    s.style.animationDelay = (i * 8) + 'ms';
    wrap.appendChild(s);
  }
}

function renderTimi(avgScore, pct) {
  const wrap = $('#timiDots');
  wrap.innerHTML = '';
  const filled = Math.round(avgScore / 20);
  for (let i = 0; i < 5; i++) {
    const d = document.createElement('div');
    d.className = 't ' + (i < filled ? 'filled' : (i === filled && avgScore % 20 >= 10 ? 'partial' : ''));
    d.style.flex = '1'; d.style.animationDelay = (i * 50) + 'ms';
    wrap.appendChild(d);
  }
  $('#timiNum').innerHTML = avgScore + '<small> / 100 ' + I18N.t('dyn_avg_suffix') + ' · ' + pct + '% ' + I18N.t('dyn_ontime_pct') + '</small>';
}

function renderGuardStats(statsByHouse) {
  // Calculate collection trend for sparkline
  const year = calYear;
  const monthlyData = [];
  for (let m = 0; m < 12; m++) {
    const mk = year + '-' + pad2(m + 1);
    monthlyData.push(monthCollected(mk));
  }

  renderSpark(monthlyData);
}

function renderSpark(vals) {
  const el = $('#spark');
  if (!el) return;
  if (vals.length < 2 || vals.every(v => v === 0)) { el.innerHTML = '<div class="spark-empty">—</div>'; return; }
  const w = 320, h = 140, pad = { t: 16, r: 12, b: 28, l: 44 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...vals);
  const min = 0;
  const range = max - min || 1;
  const n = vals.length;
  const barW = Math.max(8, (iw / n) - 6);
  const gap = (iw - barW * n) / (n - 1);

  const months = MONTHS;

  // Y-axis ticks (3 grid lines)
  let gridHtml = '';
  const yTicks = [0, Math.round(max / 2), max];
  for (const tv of yTicks) {
    const ty = pad.t + ih - (tv - min) / range * ih;
    gridHtml += '<line class="spark-grid" x1="' + pad.l + '" y1="' + ty + '" x2="' + (w - pad.r) + '" y2="' + ty + '"/>';
    gridHtml += '<text class="spark-y-label" x="' + (pad.l - 6) + '" y="' + (ty + 4) + '">' + tv.toLocaleString() + '</text>';
  }

  // Bars + x-labels
  let barHtml = '';
  for (let i = 0; i < n; i++) {
    const bx = pad.l + i * (barW + gap);
    const bh = (vals[i] - min) / range * ih;
    const by = pad.t + ih - bh;
    const pct = max > 0 ? (vals[i] / max * 100) : 0;
    barHtml += '<rect class="spark-bar" x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + Math.max(1, bh) + '" rx="3" style="animation-delay:' + (i * 0.04) + 's"/>';
    barHtml += '<text class="spark-x-label" x="' + (bx + barW / 2) + '" y="' + (h - pad.b + 16) + '">' + months[i].substring(0, 3) + '</text>';
    // Value label on top of bar (only if bar is tall enough)
    if (bh > 18) {
      barHtml += '<text class="spark-val" x="' + (bx + barW / 2) + '" y="' + (by - 5) + '">' + vals[i].toLocaleString() + '</text>';
    }
  }

  el.innerHTML =
    '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' +
    gridHtml + barHtml +
    '</svg>';
}

/* ---------------- render: calendar ---------------- */
function heatColor(c) {
  if (c <= 0) return 'var(--bg)';
  if (c <= 1) return 'var(--heat-1)';
  if (c <= 2) return 'var(--heat-2)';
  if (c <= 3) return 'var(--heat-3)';
  if (c <= 4) return 'var(--heat-4)';
  return 'var(--heat-5)';
}

function calendarData(year, monthIdx) {
  const mk = year + '-' + pad2(monthIdx + 1);
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const counts = new Array(daysInMonth).fill(0);
  const names = Array.from({ length: daysInMonth }, () => []);

  state.houses.forEach(h => {
    const payment = paymentFor(h.id, mk);
    if (payment && payment.paid_date) {
      const d = new Date(payment.paid_date + 'T00:00:00');
      if (d.getFullYear() === year && d.getMonth() === monthIdx) {
        const day = d.getDate() - 1;
        if (day >= 0 && day < daysInMonth) {
          counts[day]++;
          names[day].push(h.name.split(/\s+/)[0]);
        }
      }
    }
  });

  return { counts, names };
}

function renderCalendar() {
  const { counts, names } = calendarData(calYear, calMonth);
  const totalPaid = counts.reduce((a, b) => a + b, 0);

  $('#calMonth').textContent = MONTHS[calMonth];
  $('#calYear').textContent = calYear;
  $('#calCount').textContent = totalPaid;

  $('#editionMonth').textContent = MONTHS[calMonth] + ' ' + calYear;
  $('#editionIssue').textContent = I18N.t('dyn_issue_no', { nn: pad2(calMonth + 1), n: state.houses.length });

  const hm = $('#heatmap');
  hm.innerHTML = '';
  const empty = totalPaid <= 0;
  for (let d = 0; d < counts.length; d++) {
    const c = counts[d];
    const cell = document.createElement('div');
    cell.className = 'heat-cell' + (empty ? ' empty' : '');
    cell.style.background = empty ? 'var(--bg)' : heatColor(c);
    cell.style.animationDelay = (d * 9) + 'ms';
    cell.textContent = empty ? '' : c;
      if (!empty && c > 0) cell.style.color = 'var(--fg)';
      if (!empty) {
        const who = names[d].length ? ' · ' + names[d].join(', ') : '';
        cell.dataset.tip = MONTHS[calMonth] + ' ' + (d + 1) + ', ' + calYear + ' — <b>' + c + '</b> ' + I18N.t('heatmap_collect') + who;
      }
    hm.appendChild(cell);
  }
}

/* ---------------- render: ledger ---------------- */
/* ---------------- list diff-patch (fixes the "whole list flashes on refresh" bug) ----------------
   Previously every render of the ledger/history/leaderboard did container.innerHTML = '' then
   rebuilt every row from scratch — including the 'row-enter' fade-in animation on ALL of them.
   That meant toggling a single payment (which triggers a full refreshAll()) made the entire
   table blink off and back on for a moment, even though only one row's data actually changed.
   This patches the DOM in place: existing rows are reused/moved, only rows that are new (or
   newly matching a filter) get the entrance animation. */
function patchRows(container, items, keyFn, rowHtmlFn, emptyHtml, tag = 'tr') {
  if (container.querySelector(':scope > ' + tag + '.empty-row')) container.innerHTML = '';
  if (!items.length) { container.innerHTML = emptyHtml; return; }

  const existing = new Map();
  container.querySelectorAll(':scope > ' + tag + '[data-id]').forEach(el => existing.set(el.dataset.id, el));

  let cursor = container.firstChild;
  items.forEach((item, i) => {
    const key = String(keyFn(item));
    let el = existing.get(key);
    if (el) {
      existing.delete(key);
      el.innerHTML = rowHtmlFn(item, i);
    } else {
      el = document.createElement(tag);
      el.dataset.id = key;
      el.classList.add('row-enter');
      el.style.animationDelay = (Math.min(i, 12) * 22) + 'ms';
      el.innerHTML = rowHtmlFn(item, i);
    }
    if (cursor !== el) container.insertBefore(el, cursor);
    else cursor = cursor.nextSibling;
  });
  existing.forEach(el => el.remove());
}

function renderLedger() {
  const body = $('#ledgerBody');
  let list = state.houses.slice();

  if (filterMode === 'score') {
    list.sort((a, b) => {
      const sa = computeHouseStats(a);
      const sb = computeHouseStats(b);
      return sb.totalScore - sa.totalScore;
    });
  } else if (filterMode === 'house') {
    list.sort((a, b) => parseInt(a.house_number) - parseInt(b.house_number));
  }

  // Status filter
  if (statusFilter !== 'all') {
    list = list.filter(n => {
      const cur = computeHouseStats(n).history.at(-1);
      const isPaid = cur && (cur.status === 'ontime' || cur.status === 'late');
      if (statusFilter === 'paid') return isPaid;
      if (statusFilter === 'unpaid') return !isPaid;
      if (statusFilter === 'flagged') return isReminded(n.id);
      return true;
    });
  }

  // Tokenized search — every token must match house number or name (space/diacritic tolerant)
  const q = normalizeText(searchQuery);
  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    list = list.filter(n => {
      const hay = normalizeText('#' + n.house_number + ' ' + n.name);
      return tokens.every(t => hay.includes(t));
    });
  }

  const currentMK = currentMonthKey();

  if (!list.length) {
    const msg = searchQuery.trim()
      ? I18N.t('dyn_no_match', { query: escapeHtml(searchQuery.trim()) })
      : (statusFilter !== 'all' ? I18N.t('dyn_no_status', { status: statusFilter }) : I18N.t('dyn_no_households'));
    body.innerHTML = `<tr class="empty-row"><td colspan="5">${msg}</td></tr>`;
    return;
  }

  patchRows(body, list, n => n.id, (n, i) => {
    const stats = computeHouseStats(n);
    const cur = stats.history[stats.history.length - 1];
    const isPaid = cur && (cur.status === 'ontime' || cur.status === 'late');
    const flagged = isReminded(n.id);
    return `
      <td class="house" data-label="House"><span class="avatar">${initials(n.name)}</span><span style="margin-left:9px">#${escapeHtml(n.house_number)}</span></td>
      <td class="name" data-label="Resident">${escapeHtml(n.name)}</td>
       <td class="score-col" data-label="Score">${scoreDots(stats.totalScore)}</td>
       <td data-label="Status"><button class="status-toggle ${isPaid ? 'paid' : 'unpaid'}" data-act="toggle" data-id="${n.id}" aria-label="Toggle paid status"><span class="pip"></span>${isPaid ? I18N.t('action_mark_paid') : I18N.t('drawer_unpaid')}</button></td>
       <td data-label="Action" style="text-align:right">
         <div class="row-actions">
           ${isPaid
             ? `<button class="act-btn" data-act="unpay" data-id="${n.id}">${I18N.t('action_revert')}</button>`
             : `<button class="act-btn" data-act="pay" data-id="${n.id}">${I18N.t('action_mark_paid')}</button>
                ${flagged
                  ? `<button class="act-btn remind flagged" data-act="unremind" data-id="${n.id}" title="${I18N.t('action_flag_clear')}">${I18N.t('action_flagged')}</button>`
                  : `<button class="act-btn remind" data-act="remind" data-id="${n.id}">${I18N.t('action_remind')}</button>`}`}
           <button class="act-btn icon-btn" data-act="edit" data-id="${n.id}" title="${I18N.t('action_edit_label')}" aria-label="${I18N.t('action_edit_label')}">✎</button>
         </div>
       </td>`;
  }, '');

  body.querySelectorAll(':scope > tr[data-id]').forEach(tr => { tr.style.cursor = 'pointer'; });

  // Bind events
  body.querySelectorAll('.status-toggle, .act-btn').forEach(btn => {
    btn.addEventListener('click', ripple);
  });
}

/* ---------------- render: history ---------------- */
function renderHistory() {
  const body = $('#historyBody');
  const mk = histYear + '-' + pad2(histMonth + 1);

  $('#histMonth').textContent = MONTHS[histMonth] + ' ' + histYear;

  patchRows(body, state.houses, h => h.id, (h, i) => {
    const stats = computeHouseStats(h);
    const entry = stats.history.find(e => e.month === mk);
    const status = entry ? entry.status : 'upcoming';
    const paidDate = entry && entry.paidDate ? entry.paidDate.toLocaleDateString() : '—';
    const amount = entry && entry.amount ? formatMoney(entry.amount) : '—';
    return `
      <td class="house" data-label="House"><span class="avatar">${initials(h.name)}</span><span style="margin-left:9px">#${escapeHtml(h.house_number)} ${escapeHtml(h.name)}</span></td>
      <td data-label="Status"><span class="status ${status === 'ontime' || status === 'late' ? 'paid' : 'unpaid'}"><span class="pip"></span>${statusLabel(status)}</span></td>
      <td data-label="Paid Date">${paidDate}</td>
      <td class="amt" data-label="Amount">${amount}</td>
      <td data-label="Action" style="text-align:right">
        <button class="act-btn" data-act="toggle" data-id="${h.id}" data-month="${mk}">${status === 'ontime' || status === 'late' ? I18N.t('action_toggle_revert') : I18N.t('action_toggle_mark_paid')}</button>
      </td>`;
  }, `<tr class="empty-row"><td colspan="5">${I18N.t('dyn_no_households')}</td></tr>`);
}

/* ---------------- render: leaderboard ---------------- */
function renderLeaderboard() {
  const list = $('#leaderboardList');
  if (!state.houses.length) {
    list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">' + I18N.t('dyn_no_houses') + '</div>';
    return;
  }

  const ranked = state.houses.map(h => ({ house: h, stats: computeHouseStats(h) }))
    .sort((a, b) => b.stats.currentStreak - a.stats.currentStreak || b.stats.totalScore - a.stats.totalScore);

  patchRows(list, ranked, ({ house }) => house.id, ({ house, stats }, i) => {
    const spark = stats.history.slice(-6).map(h => {
      const cls = h.status === 'ontime' ? 'sp-paid' : (h.status === 'late' ? 'sp-late' : (h.status === 'upcoming' ? '' : 'sp-missed'));
      return `<span class="spark-dot ${cls}" title="${monthLabel(h.month)}: ${h.status}"></span>`;
    }).join('');

    return `
        <div class="leader-rank">${i + 1}</div>
        <div>
          <div class="leader-name">${escapeHtml(house.name)}</div>
          <div class="leader-sub">${stats.onTimeRate}% ${I18N.t('dyn_on_time')} · ${I18N.t('drawer_longest_streak')} ${stats.longestStreak}</div>
          <div class="sparkline">${spark}</div>
        </div>
        <div class="leader-streak">${stats.currentStreak > 0 ? '🔥 ' + stats.currentStreak + ' ' + I18N.t('dyn_mo') : '—'}</div>
        <div class="leader-score">${stats.totalScore} ${I18N.t('dyn_pts')}</div>`;
  }, '', 'div');

  list.querySelectorAll(':scope > div[data-id]').forEach(el => el.classList.add('leader-row'));
}

/* ---------------- analytics helpers ---------------- */
// The fee a house was actually charged during a given month, using the
// fee_change history recorded on the backend (fee_change table). Falls back
// to the house's current fee if it has never had a fee change recorded.
// This matters anywhere a month's "expected" or "collected" total is being
// reconstructed rather than read from an actual stored payment.amount —
// without it, every past month silently used *today's* fee, which is wrong
// for any house whose fee has ever changed.
function historicalFee(house, monthKey) {
  const changes = (state.fee_change || [])
    .filter(fc => fc.house_id === house.id)
    .map(fc => ({ month: String(fc.changed_at || '').slice(0, 7), new_fee: Number(fc.new_fee), old_fee: Number(fc.old_fee) }))
    .sort((a, b) => a.month.localeCompare(b.month));
  if (!changes.length) return Number(house.fee) || 0;
  let fee = Number.isFinite(changes[0].old_fee) ? changes[0].old_fee : (Number(house.fee) || 0);
  for (const c of changes) {
    if (monthKey >= c.month) fee = c.new_fee;
    else break;
  }
  return fee;
}

function monthExpected(mk) {
  const monthKey = mk || currentMonthKey();
  return state.houses.reduce((s, h) => {
    if (h.created_month && h.created_month > monthKey) return s; // house hadn't joined yet
    return s + (historicalFee(h, monthKey) || 0);
  }, 0);
}

function monthCollected(mk) {
  let c = 0;
  state.houses.forEach(h => {
    if (h.created_month && h.created_month > mk) return;
    const payment = paymentFor(h.id, mk);
    if (payment && payment.paid_date) c += (Number(payment.amount) || historicalFee(h, mk) || 0);
  });
  return c;
}

function monthOnTimePct(mk) {
  const { year, month } = parseMonthKey(mk);
  const dueDay = parseInt(state.settings.due_day) || 5;
  const lastDay = new Date(year, month, 0).getDate();
  const effectiveDueDay = Math.min(dueDay, lastDay);
  const dueDate = new Date(year, month - 1, effectiveDueDay);
  let onTime = 0, total = 0;
  state.houses.forEach(h => {
    if (h.created_month && h.created_month > mk) return; // house hadn't joined yet
    total++;
    const payment = paymentFor(h.id, mk);
    if (payment && payment.paid_date) {
      const paidDate = new Date(payment.paid_date + 'T00:00:00');
      const daysDiff = Math.round((paidDate - dueDate) / 86400000);
      if (daysDiff <= 0) onTime++;
    }
  });
  return total > 0 ? Math.round(onTime / total * 100) : 0;
}

function getYearData(year) {
  const months = [];
  let totalCollected = 0, totalExpected = 0, pctSum = 0, pctCount = 0;
  const now = new Date();
  const limit = year < now.getFullYear() ? 12 : (year > now.getFullYear() ? 0 : now.getMonth() + 1);
  for (let m = 0; m < 12; m++) {
    const mk = year + '-' + pad2(m + 1);
    const expected = monthExpected(mk);
    const collected = monthCollected(mk);
    const onTime = monthOnTimePct(mk);
    months.push({ mk, label: MONTHS[m], short: MONTHS[m].slice(0, 3), collected, expected, onTime,
      full: expected > 0 && collected >= expected });
    totalCollected += collected;
    if (m < limit) { totalExpected += expected; pctSum += expected > 0 ? Math.round(collected / expected * 100) : 0; pctCount++; }
  }
  const completion = pctCount > 0 ? Math.round(pctSum / pctCount) : 0;
  // Kept as a single top-level figure for callers that just want "this month's
  // expected total" (e.g. chart axis fallback) — each month's own accurate
  // figure lives on months[i].expected and is what should be used for totals.
  const expected = monthExpected(currentMonthKey());
  return { year, expected, months, totalCollected, totalExpected, completion, active: state.houses.length };
}

/* ---------------- render: year summary ---------------- */
function renderYearSummary() {
  const data = getYearData(anaYear);
  $('#anaYearLabel').textContent = anaYear;
  const cards = [
    { label: I18N.t('summary_total_collected'), value: formatMoney(data.totalCollected), cls: 'green', sub: I18N.t('summary_paid_year') },
    { label: I18N.t('summary_total_expected'), value: formatMoney(data.totalExpected), cls: 'accent', sub: I18N.t('summary_through', { month: (anaYear === new Date().getFullYear() ? MONTHS[new Date().getMonth()] : I18N.MONTHS_SHORT()[11]) }) },
    { label: I18N.t('summary_completion_rate'), value: data.completion + '%', cls: 'accent', sub: I18N.t('summary_avg_month') },
    { label: I18N.t('summary_active'), value: String(data.active), cls: '', sub: I18N.t('summary_in_register') }
  ];
  $('#summaryCards').innerHTML = cards.map((c, i) => `
    <div class="summary-card ${c.cls}">
      <div class="sc-label">${c.label}</div>
      <div class="sc-value num">${c.value}</div>
      <div class="sc-sub">${c.sub}</div>
    </div>`).join('');
}

/* ---------------- render: monthly bar chart ---------------- */
function compactNum(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k';
  return String(Math.round(n));
}

function renderYearChart() {
  const data = getYearData(anaYear);
  const W = 720, H = 250, padL = 52, padR = 16, padTop = 26, padBottom = 34;
  const maxV = Math.max(...data.months.map(m => m.expected), ...data.months.map(m => m.collected), 1);
  const plotW = W - padL - padR, plotH = H - padTop - padBottom;
  const bw = plotW / 12 * 0.62;
  const gap = plotW / 12;
  const y = v => padTop + plotH - (v / maxV) * plotH;

  let bars = '', labels = '', grid = '', axis = '';
  for (let i = 0; i < 4; i++) {
    const gv = maxV * (i / 3);
    grid += `<line x1="${padL}" y1="${y(gv)}" x2="${W - padR}" y2="${y(gv)}" class="grid-line"/>`;
    axis += `<text x="${padL - 8}" y="${(y(gv) + 3).toFixed(1)}" class="axis-label" text-anchor="end">${compactNum(gv)}</text>`;
  }
  data.months.forEach((m, i) => {
    const x = padL + gap * i + (gap - bw) / 2;
    const cx = padL + gap * i + gap / 2;
    const bh = m.collected > 0 ? Math.max(2, y(0) - y(m.collected)) : 0;
    const fill = m.full ? 'var(--green)' : 'var(--accent)';
    const tip = `${m.label} ${data.year}: ${formatMoney(m.collected)} ${I18N.t('heatmap_collect')}` + (m.expected ? ` / ${formatMoney(m.expected)} ${I18N.t('heatmap_expected')}` : '');
    bars += `<rect class="bar" x="${x.toFixed(1)}" y="${(m.collected > 0 ? y(m.collected) : y(0)).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${fill}" data-tip="${escapeHtml(tip)}" style="animation-delay:${i * 28}ms"></rect>`;
    if (m.collected > 0) {
      labels += `<text x="${cx.toFixed(1)}" y="${(y(m.collected) - 6).toFixed(1)}" class="bar-value">${compactNum(m.collected)}</text>`;
    }
    labels += `<text x="${cx.toFixed(1)}" y="${H - 12}" class="bar-label">${m.short}</text>`;
  });

  $('#yearChart').innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly collection ${data.year}">${grid}${axis}${bars}${labels}</svg>`;

  const totals = $('#yearChartTotals');
  if (totals) {
    const bestMonth = data.months.reduce((a, b) => b.collected > a.collected ? b : a, data.months[0]);
    const avgMonth = Math.round(data.totalCollected / (data.months.filter(m => m.collected > 0).length || 1));
    totals.innerHTML =
      `<div class="ct-item"><span class="ct-l">${I18N.t('chart_year_total')}</span><span class="ct-v green">${formatMoney(data.totalCollected)}</span></div>` +
      `<div class="ct-item"><span class="ct-l">${I18N.t('chart_expected')}</span><span class="ct-v">${formatMoney(data.totalExpected)}</span></div>` +
      `<div class="ct-item"><span class="ct-l">${I18N.t('chart_best_month')}</span><span class="ct-v">${escapeHtml(bestMonth.label)} · ${formatMoney(bestMonth.collected)}</span></div>` +
      `<div class="ct-item"><span class="ct-l">${I18N.t('chart_avg_active')}</span><span class="ct-v">${formatMoney(avgMonth)}</span></div>`;
  }
}

/* ---------------- render: on-time area chart ---------------- */
function renderOnTimeChart() {
  const data = getYearData(anaYear);
  const W = 720, H = 230, padL = 44, padR = 16, padTop = 26, padBottom = 34;
  const plotW = W - padL - padR, plotH = H - padTop - padBottom;
  const x = i => padL + (plotW / 11) * i;
  const y = v => padTop + plotH - (v / 100) * plotH;

  let line = '', area = '', dots = '', labels = '', grid = '', axis = '';
  [0, 25, 50, 75, 100].forEach(gv => {
    grid += `<line x1="${padL}" y1="${y(gv)}" x2="${W - padR}" y2="${y(gv)}" class="grid-line"/>`;
    axis += `<text x="${padL - 8}" y="${(y(gv) + 3).toFixed(1)}" class="axis-label" text-anchor="end">${gv}%</text>`;
  });

  data.months.forEach((m, i) => {
    const px = x(i).toFixed(1), py = y(m.onTime).toFixed(1);
    line += (i === 0 ? 'M' : ' L') + px + ' ' + py;
    dots += `<circle class="ot-dot" cx="${px}" cy="${py}" r="3.5" data-tip="${escapeHtml(m.label)}: ${m.onTime}% ${I18N.t('dyn_ontime_pct')}" style="animation-delay:${i * 28}ms"></circle>`;
    if (m.onTime > 0) {
      labels += `<text x="${px}" y="${(y(m.onTime) - 9).toFixed(1)}" class="bar-value">${m.onTime}%</text>`;
    }
    labels += `<text x="${px}" y="${H - 12}" class="bar-label">${m.short}</text>`;
  });
  area = 'M' + x(0).toFixed(1) + ' ' + y(0).toFixed(1) +
    data.months.map((m, i) => ' L' + x(i).toFixed(1) + ' ' + y(m.onTime).toFixed(1)).join('') +
    ' L' + x(11).toFixed(1) + ' ' + y(0).toFixed(1) + ' Z';

  $('#onTimeChart').innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="On-time rate ${data.year}">
      <defs><linearGradient id="otGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--green)" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="var(--green)" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}${axis}<path class="ot-area" d="${area}" fill="url(#otGrad)"/>
      <path class="ot-line" d="${line}"/>
      ${dots}${labels}</svg>`;

  const totals = $('#onTimeTotals');
  if (totals) {
    const active = data.months.filter(m => m.onTime > 0);
    const avgOnTime = active.length ? Math.round(active.reduce((s, m) => s + m.onTime, 0) / active.length) : 0;
    const best = data.months.reduce((a, b) => b.onTime > a.onTime ? b : a, data.months[0]);
    totals.innerHTML =
      `<div class="ct-item"><span class="ct-l">${I18N.t('chart_avg_ontime')}</span><span class="ct-v green">${avgOnTime}%</span></div>` +
      `<div class="ct-item"><span class="ct-l">${I18N.t('chart_best_month')}</span><span class="ct-v">${escapeHtml(best.label)} · ${best.onTime}%</span></div>` +
      `<div class="ct-item"><span class="ct-l">${I18N.t('chart_months_tracked')}</span><span class="ct-v">${active.length}</span></div>`;
  }
}

/* ---------------- render: household scorecards ---------------- */
function renderScorecards() {
  const grid = $('#scorecardGrid');
  if (!state.houses.length) {
    grid.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted)">' + I18N.t('dyn_no_scorecards') + '</div>';
    return;
  }
  const ranked = state.houses
    .map(h => ({ house: h, stats: computeHouseStats(h) }))
    .sort((a, b) => b.stats.totalScore - a.stats.totalScore);

  grid.innerHTML = ranked.map(({ house: h, stats }, i) => {
    const cur = stats.history[stats.history.length - 1];
    const isPaid = cur && (cur.status === 'ontime' || cur.status === 'late');
    return `
      <div class="scorecard" style="animation-delay:${Math.min(i, 14) * 24}ms">
        <div class="sc-head">
          <span class="sc-rank">#${i + 1}</span>
          <div class="sc-id">
            <div class="sc-name"><span class="sc-dot ${isPaid ? 'paid' : 'unpaid'}"></span>${escapeHtml(h.name)}</div>
            <div class="sc-house">#${escapeHtml(h.house_number)} · ${isPaid ? I18N.t('sc_house_paid') : I18N.t('sc_house_unpaid')}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderAnalytics() {
  renderYearSummary();
  renderYearChart();
  renderOnTimeChart();
  renderScorecards();
}

/* ---------------- reminders (bell + panel) ---------------- */
function pulseBell() {
  const bell = $('#bellBtn');
  if (!bell) return;
  bell.classList.remove('ring');
  void bell.offsetWidth;
  bell.classList.add('ring');
}

function renderReminders() {
  const count = state.reminders.length;
  const badge = $('#bellCount');
  if (badge) {
    badge.textContent = count;
    badge.classList.toggle('show', count > 0);
  }
  const bell = $('#bellBtn');
  if (bell) bell.classList.toggle('has-items', count > 0);

  const panel = $('#reminderList');
  if (!panel) return;
  if (!count) {
    panel.innerHTML = '<div class="rem-empty">' + I18N.t('rem_empty_main') + '<br><span>' + I18N.t('rem_empty_sub') + '</span></div>';
    return;
  }
  panel.innerHTML = state.reminders.map((r, i) => {
    const h = state.houses.find(x => x.id === r.house_id);
    const stats = h ? computeHouseStats(h) : null;
    const cur = stats ? stats.history[stats.history.length - 1] : null;
    const isPaid = cur && (cur.status === 'ontime' || cur.status === 'late');
    return `
      <div class="rem-item" style="animation-delay:${Math.min(i, 10) * 40}ms">
        <div class="rem-avatar">${escapeHtml(initials(r.house_name || ''))}</div>
        <div class="rem-main">
          <div class="rem-name">#${escapeHtml(r.house_number)} · ${escapeHtml(r.house_name || '')}</div>
          <div class="rem-sub">${isPaid ? I18N.t('rem_now_paid') : (r.note ? escapeHtml(r.note) : I18N.t('rem_flagged'))}</div>
        </div>
        <button class="rem-done" data-act="resolve-reminder" data-id="${r.house_id}" aria-label="Clear reminder">✓</button>
      </div>`;
  }).join('');
}

function openReminderPanel() { $('#reminderPanel').classList.add('open'); }
function closeReminderPanel() { $('#reminderPanel').classList.remove('open'); }

/* ---------------- detail drawer ---------------- */
function openDrawer(house) {
  const stats = computeHouseStats(house);
  const cur = stats.history[stats.history.length - 1];
  const isPaid = cur && (cur.status === 'ontime' || cur.status === 'late');

  $('#drawer').dataset.houseId = house.id;
  $('#drawerHouse').textContent = I18N.t('drawer_house_prefix') + house.house_number;
  $('#drawerName').textContent = house.name;

  const tier = stats.totalScore >= TIER_EXCELLENT_MIN ? I18N.t('tier_excellent') : stats.totalScore >= TIER_RELIABLE_MIN ? I18N.t('tier_reliable') : stats.totalScore >= TIER_INCONSISTENT_MIN ? I18N.t('tier_inconsistent') : I18N.t('tier_at_risk');

  const monthsWord = n => n + ' ' + (n === 1 ? I18N.t('drawer_month') : I18N.t('drawer_months'));
  $('#drawerBody').innerHTML = `
    <div class="drawer-row"><span class="k">${I18N.t('drawer_payment_status')}</span><span class="v"><span class="status ${isPaid ? 'paid' : 'unpaid'}"><span class="pip" style="background:${isPaid ? 'var(--green)' : 'var(--danger)'}"></span>${isPaid ? I18N.t('drawer_paid') : I18N.t('drawer_unpaid')}</span></span></div>
    <div class="drawer-row"><span class="k">${I18N.t('drawer_monthly_contribution')}</span><span class="v big">${formatMoney(house.fee)}</span></div>
    <div class="drawer-row"><span class="k">${I18N.t('drawer_timeliness_score')}</span><span class="v">${stats.totalScore} / 100 ${scoreDots(stats.totalScore)}</span></div>
    <div class="drawer-row"><span class="k">${I18N.t('drawer_current_streak')}</span><span class="v">${stats.currentStreak > 0 ? '🔥 ' + stats.currentStreak + ' ' + I18N.t('drawer_months') : I18N.t('drawer_none')}</span></div>
    <div class="drawer-row"><span class="k">${I18N.t('drawer_longest_streak')}</span><span class="v">${monthsWord(stats.longestStreak)}</span></div>
    <div class="drawer-row"><span class="k">${I18N.t('drawer_ontime_rate')}</span><span class="v">${stats.onTimeRate}%</span></div>
    <div class="drawer-row"><span class="k">${I18N.t('drawer_reliability_tier')}</span><span class="v">${tier}</span></div>
    <div class="drawer-row"><span class="k">${I18N.t('drawer_months_tracked')}</span><span class="v">${stats.resolved.length}</span></div>
    <div class="drawer-actions">
      <button class="act-btn primary-act" data-act="toggle" data-id="${house.id}">${isPaid ? I18N.t('drawer_revert') : I18N.t('drawer_mark_as_paid')}</button>
      <button class="act-btn" data-act="edit" data-id="${house.id}">${I18N.t('drawer_edit')}</button>
      <button class="act-btn ${isReminded(house.id) ? 'flagged' : 'remind'}" data-act="${isReminded(house.id) ? 'unremind' : 'remind'}" data-id="${house.id}">${isReminded(house.id) ? I18N.t('drawer_clear_flag') : I18N.t('drawer_flag_to_remind')}</button>
    </div>`;
  $('#drawer').classList.add('open');
}

function closeDrawer() { $('#drawer').classList.remove('open'); }

/* ---------------- actions ---------------- */
async function toggleHouse(house, monthKey = currentMonthKey()) {
  try {
    await api('/api/payments/toggle', 'POST', { house_id: house.id, month_key: monthKey });
    toast(I18N.t('toast_toggled', { name: house.name, month: monthLabel(monthKey) }));
    await refreshAll();
  } catch (e) {
    toast(e.message || I18N.t('toast_toggle_failed'));
  }
}

function isReminded(houseId) {
  return state.reminders.some(r => r.house_id === houseId);
}

// Most common fee among existing households (falls back to default_fee setting)
function typicalFee() {
  const counts = {};
  state.houses.forEach(h => { const f = Number(h.fee) || 0; if (f) counts[f] = (counts[f] || 0) + 1; });
  let best = settingDefaultFee(), bestCount = 0;
  Object.keys(counts).forEach(f => { if (counts[f] > bestCount) { bestCount = counts[f]; best = Number(f); } });
  return best;
}

async function flagReminder(house, note = '') {
  try {
    await api('/api/reminders/add', 'POST', { house_id: house.id, note });
    toast(I18N.t('toast_flagged_name', { name: house.name }));
    await refreshAll();
    pulseBell();
  } catch (e) {
    toast(e.message || I18N.t('toast_flag_failed'));
  }
}

async function resolveReminder(houseId) {
  try {
    await api('/api/reminders/resolve', 'POST', { house_id: houseId });
    await refreshAll();
  } catch (e) {
    toast(e.message || I18N.t('toast_reminder_failed'));
  }
}

/* ---------------- modals ---------------- */
function openModal(id) { $('#' + id).classList.add('open'); }
function closeModal(id) { $('#' + id).classList.remove('open'); }

/* ---------------- edit household ---------------- */
function openEdit(house) {
  editContext = house.id;
  const stats = computeHouseStats(house);
  const cur = stats.history[stats.history.length - 1];
  const isPaid = cur && (cur.status === 'ontime' || cur.status === 'late');
  const flagged = isReminded(house.id);
  const payment = paymentFor(house.id, currentMonthKey());

  $('#editHouse').value = house.house_number;
  $('#editName').value = house.name;
  $('#editFee').value = house.fee;
  $('#editNotes').value = house.notes || '';
  $('#editPaidDate').value = payment && payment.paid_date ? payment.paid_date : '';
  $('#editAmount').value = payment && payment.amount ? payment.amount : '';

  $('#editMetaScore').textContent = stats.totalScore + ' ' + I18N.t('edit_pts');
  $('#editMetaStreak').textContent = stats.currentStreak > 0 ? stats.currentStreak + ' ' + I18N.t('dyn_mo') : I18N.t('edit_no_streak');
  $('#editMetaRate').textContent = stats.onTimeRate + '% ' + I18N.t('edit_on_time');

  const statusBtn = $('#editToggleStatus');
  statusBtn.textContent = (isPaid ? I18N.t('edit_mark_unpaid') : I18N.t('edit_mark_paid')) + ' (' + monthLabel(currentMonthKey()) + ')';
  statusBtn.dataset.paid = isPaid ? '1' : '0';

  const flagBtn = $('#editToggleFlag');
  flagBtn.textContent = flagged ? I18N.t('action_clear_reminder') : I18N.t('edit_flag');
  flagBtn.dataset.flagged = flagged ? '1' : '0';

  openModal('editOverlay');
  setTimeout(() => $('#editName').focus(), 60);
}

async function saveEdit() {
  if (!editContext) return;
  const house = state.houses.find(h => h.id === editContext);
  if (!house) return;
  const name = $('#editName').value.trim();
  const house_number = $('#editHouse').value.trim();
  const fee = parseInt($('#editFee').value);
  const notes = $('#editNotes').value;
  if (!name || !house_number) { toast(I18N.t('toast_name_required')); return; }
  if (isNaN(fee) || fee < 0) { toast(I18N.t('toast_fee_invalid')); return; }
  try {
    await api('/api/houses/update', 'POST', { id: house.id, name, house_number, fee, notes });
    // Optional payment date/amount edit for current month
    const pd = $('#editPaidDate').value;
    const amt = $('#editAmount').value;
    if (pd) {
      await api('/api/payments/update', 'POST', {
        house_id: house.id, month_key: currentMonthKey(),
        paid_date: pd, amount: amt ? parseInt(amt) : fee
      });
    }
    toast(I18N.t('toast_saved', { name }));
    closeModal('editOverlay');
    editContext = null;
    await refreshAll();
    if ($('#drawer').classList.contains('open')) { const h = state.houses.find(x => x.id === house.id); if (h) openDrawer(h); }
  } catch (e) {
    toast(e.message || I18N.t('toast_save_failed'));
  }
}

async function deleteEdit() {
  if (!editContext) return;
  const house = state.houses.find(h => h.id === editContext);
  if (!house) return;
  if (!confirm(I18N.t('confirm_remove', { num: house.house_number, name: house.name }))) return;
  try {
    await api('/api/houses/delete', 'POST', { id: house.id });
    toast(I18N.t('toast_removed', { name: house.name }));
    closeModal('editOverlay');
    editContext = null;
    closeDrawer();
    await refreshAll();
  } catch (e) {
    toast(e.message || I18N.t('toast_remove_failed'));
  }
}

/* ---------------- export ---------------- */
function selectedFields() {
  return [...$$('#fieldCols input:checked')].map(i => i.dataset.field);
}

const FIELD_LABELS = {
  house: I18N.t('field_house'), name: I18N.t('field_name'), amount: I18N.t('field_amount'), paid: I18N.t('field_paid'),
  score: I18N.t('field_score'), date: I18N.t('field_date'), total: I18N.t('field_total'), unpaid: I18N.t('field_unpaid')
};

function syncExportLayout() {
  const isPdf = expFmt === 'pdf';
  const isCsv = expFmt === 'csv';
  const pdfGroup = $('#pdfTplGroup');
  const fieldsGroup = $('#fieldsGroup');
  const typeGroup = $('#typeGroup');
  if (pdfGroup) pdfGroup.classList.toggle('show', isPdf);
  if (fieldsGroup) fieldsGroup.style.display = isCsv ? '' : 'none';
  if (typeGroup) typeGroup.style.display = isCsv ? '' : 'none';
}

const PDF_TEMPLATE_LABELS = {
  monthly: I18N.t('export_tpl_monthly'),
  guard: I18N.t('export_tpl_guard'),
  scorecard: I18N.t('export_tpl_scorecard'),
  outstanding: I18N.t('export_tpl_outstanding'),
  annual: I18N.t('export_tpl_annual')
};

function renderPdfPreview() {
  const group = $('#pdfPreviewGroup');
  const preview = $('#pdfPreview');
  if (!group || !preview) return;

  if (expFmt !== 'pdf') {
    group.style.display = 'none';
    return;
  }
  group.style.display = '';

  const tpl = PDF_TEMPLATES[expPdf] ? expPdf : 'monthly';
  const label = I18N.t('export_tpl_' + tpl);
  const nameEl = $('#previewTplName');
  if (nameEl) nameEl.textContent = label;

  try {
    const data = prepareReportData();
    const html = (PDF_TEMPLATES[tpl] || PDF_TEMPLATES.monthly)(data);
    preview.innerHTML = '<div class="paper">' + html + '</div>';
  } catch (e) {
    preview.innerHTML = '<div class="paper" style="color:#b42318">Preview failed: ' + escapeHtml(e.message || String(e)) + '</div>';
  }
}

/* PDF export — captures the EXACT same `.paper` element the live preview
   renders (via html2canvas-pro, which understands the app's oklch colors)
   and places it into a real A4 jsPDF document, paginating when the sheet is
   taller than one page. Produces a downloadable file that looks pixel-identical
   to the on-screen preview. Falls back to the print dialog if the libraries
   are unavailable. Fully offline (libraries are vendored in /vendor). */
async function exportPdf() {
  const tpl = PDF_TEMPLATES[expPdf] ? expPdf : 'monthly';
  const label = I18N.t('export_tpl_' + tpl);
  let html;
  try {
    html = (PDF_TEMPLATES[tpl] || PDF_TEMPLATES.monthly)(prepareReportData());
  } catch (e) {
    toast(I18N.t('toast_report_error', { msg: (e.message || e) }));
    return;
  }

  const jspdfNS = window.jspdf;
  const h2c = window.html2canvas;
  if (!jspdfNS || !jspdfNS.jsPDF || typeof h2c !== 'function') {
    exportPdfPrintFallback(html, label);
    return;
  }
  const { jsPDF } = jspdfNS;

  toast(I18N.t('toast_generating', { label }));

  // Render the EXACT same paper the preview uses, offscreen, at its natural
  // preview width (540px) so proportions match the preview precisely.
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:540px;background:#fff;margin:0;padding:0;z-index:-1;pointer-events:none';
  holder.innerHTML = '<div class="paper" style="width:540px;margin:0;box-shadow:none;border:0;border-radius:0">' + html + '</div>';
  document.body.appendChild(holder);
  const paperEl = holder.firstElementChild;

  try {
    if (document.fonts && document.fonts.ready) {
      try {
        // Ensure the Amharic subset (and any other webfonts) are loaded before capture
        try { await document.fonts.load('400 16px "Noto Sans Ethiopic"'); } catch (e) { /* ignore */ }
        try { await document.fonts.load('600 16px "Noto Sans Ethiopic"'); } catch (e) { /* ignore */ }
        await document.fonts.ready;
      } catch (e) { /* ignore */ }
    }
    // small delay so layout/fonts settle
    await new Promise(r => setTimeout(r, 60));

    const canvas = await h2c(paperEl, {
      scale: 3,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: 540,
      width: 540,
      height: paperEl.scrollHeight
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = canvas.height * imgW / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    if (imgH <= pageH) {
      pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
    } else {
      // paginate: shift the full image up one page height at a time
      let position = 0;
      let heightLeft = imgH;
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
    }

    pdf.save('guardpay-' + tpl + '-' + currentMonthKey() + '.pdf');
    toast(I18N.t('toast_pdf_downloaded', { label }));
  } catch (e) {
    console.error('PDF export failed', e);
    toast(I18N.t('toast_pdf_failed'));
    exportPdfPrintFallback(html, label);
  } finally {
    holder.remove();
  }
}

/* Fallback: self-contained print document (used only if the PDF libraries
   fail to load or capture throws). */
function exportPdfPrintFallback(html, label) {
  const w = window.open('', '_blank');
  if (!w) { toast(I18N.t('toast_popup_blocked')); return; }
  const origin = location.origin;
  const printCSS =
    '@page{size:A4;margin:14mm}' +
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    'html,body{margin:0;padding:0;background:#fff}' +
    '.print-stage{display:flex;justify-content:center}' +
    '.print-stage .paper{width:100%;max-width:720px;box-shadow:none;border:0}' +
    '.paper table{page-break-inside:auto}.paper tr{page-break-inside:avoid}' +
    '.paper thead{display:table-header-group}';
  const doc =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<title>GuardPay — ' + escapeHtml(label) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+Ethiopic:wght@400;500;600;700&display=swap" rel="stylesheet">' +
    '<link rel="stylesheet" href="' + origin + '/style.css">' +
    '<style>' + printCSS + '</style></head>' +
    '<body><div class="print-stage"><div class="paper">' + html + '</div></div>' +
    '<scr' + 'ipt>var done=false;function go(){if(done)return;done=true;setTimeout(function(){try{window.focus();window.print();}catch(e){}},400);}' +
    'if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go);}window.addEventListener("load",go);setTimeout(go,2500);</scr' + 'ipt></body></html>';
  w.document.open(); w.document.write(doc); w.document.close();
  toast(I18N.t('toast_print_view', { label }));
}

function doExport() {
  const fields = selectedFields();
  const currentMK = currentMonthKey();
  const settings = state.settings;
  const currency = settings.currency || 'ETB';

  if (expFmt === 'csv') {
    const fieldLabels = {
      house: I18N.t('csv_house'), name: I18N.t('csv_name'), amount: I18N.t('csv_amount'), paid: I18N.t('csv_status'),
      score: I18N.t('csv_score'), date: I18N.t('csv_paid_date'), total: I18N.t('field_total'), unpaid: I18N.t('field_unpaid')
    };
    const fields = selectedFields();
    if (!fields.length) { toast(I18N.t('toast_select_field')); return; }
    const header = fields.map(f => fieldLabels[f] || f);
    if (expType === 'full') header.unshift('Month');
    const rows = [header];
    const paidTotal = (stats, h) => stats.resolved
      .filter(e => e.status === 'ontime' || e.status === 'late')
      .reduce((sum, e) => sum + (Number(e.amount) || historicalFee(h, e.month) || 0), 0);

    if (expType === 'full') {
      // Full register: all history for all houses
      state.houses.forEach(h => {
        const stats = computeHouseStats(h);
        stats.history.forEach(entry => {
          const isPaid = entry.status === 'ontime' || entry.status === 'late';
          rows.push([monthLabel(entry.month)].concat(fields.map(f => {
            switch (f) {
              case 'house': return '#' + h.house_number;
              case 'name': return h.name;
              case 'amount': return entry.amount || (isPaid ? historicalFee(h, entry.month) : '');
              case 'paid': return isPaid ? I18N.t('drawer_paid') : I18N.t('drawer_unpaid');
              case 'score': return stats.totalScore;
              case 'date': return entry.paidDate ? entry.paidDate.toISOString().split('T')[0] : '';
              case 'total': return paidTotal(stats, h);
              case 'unpaid': return isPaid ? '' : historicalFee(h, entry.month);
              default: return '';
            }
          })));
        });
      });
    } else {
      // Default: current month snapshot
      state.houses.forEach(h => {
        const stats = computeHouseStats(h);
        const cur = stats.history[stats.history.length - 1];
        const isPaid = cur && (cur.status === 'ontime' || cur.status === 'late');
        rows.push(fields.map(f => {
          switch (f) {
            case 'house': return '#' + h.house_number;
            case 'name': return h.name;
            case 'amount': return cur && cur.amount ? cur.amount : (isPaid ? historicalFee(h, currentMK) : '');
            case 'paid': return isPaid ? I18N.t('drawer_paid') : I18N.t('drawer_unpaid');
            case 'score': return stats.totalScore;
            case 'date': return cur && cur.paidDate ? cur.paidDate.toISOString().split('T')[0] : '';
            case 'total': return paidTotal(stats, h);
            case 'unpaid': return isPaid ? '' : historicalFee(h, currentMK);
            default: return '';
          }
        }));
      });
    }
    downloadCSV('guardpay-report-' + currentMK + '.csv', rows);
    toast(I18N.t('toast_csv_downloaded'));
  } else if (expFmt === 'json') {
    window.location.href = '/api/export/json';
    toast(I18N.t('toast_backup_downloading'));
  } else if (expFmt === 'pdf') {
    exportPdf();
  }
  closeModal('exportOverlay');
}


function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  downloadBlob(filename, csv, 'text/csv;charset=utf-8');
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- PDF templates (paper-style from export-gallery) ---------------- */
function pdfFmtDate(d) {
  if (!d) return '—';
  const dt = (d instanceof Date) ? d : new Date(d + 'T00:00:00');
  if (isNaN(dt)) return '—';
  const m = I18N.MONTHS_SHORT();
  return m[dt.getMonth()] + ' ' + dt.getDate();
}

function prepareReportData() {
  const settings = state.settings;
  const currency = settings.currency || 'ETB';
  const monthKey = currentMonthKey();
  const label = monthLabel(monthKey);
  const guardSalary = settingGuardSalary();

  const houses = state.houses.map(h => {
    const stats = computeHouseStats(h);
    const cur = stats.history[stats.history.length - 1];
    const isPaid = cur && (cur.status === 'ontime' || cur.status === 'late');
    const payment = paymentFor(h.id, monthKey);
    const amount = cur && cur.amount ? cur.amount : (isPaid ? h.fee : 0);
    return {
      house_number: h.house_number,
      name: h.name,
      fee: h.fee,
      status: cur ? cur.status : 'upcoming',
      paidDate: cur ? cur.paidDate : null,
      amount: amount,
      score: stats.totalScore,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      onTimeRate: stats.onTimeRate
    };
  });

  let collected = 0, expected = 0, paidCount = 0;
  houses.forEach(h => {
    expected += Number(h.fee) || 0;
    if (h.status === 'ontime' || h.status === 'late') {
      paidCount++;
      collected += Number(h.amount) || 0;
    }
  });
  const outstanding = expected - collected;
  const pct = houses.length ? Math.round(paidCount / houses.length * 100) : 0;
  const avgScore = houses.length ? Math.round(houses.reduce((s, h) => s + (h.score || 0), 0) / houses.length) : 0;

  // Most common fee across households (falls back to default_fee setting)
  const feeCounts = {};
  houses.forEach(h => { const f = Number(h.fee) || 0; feeCounts[f] = (feeCounts[f] || 0) + 1; });
  let commonFee = settingDefaultFee();
  let bestCount = 0;
  Object.keys(feeCounts).forEach(f => { if (feeCounts[f] > bestCount) { bestCount = feeCounts[f]; commonFee = Number(f); } });

  const summary = { collected, expected, outstanding, pct, avgScore, paidCount, total: houses.length, typicalFee: commonFee };

  const gp = state.guard_payments.find(g => g.month_key === monthKey) || null;
  const guard = {
    name: settings.guard_name || I18N.t('neighborhood_guard'),
    salary: guardSalary,
    collected: collected,
    surplus: collected - guardSalary,
    payment: gp ? { date: gp.paid_date, method: gp.method, amount: gp.amount, note: gp.note } : null
  };

  const leaderboard = state.houses.map(h => {
    const s = computeHouseStats(h);
    return { house: h.house_number, name: h.name, score: s.totalScore, streak: s.currentStreak };
  }).sort((a, b) => b.streak - a.streak || b.score - a.score).slice(0, 10);

  const overdue = houses.filter(h => h.status === 'overdue' || h.status === 'missed')
    .map(h => ({ house: h.house_number, name: h.name, fee: h.fee }))
    .sort((a, b) => (Number(a.house) - Number(b.house)));

  const yearData = getYearData(new Date().getFullYear());
  const annual = {
    year: yearData.year,
    months: yearData.months,
    totalCollected: yearData.totalCollected,
    totalExpected: yearData.totalExpected,
    completion: yearData.completion,
    guardYearTotal: state.guard_payments
      .filter(g => g.month_key && g.month_key.startsWith(String(yearData.year)))
      .reduce((s, g) => s + (Number(g.amount) || 0), 0),
    households: state.houses.map(h => {
      const s = computeHouseStats(h);
      const paidEntries = s.resolved.filter(e => e.status === 'ontime' || e.status === 'late');
      const paidTotal = paidEntries.reduce((sum, e) => sum + (Number(e.amount) || historicalFee(h, e.month) || 0), 0);
      return {
        house: h.house_number, name: h.name, fee: h.fee,
        paidTotal,
        monthsActive: s.resolved.length,
        score: s.totalScore
      };
    })
  };

  return { settings, monthKey, monthLabel: label, currency, houses, summary, guard, leaderboard, overdue, annual,
    generated: new Date().toLocaleString() };
}

const PDF_TEMPLATES = {
  monthly: function (d) {
    const rows = d.houses.map(h => {
      const isPaid = h.status === 'ontime' || h.status === 'late';
      return '<tr><td class="r num">#' + escapeHtml(String(h.house_number)) + '</td><td>' + escapeHtml(h.name) + '</td>' +
        '<td class="r num">' + formatMoney(h.fee) + '</td><td class="r">' + pdfFmtDate(h.paidDate) + '</td>' +
        '<td><span class="pill ' + (isPaid ? 'paid' : 'unpaid') + '">' + (isPaid ? I18N.t('drawer_paid') : I18N.t('drawer_unpaid')) + '</span></td></tr>';
    }).join('');
    return '<div class="doc-head"><div class="t">' + I18N.t('export_tpl_monthly') + '</div>' +
      '<div class="sub">' + escapeHtml(d.settings.neighborhood_name || I18N.t('settings_neighborhood_ph')) + '<br>' + escapeHtml(d.monthLabel) + '<br>' + I18N.t('generated') + ' ' + d.generated + '</div></div>' +
      '<div class="doc-meta"><div class="m"><div class="l">' + I18N.t('pdf_collected') + '</div><div class="v green">' + formatMoney(d.summary.collected) + '</div></div>' +
      '<div class="m"><div class="l">' + I18N.t('pdf_outstanding') + '</div><div class="v danger">' + formatMoney(d.summary.outstanding) + '</div></div>' +
      '<div class="m"><div class="l">' + I18N.t('pdf_completion') + '</div><div class="v">' + d.summary.pct + '%</div></div></div>' +
      '<h4>' + I18N.t('pdf_all_households', { n: d.summary.total }) + '</h4>' +
      '<table><thead><tr><th class="r">House</th><th>' + I18N.t('pdf_neighbor') + '</th><th class="r">' + escapeHtml(d.currency) + '</th><th class="r">' + I18N.t('th_date') + '</th><th>Status</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="5" style="color:#7b8794;font-style:italic">' + I18N.t('pdf_no_households') + '</td></tr>') + '</tbody></table>' +
      '<div class="foot"><span>' + I18N.t('pdf_monthly_footer') + ' · ' + escapeHtml(d.monthLabel) + '</span><span>' + I18N.t('pdf_page') + '</span></div>';
  },

  guard: function (d) {
    return '<div class="doc-head"><div class="t">' + I18N.t('pdf_guard_fund_in_out') + '</div>' +
      '<div class="sub">' + I18N.t('pdf_guard_fund_in_out') + '<br>' + escapeHtml(d.monthLabel) + '</div></div>' +
      '<div class="doc-meta"><div class="m"><div class="l">' + I18N.t('pdf_collected') + '</div><div class="v green">' + formatMoney(d.guard.collected) + '</div></div>' +
      '<div class="m"><div class="l">' + I18N.t('guard_salary') + '</div><div class="v accent">' + formatMoney(d.guard.salary) + '</div></div>' +
      '<div class="m"><div class="l">' + I18N.t('guard_surplus') + '</div><div class="v ' + (d.guard.surplus >= 0 ? 'green' : 'danger') + '">' + formatMoney(d.guard.surplus) + '</div></div></div>' +
      '<h4>' + I18N.t('pdf_guard_movement') + '</h4>' +
      '<div class="sett">' +
        '<div class="r"><span>' + I18N.t('pdf_guard_opening') + '</span><span class="v">' + formatMoney(0) + '</span></div>' +
        '<div class="r"><span>' + I18N.t('pdf_guard_from_n', { n: d.summary.paidCount }) + '</span><span class="v">+' + formatMoney(d.guard.collected) + '</span></div>' +
        '<div class="r"><span>' + I18N.t('pdf_guard_salary', { amount: formatMoney(d.guard.salary) }) + '</span><span class="v">−' + formatMoney(d.guard.salary) + '</span></div>' +
        '<div class="r"><span>' + I18N.t('pdf_guard_outstanding_n', { n: (d.summary.total - d.summary.paidCount) }) + '</span><span class="v">' + formatMoney(d.summary.outstanding) + '</span></div>' +
        '<div class="r tot"><span>' + I18N.t('pdf_guard_closing') + '</span><span class="v">' + formatMoney(d.guard.surplus) + ' ' + escapeHtml(d.currency) + '</span></div>' +
      '</div>' +
      '<div class="sign-line">' + I18N.t('pdf_guard_received') + ' <span class="line"></span>  ' + I18N.t('pdf_guard_date') + ' <span class="line"></span></div>' +
      '<div class="foot"><span>' + I18N.t('pdf_monthly_footer') + ' · ' + escapeHtml(d.monthLabel) + '</span><span>' + I18N.t('pdf_guard_footer') + '</span></div>';
  },

  scorecard: function (d) {
    const ranked = d.houses.slice().sort((a, b) => b.score - a.score);
    const cards = ranked.map((h, i) => {
      const isPaid = h.status === 'ontime' || h.status === 'late';
      return '<div class="sc-card"><div class="nm">' + escapeHtml(h.name) + '</div>' +
        '<div class="ho">#' + escapeHtml(String(h.house_number)) + ' · ' + (isPaid ? I18N.t('sc_house_paid') : I18N.t('sc_house_unpaid')) + '</div>' +
        '<div class="sc">' + I18N.t('sc_rank') + (i + 1) + '</div></div>';
    }).join('');
    return '<div class="doc-head"><div class="t">' + I18N.t('pdf_scorecard_title') + '</div>' +
      '<div class="sub">' + I18N.t('pdf_scorecard_ranking') + '<br>' + escapeHtml(d.monthLabel) + '<br>' + I18N.t('pdf_scorecard_ranked', { n: d.houses.length }) + '</div></div>' +
      '<p class="lead">' + I18N.t('pdf_scorecard_lead') + '</p>' +
      '<div class="grid4">' + cards + '</div>' +
      '<div class="foot"><span>' + I18N.t('pdf_monthly_footer') + ' · ' + escapeHtml(d.monthLabel) + '</span><span>' + I18N.t('pdf_scorecard_footer') + '</span></div>';
  },

  outstanding: function (d) {
    const rows = d.overdue.map(o =>
      '<tr><td class="r num">#' + escapeHtml(String(o.house)) + '</td><td>' + escapeHtml(o.name) + '</td>' +
      '<td class="r num">' + formatMoney(o.fee) + '</td><td><span class="pill unpaid">' + I18N.t('drawer_unpaid') + '</span></td></tr>'
    ).join('');
    const fee = formatMoney(d.summary.typicalFee);
    return '<div class="doc-head"><div class="t">' + I18N.t('pdf_outstanding_title') + '</div>' +
      '<div class="sub">' + I18N.t('pdf_outstanding_reminder_sheet') + '<br>' + escapeHtml(d.monthLabel) + '<br>' + I18N.t('pdf_outstanding_pending', { n: d.overdue.length }) + '</div></div>' +
      '<p class="lead">' + I18N.t('pdf_outstanding_lead', { fee: fee }) + '</p>' +
      '<h4>' + I18N.t('pdf_outstanding_pending_hh') + '</h4>' +
      '<table><thead><tr><th class="r">House</th><th>' + I18N.t('pdf_neighbor') + '</th><th class="r">' + escapeHtml(d.currency) + '</th><th>Status</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="4" style="color:#7b8794;font-style:italic">' + I18N.t('pdf_outstanding_all_current') + '</td></tr>') + '</tbody></table>' +
      '<div class="doc-meta" style="margin-top:18px"><div class="m"><div class="l">' + I18N.t('pdf_outstanding_total') + '</div><div class="v danger">' + formatMoney(d.summary.outstanding) + '</div></div></div>' +
      '<div class="foot"><span>' + I18N.t('pdf_monthly_footer') + ' · ' + escapeHtml(d.monthLabel) + '</span><span>' + I18N.t('pdf_outstanding_footer') + '</span></div>';
  },

  annual: function (d) {
    const a = d.annual;
    const maxC = Math.max(...a.months.map(x => x.collected), 1);
    const bars = a.months.map((m) => {
      const h = Math.max(4, Math.round(m.collected / maxC * 100));
      const cur = m.mk === currentMonthKey() ? ' cur' : '';
      return '<div class="b' + cur + '" style="height:' + h + '%" title="' + escapeHtml(m.label) + ': ' + formatMoney(m.collected) + '">' +
        '<b class="val">' + compactNum(m.collected) + '</b>' +
        '<span>' + m.short + '</span></div>';
    }).join('');
    const thisMonth = a.months[new Date().getMonth()] ? a.months[new Date().getMonth()].collected : 0;
    return '<div class="doc-head"><div class="t">' + I18N.t('pdf_annual_title') + '</div>' +
      '<div class="sub">' + I18N.t('pdf_annual_subtitle', { year: a.year }) + '</div></div>' +
      '<div class="doc-meta">' +
        '<div class="m"><div class="l">' + I18N.t('pdf_annual_this_month') + '</div><div class="v green">' + formatMoney(thisMonth) + '</div></div>' +
        '<div class="m"><div class="l">' + I18N.t('pdf_completion') + '</div><div class="v">' + a.completion + '%</div></div>' +
        '<div class="m"><div class="l">' + I18N.t('pdf_annual_guard_mo') + '</div><div class="v accent">' + formatMoney(d.guard.salary) + '</div></div>' +
      '</div>' +
      '<h4>' + I18N.t('pdf_annual_monthly_collections', { currency: escapeHtml(d.currency) }) + '</h4>' +
      '<div class="trend">' + bars + '</div>' +
      '<p class="lead" style="margin-top:22px">' + I18N.t('pdf_annual_lead', { collected: formatMoney(a.totalCollected), expected: formatMoney(a.totalExpected) }) + '</p>' +
      '<div class="foot"><span>' + I18N.t('pdf_monthly_footer') + ' · ' + a.year + '</span><span>' + I18N.t('pdf_annual_footer') + '</span></div>';
  }
};


/* ---------------- init & refresh ---------------- */
async function refreshAll() {
  await loadState();
  buildIndexes();
  renderStats(false);
  renderCalendar();
  renderLedger();
  renderLeaderboard();
  renderHistory();
  renderReminders();
  if (currentView === 'history') renderAnalytics();
}

/* ---------------- render: data view ---------------- */
let dataFilter = 'active';
let dataSortCol = null;
let dataSortDir = 'asc';

function _getSortedData() {
  const mk = currentMonthKey();
  let houses = state.houses.slice();
  if (dataFilter === 'active') houses = houses.filter(h => h.active !== 0);
  else if (dataFilter === 'inactive') houses = houses.filter(h => h.active === 0);
  else if (dataFilter === 'paid') houses = houses.filter(h => { const p = paymentFor(h.id, mk); return p && p.paid_date; });
  else if (dataFilter === 'unpaid') houses = houses.filter(h => { const p = paymentFor(h.id, mk); return !p || !p.paid_date; });
  const q = ($('#dataSearch')?.value || '').toLowerCase().trim();
  if (q) houses = houses.filter(h => (h.house_number + ' ' + h.name + ' ' + (h.notes || '')).toLowerCase().includes(q));
  if (dataSortCol) {
    houses.sort((a, b) => {
      let va, vb;
      if (dataSortCol === 'num' || dataSortCol === 'house') { va = a.house_number; vb = b.house_number; }
      else if (dataSortCol === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (dataSortCol === 'fee') { va = Number(a.fee) || 0; vb = Number(b.fee) || 0; }
      else return 0;
      if (va < vb) return dataSortDir === 'asc' ? -1 : 1;
      if (va > vb) return dataSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }
  return houses;
}

function renderDataView() {
  const tbody = $('#dataBody');
  const empty = $('#dataEmpty');
  if (!tbody) return;

  const mk = currentMonthKey();
  let houses = _getSortedData();

  // Summary stats
  const totalHouses = houses.length;
  const activeHouses = houses.filter(h => h.active !== 0).length;
  const totalFees = houses.reduce((s, h) => s + (Number(h.fee) || 0), 0);
  const avgFee = totalHouses ? Math.round(totalFees / totalHouses) : 0;
  const paidThisMonth = houses.filter(h => { const p = paymentFor(h.id, mk); return p && p.paid_date; }).length;
  const unpaidThisMonth = houses.filter(h => { const p = paymentFor(h.id, mk); return !p || !p.paid_date; }).length;
  const monthlyCollected = houses.reduce((s, h) => {
    const p = paymentFor(h.id, mk);
    return s + (p && p.paid_date ? (Number(p.amount) || Number(h.fee) || 0) : 0);
  }, 0);

  // Update summary cards
  const s = id => { const el = $(id); if (el) el.textContent = String(arguments[1]); };
  if ($('#dataTotalHouses')) $('#dataTotalHouses').textContent = totalHouses;
  if ($('#dataActiveHouses')) $('#dataActiveHouses').textContent = activeHouses;
  if ($('#dataTotalFees')) $('#dataTotalFees').textContent = totalFees.toLocaleString();
  if ($('#dataAvgFee')) $('#dataAvgFee').textContent = avgFee.toLocaleString();
  if ($('#dataPaidThisMonth')) $('#dataPaidThisMonth').textContent = paidThisMonth;
  if ($('#dataUnpaidThisMonth')) $('#dataUnpaidThisMonth').textContent = unpaidThisMonth;

  // Empty state
  if (!houses.length) { tbody.innerHTML = ''; if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';

  // Render rows
  let html = houses.map((h, i) => {
    const fee = Number(h.fee) || 0;
    const active = h.active !== 0;
    const payment = paymentFor(h.id, mk);
    const paid = payment && payment.paid_date;
    const allPays = paymentsForHouse(h.id).filter(p => p.paid_date).sort((a, b) => b.month_key.localeCompare(a.month_key));
    const lastPayLabel = allPays.length ? allPays[0].month_key : '—';
    return `<tr data-id="${h.id}" class="${active ? '' : 'data-inactive'}">
      <td class="data-col-num" data-label="#">${i + 1}</td>
      <td class="data-col-house" data-label="House"><strong>${escapeHtml(h.house_number)}</strong></td>
      <td class="data-col-name" data-label="Name">${escapeHtml(h.name)}</td>
      <td class="data-fee" data-label="Fee" title="${escapeHtml(I18N.t('data_edit_fee'))}">${fee.toLocaleString()}</td>
      <td class="data-col-paid" data-label="Paid?">
        <button class="data-paid-toggle ${paid ? 'paid' : 'unpaid'}" data-paid-toggle="${h.id}" title="${paid ? escapeHtml(I18N.t('paid_tick')) : escapeHtml(I18N.t('unpaid_tick'))}">${paid ? '✓' : '—'}</button>
      </td>
      <td class="data-col-pay" data-label="Last Pay">${lastPayLabel}</td>
      <td class="data-col-notes" data-label="Notes" title="${escapeHtml(I18N.t('data_edit_notes'))}">${escapeHtml(h.notes || '')}</td>
      <td class="data-col-actions" data-label="Actions"><div class="data-actions">
        <button class="act-btn" data-edit="${h.id}" title="${escapeHtml(I18N.t('data_edit'))}">✎</button>
        <button class="act-btn" data-toggle="${h.id}" style="color:var(--accent)" title="${active ? escapeHtml(I18N.t('data_deactivate')) : escapeHtml(I18N.t('data_activate'))}">${active ? '⊘' : '○'}</button>
        <button class="act-btn" data-delete="${h.id}" style="color:var(--danger)" title="${escapeHtml(I18N.t('data_delete'))}">✕</button>
      </div></td>
    </tr>`;
  }).join('');

  // Totals row
  html += `<tr class="data-total-row">
    <td class="data-col-num"></td>
    <td></td>
    <td></td>
    <td class="data-fee" data-label="Fee">${totalFees.toLocaleString()}</td>
    <td class="data-col-paid" data-label="Paid?">${paidThisMonth}/${paidThisMonth + unpaidThisMonth}</td>
    <td class="data-col-pay" data-label="Collected">${escapeHtml(I18N.t('data_totals_paid'))} ${monthlyCollected.toLocaleString()}</td>
    <td></td>
    <td></td>
  </tr>`;

  tbody.innerHTML = html;

  // Sort arrows
  $$('#dataTable th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === dataSortCol) th.classList.add(dataSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}

/* ---------------- wire events ---------------- */
function wireEvents() {
  // Theme picker
  wireThemePicker();
  // Language picker
  wireLangPicker();

  // Navigation
  $$('.topnav a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      $$('.topnav a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      const view = a.dataset.view;
      if (view === 'dashboard') {
        currentView = 'dashboard';
        $$('.dateline, .completion-band, .calendar-hero').forEach(el => el.style.display = '');
        $$('.grid').forEach(el => el.style.display = '');
        $('#settingsView').style.display = 'none';
        $('#dataView').style.display = 'none';
        $$('.col-main section[data-od-id="neighbors"]').forEach(el => el.style.display = '');
        ANA_SECTIONS.forEach(id => $$('.col-main section[data-od-id="' + id + '"]').forEach(el => el.style.display = 'none'));
      } else if (view === 'history') {
        currentView = 'history';
        $$('.dateline, .completion-band, .calendar-hero').forEach(el => el.style.display = 'none');
        $$('.grid').forEach(el => el.style.display = '');
        $('#settingsView').style.display = 'none';
        $('#dataView').style.display = 'none';
        $$('.col-main section[data-od-id="neighbors"]').forEach(el => el.style.display = 'none');
        ANA_SECTIONS.forEach(id => $$('.col-main section[data-od-id="' + id + '"]').forEach(el => el.style.display = ''));
        renderAnalytics();
      } else if (view === 'data') {
        currentView = 'data';
        $$('.grid, .dateline, .completion-band, .calendar-hero').forEach(el => el.style.display = 'none');
        $('#settingsView').style.display = 'none';
        $('#dataView').style.display = '';
        renderDataView();
      } else if (view === 'settings') {
        currentView = 'settings';
        $$('.grid, .dateline, .completion-band, .calendar-hero').forEach(el => el.style.display = 'none');
        $('#settingsView').style.display = '';
        $('#dataView').style.display = 'none';
        loadSettingsForm();
      }
    });
  });

  // Filter buttons
  $$('.filter-btn[data-filter]').forEach(b => {
    b.addEventListener('click', () => {
      $$('.filter-btn[data-filter]').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('active');
      b.setAttribute('aria-pressed', 'true');
      filterMode = b.dataset.filter;
      renderLedger();
    });
  });

  // Ledger search (debounced)
  const searchInput = $('#ledgerSearch');
  if (searchInput) {
    const runSearch = debounce(() => renderLedger(), 120);
    searchInput.addEventListener('input', e => { searchQuery = e.target.value; runSearch(); });
  }

  // Calendar nav
  $('#prevMonth').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  $('#nextMonth').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
  $('#prevYear').addEventListener('click', () => { calYear--; renderCalendar(); });
  $('#nextYear').addEventListener('click', () => { calYear++; renderCalendar(); });

  // History nav
  $('#histPrev').addEventListener('click', () => { histMonth--; if (histMonth < 0) { histMonth = 11; histYear--; } renderHistory(); });
  $('#histNext').addEventListener('click', () => { histMonth++; if (histMonth > 11) { histMonth = 0; histYear++; } renderHistory(); });

  // Analytics year switcher
  $('#anaPrevYear').addEventListener('click', () => { anaYear--; renderAnalytics(); });
  $('#anaNextYear').addEventListener('click', () => { anaYear++; renderAnalytics(); });

  // Yearly CSV download
  $('#downloadYearCsv').addEventListener('click', () => {
    const rows = [[I18N.t('csv_year'), I18N.t('csv_month'), I18N.t('csv_houses'), I18N.t('csv_paid'), I18N.t('csv_collected'), I18N.t('csv_expected'), I18N.t('csv_completion'), I18N.t('csv_ontime')]];
    const data = getYearData(anaYear);
    data.months.forEach(m => {
      const paid = state.houses.filter(h => {
        const p = paymentFor(h.id, m.mk);
        return p && p.paid_date;
      }).length;
      const pct = m.expected > 0 ? Math.round(m.collected / m.expected * 100) : 0;
      rows.push([anaYear, m.label, state.houses.length, paid, m.collected, m.expected, pct + '%', m.onTime + '%']);
    });
    downloadCSV('guardpay-yearly-' + anaYear + '.csv', rows);
    toast(I18N.t('toast_yearly_csv'));
  });

  // Ledger + global data-act actions
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]');
    if (btn) {
      e.stopPropagation();
      const act = btn.dataset.act;
      const id = parseInt(btn.dataset.id);
      if (act === 'resolve-reminder') { await resolveReminder(id); return; }
      const h = state.houses.find(x => x.id === id);
      if (!h) return;
      const mk = btn.dataset.month || currentMonthKey();
      if (act === 'toggle' || act === 'pay' || act === 'unpay') { await toggleHouse(h, mk); }
      else if (act === 'remind') { await flagReminder(h); return; }
      else if (act === 'unremind') { await resolveReminder(h.id); return; }
      else if (act === 'edit') { openEdit(h); return; }
      if ($('#drawer').classList.contains('open')) openDrawer(h);
      return;
    }
    const row = e.target.closest('#ledgerBody tr');
    if (row && row.dataset.id) {
      const h = state.houses.find(x => x.id === parseInt(row.dataset.id));
      if (h) openDrawer(h);
    }
  });

  // Drawer
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawer').addEventListener('click', e => { if (e.target === $('#drawer')) closeDrawer(); });

  // Add modal
  $$('#addTabs .tpl-opt').forEach(o => {
    o.addEventListener('click', () => {
      $$('#addTabs .tpl-opt').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-checked', 'false'); });
      o.classList.add('active');
      o.setAttribute('aria-checked', 'true');
      addMode = o.dataset.add;
      $('#addSingle').style.display = addMode === 'single' ? 'block' : 'none';
      $('#addBulk').style.display = addMode === 'bulk' ? 'block' : 'none';
    });
  });

  $('#openAdd').addEventListener('click', () => {
    $('#addHouse').value = '';
    $('#addName').value = '';
    $('#addFee').value = typicalFee();
    $('#addBulkText').value = '';
    openModal('addOverlay');
    setTimeout(() => $('#addHouse').focus(), 60);
  });
  $('#closeAdd').addEventListener('click', () => closeModal('addOverlay'));
  $('#cancelAdd').addEventListener('click', () => closeModal('addOverlay'));
  $('#addOverlay').addEventListener('click', e => { if (e.target === $('#addOverlay')) closeModal('addOverlay'); });

  $('#doAdd').addEventListener('click', async () => {
    try {
      if (addMode === 'bulk') {
        const text = $('#addBulkText').value;
        let added = 0;
        for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
          const m = line.match(/^(\d+)\s*[-,]?\s*(.*)$/);
          const res = await api('/api/houses', 'POST', {
            house_number: m ? m[1] : '',
            name: m ? m[2] : line,
            fee: parseInt($('#addFee').value) || typicalFee()
          });
          if (res.ok) added++;
        }
        if (added > 0) { toast(I18N.t('toast_added_n', { n: added })); closeModal('addOverlay'); await refreshAll(); }
      } else {
        const res = await api('/api/houses', 'POST', {
          house_number: $('#addHouse').value,
          name: $('#addName').value,
          fee: parseInt($('#addFee').value) || typicalFee()
        });
        if (res.ok) { toast(I18N.t('toast_household_added')); closeModal('addOverlay'); await refreshAll(); }
        else if (res.error) { toast(res.error); }
      }
    } catch (e) {
      toast(e.message || I18N.t('toast_add_failed'));
    }
  });

  // Export modal
  $$('.tpl-opt[data-type]').forEach(o => {
    o.addEventListener('click', () => {
      $$('.tpl-opt[data-type]').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-checked', 'false'); });
      o.classList.add('active');
      o.setAttribute('aria-checked', 'true');
      expType = o.dataset.type;
    });
  });
  $$('.fmt-chip').forEach(c => {
    c.addEventListener('click', () => {
      $$('.fmt-chip').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-checked', 'false'); });
      c.classList.add('active');
      c.setAttribute('aria-checked', 'true');
      expFmt = c.dataset.fmt;
      syncExportLayout();
      renderPdfPreview();
    });
  });

  $$('.tpl-opt[data-pdf]').forEach(o => {
    o.addEventListener('click', () => {
      $$('.tpl-opt[data-pdf]').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-checked', 'false'); });
      o.classList.add('active');
      o.setAttribute('aria-checked', 'true');
      expPdf = o.dataset.pdf;
      renderPdfPreview();
    });
  });

  $('#openExport').addEventListener('click', () => { syncExportLayout(); renderPdfPreview(); openModal('exportOverlay'); });
  $('#closeExport').addEventListener('click', () => closeModal('exportOverlay'));
  $('#cancelExport').addEventListener('click', () => closeModal('exportOverlay'));
  $('#exportOverlay').addEventListener('click', e => { if (e.target === $('#exportOverlay')) closeModal('exportOverlay'); });
  $('#doExport').addEventListener('click', doExport);

  // Guard payment modal
  $('#payGuardBtn').addEventListener('click', () => {
    const now = new Date();
    $('#guardMonth').value = now.getFullYear() + '-' + pad2(now.getMonth() + 1);
    $('#guardDate').value = now.toISOString().split('T')[0];
    $('#guardAmount').value = settingGuardSalary();
    openModal('guardOverlay');
  });
  $('#closeGuard').addEventListener('click', () => closeModal('guardOverlay'));
  $('#cancelGuard').addEventListener('click', () => closeModal('guardOverlay'));
  $('#guardOverlay').addEventListener('click', e => { if (e.target === $('#guardOverlay')) closeModal('guardOverlay'); });
  $('#doGuard').addEventListener('click', async () => {
    try {
      await api('/api/guard-payments/add', 'POST', {
        month_key: $('#guardMonth').value,
        paid_date: $('#guardDate').value,
        amount: parseInt($('#guardAmount').value) || 0,
        method: $('#guardMethod').value,
        note: $('#guardNote').value
      });
      toast(I18N.t('toast_guard_recorded'));
      closeModal('guardOverlay');
      await refreshAll();
    } catch (e) {
      toast(e.message || I18N.t('toast_guard_failed'));
    }
  });

  // Edit modal
  $('#closeEdit').addEventListener('click', () => { closeModal('editOverlay'); editContext = null; });
  $('#cancelEdit').addEventListener('click', () => { closeModal('editOverlay'); editContext = null; });
  $('#editOverlay').addEventListener('click', e => { if (e.target === $('#editOverlay')) { closeModal('editOverlay'); editContext = null; } });
  $('#doEdit').addEventListener('click', saveEdit);
  $('#deleteEdit').addEventListener('click', deleteEdit);
  $('#editToggleStatus').addEventListener('click', async () => {
    const house = state.houses.find(h => h.id === editContext);
    if (!house) return;
    await toggleHouse(house);
    const h = state.houses.find(x => x.id === editContext);
    if (h) openEdit(h);
  });
  $('#editToggleFlag').addEventListener('click', async () => {
    const house = state.houses.find(h => h.id === editContext);
    if (!house) return;
    if (isReminded(house.id)) await resolveReminder(house.id);
    else await flagReminder(house);
    const h = state.houses.find(x => x.id === editContext);
    if (h) openEdit(h);
  });

  // Reminder bell + panel
  $('#bellBtn').addEventListener('click', openReminderPanel);
  $('#reminderClose').addEventListener('click', closeReminderPanel);
  $('#reminderPanel').addEventListener('click', e => { if (e.target === $('#reminderPanel')) closeReminderPanel(); });
  const clearAllRem = $('#clearAllReminders');
  if (clearAllRem) clearAllRem.addEventListener('click', async () => {
    if (!state.reminders.length) return;
    for (const r of state.reminders.slice()) {
      try { await api('/api/reminders/resolve', 'POST', { house_id: r.house_id }); } catch (e) { /* skip */ }
    }
    toast(I18N.t('toast_cleared_reminders'));
    await refreshAll();
  });

  // Status filter dropdown
  $$('.status-filter-btn').forEach(b => {
    b.addEventListener('click', () => {
      $$('.status-filter-btn').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('active');
      b.setAttribute('aria-pressed', 'true');
      statusFilter = b.dataset.status;
      renderLedger();
    });
  });

  // Quick actions
  $('#remindAll').addEventListener('click', async () => {
    const unpaid = state.houses.filter(h => {
      const c = computeHouseStats(h).history.at(-1);
      return (!c || (c.status !== 'ontime' && c.status !== 'late')) && !isReminded(h.id);
    });
    if (!unpaid.length) { toast(I18N.t('toast_nothing_to_flag')); return; }
    let n = 0;
    for (const h of unpaid) {
      try { await api('/api/reminders/add', 'POST', { house_id: h.id }); n++; } catch (e) { /* skip */ }
    }
    toast(I18N.t('toast_flagged_n', { n }));
    await refreshAll();
    pulseBell();
    openReminderPanel();
  });

  $('#markAll').addEventListener('click', async () => {
    const unpaid = state.houses.filter(h => {
      const c = computeHouseStats(h).history.at(-1);
      return !c || (c.status !== 'ontime' && c.status !== 'late');
    });
    if (!unpaid.length) { toast(I18N.t('toast_all_paid')); return; }
    if (!confirm(I18N.t('confirm_mark_all', { n: unpaid.length, month: monthLabel(currentMonthKey()) }))) return;
    let changed = 0;
    for (const h of unpaid) {
      try { await api('/api/payments/toggle', 'POST', { house_id: h.id, month_key: currentMonthKey() }); changed++; }
      catch (e) { /* skip */ }
    }
    if (changed) { toast(I18N.t('toast_marked_n', { n: changed })); await refreshAll(); }
  });

  // Data view — filter buttons
  $$('.data-filter-row .status-filter-btn').forEach(b => {
    b.addEventListener('click', () => {
      $$('.data-filter-row .status-filter-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      dataFilter = b.dataset.filter;
      renderDataView();
    });
  });
  // Data view — sort
  $$('#dataTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (dataSortCol === col) dataSortDir = dataSortDir === 'asc' ? 'desc' : 'asc';
      else { dataSortCol = col; dataSortDir = 'asc'; }
      renderDataView();
    });
  });
  // Data view — search (debounced)
  const ds = $('#dataSearch');
  if (ds) ds.addEventListener('input', debounce(() => renderDataView(), 100));
  // Data view — add house
  $('#dataAddBtn').addEventListener('click', () => {
    closeModal('addOverlay');
    $('#addName').value = '';
    $('#addFee').value = typicalFee();
    $('#addBulkText').value = '';
    openModal('addOverlay');
    setTimeout(() => $('#addHouse').focus(), 60);
  });
  // Data view — CSV export
  $('#dataExportCsv').addEventListener('click', () => {
    const mk = currentMonthKey();
    const rows = [[
      I18N.t('csv_house'), I18N.t('csv_name'), I18N.t('csv_fee'),
      I18N.t('csv_status'), I18N.t('csv_paid_date'), I18N.t('csv_amount'), I18N.t('csv_score')
    ]];
    const sorted = _getSortedData();
    for (const h of sorted) {
      const p = paymentFor(h.id, mk);
      const paid = p && p.paid_date ? 'Paid' : 'Unpaid';
      const pd = p && p.paid_date ? p.paid_date : '';
      const amt = p && p.paid_date ? (p.amount || h.fee || 0) : 0;
      const score = computeHouseStats(h).totalScore;
      rows.push([h.house_number, h.name, h.fee || 0, paid, pd, amt, score]);
    }
    downloadCSV('guardpay-houses-' + mk + '.csv', rows);
    toast(I18N.t('toast_exported'));
  });
  // Data view — refresh
  $('#dataRefreshBtn').addEventListener('click', async () => {
    await refreshAll();
    renderDataView();
    toast(I18N.t('data_refreshed'));
  });
  // Data view — delegated clicks (edit, toggle, delete, paid-toggle, inline-edit)
  $('#dataBody').addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    // Ripple on action buttons
    if (btn.classList.contains('act-btn') || btn.dataset.paidToggle !== undefined) {
      ripple(e);
    }
    const tr = btn.closest('tr');
    const id = Number(tr?.dataset.id);
    if (!id) return;

    // Paid toggle
    if (btn.dataset.paidToggle !== undefined) {
      try {
        await api('/api/payments/toggle', 'POST', { house_id: id, month_key: currentMonthKey() });
        await refreshAll();
        renderDataView();
      } catch (err) { toast(err.message || 'Error'); }
      return;
    }
    // Edit — open drawer
    if (btn.dataset.edit !== undefined) {
      const h = state.houses.find(x => x.id === id);
      if (h) openDrawer(h);
      return;
    }
    // Toggle active/inactive
    if (btn.dataset.toggle !== undefined) {
      const h = state.houses.find(x => x.id === id);
      if (!h) return;
      try {
        await api('/api/houses/update', 'POST', { id, active: h.active ? 0 : 1, name: h.name, house_number: h.house_number, fee: h.fee, notes: h.notes });
        await refreshAll();
        renderDataView();
        toast(h.active ? I18N.t('data_deactivated') : I18N.t('data_activated'));
      } catch (e) { toast(e.message || 'Error'); }
      return;
    }
    // Delete
    if (btn.dataset.delete !== undefined) {
      if (!confirm(I18N.t('data_delete_confirm'))) return;
      try {
        const backup = await api('/api/backup', 'POST', { reason: 'delete-house-' + id });
        await api('/api/houses/delete', 'POST', { id });
        await refreshAll();
        renderDataView();
        toast(I18N.t('data_deleted'));
      } catch (e) { toast(e.message || 'Error'); }
      return;
    }
  });
  // Data view — inline edit (fee, notes) via double-click
  $('#dataBody').addEventListener('dblclick', async e => {
    const td = e.target.closest('td');
    if (!td) return;
    const tr = td.closest('tr');
    const id = Number(tr?.dataset.id);
    if (!id) return;
    // Only fee and notes columns are editable
    if (!td.classList.contains('data-fee') && !td.classList.contains('data-col-notes')) return;
    if (td.classList.contains('editing')) return;
    const h = state.houses.find(x => x.id === id);
    if (!h) return;
    const field = td.classList.contains('data-fee') ? 'fee' : 'notes';
    const orig = field === 'fee' ? String(Number(h.fee) || 0) : (h.notes || '');
    td.classList.add('editing');
    td.innerHTML = `<input class="data-edit-input" type="${field === 'fee' ? 'number' : 'text'}" value="${escapeHtml(orig)}">
      <div class="data-inline-actions">
        <button class="save-btn" data-inline-save="${id}" data-field="${field}">${escapeHtml(I18N.t('data_save'))}</button>
        <button class="cancel-btn" data-inline-cancel="${id}">${escapeHtml(I18N.t('data_cancel'))}</button>
      </div>`;
    const inp = td.querySelector('input');
    if (inp) { inp.focus(); inp.select(); }
  });
  // Data view — inline save/cancel (delegated)
  $('#dataBody').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-inline-save], button[data-inline-cancel]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const id = Number(tr?.dataset.id);
    if (!id) return;
    if (btn.dataset.inlineSave !== undefined) {
      const h = state.houses.find(x => x.id === id);
      if (!h) return;
      const td = btn.closest('td');
      if (!td) return;
      const inp = td.querySelector('input');
      const field = btn.dataset.field;
      const val = inp ? inp.value.trim() : '';
      const payload = { id, name: h.name, house_number: h.house_number, fee: h.fee, notes: h.notes, active: h.active };
      if (field === 'fee') payload.fee = parseInt(val) || 0;
      else payload.notes = val;
      try {
        await api('/api/houses/update', 'POST', payload);
        await refreshAll();
        renderDataView();
        toast(field === 'fee' ? I18N.t('toast_settings_saved') : I18N.t('data_refreshed'));
      } catch (err) { toast(err.message || 'Error'); renderDataView(); }
    } else if (btn.dataset.inlineCancel !== undefined) {
      renderDataView();
    }
  });

  // Settings
  const saveBtn = $('#saveSettings');
  const saveBtnOrig = saveBtn.textContent;
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    try {
      const gn = $('#settingGuardName');
      if (!gn) { toast('Settings form not found'); return; }
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner"></span> ' + I18N.t('settings_saving');
      saveBtn.classList.remove('btn-success');
      await api('/api/settings', 'POST', {
        neighborhood_name: ($('#settingName')?.value || '').trim(),
        currency: ($('#settingCurrency')?.value || 'ETB').trim(),
        due_day: ($('#settingDueDay')?.value || '5').trim(),
        guard_name: (gn.value || '').trim(),
        guard_salary: ($('#settingGuardSalary')?.value || '30000').trim(),
        default_fee: ($('#settingDefaultFee')?.value || '4000').trim(),
        guard_account_suffix: ($('#settingGuardAccount')?.value || '').trim(),
        parse_start_date: ($('#settingStartDate')?.value || '').trim(),
        backup_before_changes: $('#settingBackupBefore')?.checked ? '1' : '0'
      });
      await refreshAll();
      loadSettingsForm();
      saveBtn.innerHTML = '<span class="btn-check-icon">✓</span> ' + I18N.t('toast_settings_saved');
      saveBtn.classList.add('btn-success');
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = saveBtnOrig;
        saveBtn.classList.remove('btn-success');
      }, 2000);
      toast(I18N.t('toast_settings_saved'));
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = saveBtnOrig;
      saveBtn.classList.remove('btn-success');
      toast(e.message || 'Error');
    }
  });

  $('#cancelSettings').addEventListener('click', () => {
    $$('.topnav a').forEach(x => x.classList.remove('active'));
    $$('.topnav a[data-view="dashboard"]')[0].classList.add('active');
    $$('.grid, .dateline, .completion-band, .calendar-hero').forEach(el => el.style.display = '');
    $('#settingsView').style.display = 'none';
  });

  // Backup/restore — download the COMPLETE server backup (incl. audit + fee history)
  $('#downloadBackup').addEventListener('click', () => {
    window.location.href = '/api/export/json';
    toast(I18N.t('toast_backup_restoring'));
  });

  $('#restoreBackup').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm(I18N.t('confirm_restore'))) {
      e.target.value = ''; return;
    }
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      await api('/api/import', 'POST', data);
      toast(I18N.t('toast_backup_restored'));
      await refreshAll();
    } catch (err) {
      toast(err.message || I18N.t('toast_invalid_backup'));
    }
    e.target.value = '';
  });

  // Snapshot now
  const snapBtn = $('#createSnapshot');
  if (snapBtn) snapBtn.addEventListener('click', async () => {
    try { const r = await api('/api/backup/create', 'POST', {}); toast(I18N.t('toast_snapshot_saved', { file: r.file })); }
    catch (e) { toast(e.message || I18N.t('toast_snapshot_failed')); }
  });

  // Backup-before-changes toggle
  const bbc = $('#settingBackupBefore');
  if (bbc) bbc.addEventListener('change', async () => {
    try {
      await api('/api/settings', 'POST', { backup_before_changes: bbc.checked ? '1' : '0' });
      toast(bbc.checked ? I18N.t('toast_auto_backup_on') : I18N.t('toast_auto_backup_off'));
      await loadState();
    } catch (e) { toast(I18N.t('toast_setting_failed')); }
  });

  // PIN lock settings
  const pinToggle = $('#settingPinEnabled');
  if (pinToggle) pinToggle.addEventListener('change', () => {
    $('#pinFields').style.display = pinToggle.checked ? '' : 'none';
  });
  const pinNewInput = $('#pinNew');
  if (pinNewInput) pinNewInput.addEventListener('input', () => updatePinStrength(pinNewInput.value));
  const savePinBtn = $('#savePin');
  if (savePinBtn) savePinBtn.addEventListener('click', async () => {
    const enabled = $('#settingPinEnabled').checked;
    const pin = $('#pinNew').value;
    const current = $('#pinCurrent').value;
    try {
      if (enabled) {
        if (pin.length < 4) { toast(I18N.t('toast_pin_min')); return; }
        await api('/api/auth/set-pin', 'POST', { enabled: true, pin, current_pin: current });
        toast(I18N.t('toast_pin_enabled'));
      } else {
        await api('/api/auth/set-pin', 'POST', { enabled: false, current_pin: current });
        toast(I18N.t('toast_pin_disabled'));
      }
      $('#pinNew').value = ''; $('#pinCurrent').value = '';
      updatePinStrength('');
      await loadState();
      updatePinStatusPip();
    } catch (e) { toast(e.message || I18N.t('toast_pin_failed')); }
  });

  // Backup snapshot browser — restore / download individual .db snapshots
  const backupListEl = $('#backupList');
  if (backupListEl) backupListEl.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const file = btn.dataset.file;
    if (btn.dataset.act === 'backup-download') {
      window.location.href = '/api/backup/download?file=' + encodeURIComponent(file);
    } else if (btn.dataset.act === 'backup-restore') {
      if (!confirm(I18N.t('confirm_restore_snapshot', { file }))) return;
      btn.disabled = true;
      try {
        await api('/api/backup/restore', 'POST', { file });
        toast(I18N.t('toast_restore_success'));
        await refreshAll();
        await loadBackupList();
      } catch (err) { toast(err.message || I18N.t('toast_restore_failed')); }
      finally { btn.disabled = false; }
    }
  });
  const refreshBackupsBtn = $('#refreshBackups');
  if (refreshBackupsBtn) refreshBackupsBtn.addEventListener('click', loadBackupList);

  // Google Drive integration
  const gdriveSaveBtn = $('#gdriveSaveConnect');
  if (gdriveSaveBtn) gdriveSaveBtn.addEventListener('click', async () => {
    const client_id = $('#gdriveClientId').value.trim();
    const client_secret = $('#gdriveClientSecret').value.trim();
    if (!client_id || !client_secret) { toast(I18N.t('toast_gdrive_missing_creds')); return; }
    gdriveSaveBtn.disabled = true;
    try {
      await api('/api/integrations/gdrive/save-client', 'POST', { client_id, client_secret });
      const r = await api('/api/integrations/gdrive/connect', 'POST', {});
      if (r.url) {
        window.open(r.url, '_blank', 'noopener');
        toast(I18N.t('toast_gdrive_connect_opened'));
      }
    } catch (e) { toast(e.message || I18N.t('toast_gdrive_connect_failed')); }
    finally { gdriveSaveBtn.disabled = false; }
  });
  const gdriveBackupBtn = $('#gdriveBackupNow');
  if (gdriveBackupBtn) gdriveBackupBtn.addEventListener('click', async () => {
    gdriveBackupBtn.disabled = true;
    try {
      const r = await api('/api/integrations/gdrive/backup-now', 'POST', {});
      toast(I18N.t('toast_gdrive_backup_done', { file: r.file }));
      await loadGdriveStatus();
    } catch (e) { toast(e.message || I18N.t('toast_gdrive_backup_failed')); }
    finally { gdriveBackupBtn.disabled = false; }
  });
  const gdriveDisconnectBtn = $('#gdriveDisconnect');
  if (gdriveDisconnectBtn) gdriveDisconnectBtn.addEventListener('click', async () => {
    if (!confirm(I18N.t('confirm_gdrive_disconnect'))) return;
    try {
      await api('/api/integrations/gdrive/disconnect', 'POST', {});
      toast(I18N.t('toast_gdrive_disconnected'));
      await loadGdriveStatus();
    } catch (e) { toast(I18N.t('toast_gdrive_disconnect_failed')); }
  });
  // The OAuth flow finishes in a separate tab (Google's redirect back to our
  // own server) — refresh status when the user tabs back in to this one.
  window.addEventListener('focus', () => {
    if (currentView === 'settings') loadGdriveStatus();
  });

  // Diagnostics
  const diagBtn = $('#runDiagnostics');
  if (diagBtn) diagBtn.addEventListener('click', async () => {
    diagBtn.disabled = true;
    const origText = diagBtn.textContent;
    diagBtn.textContent = I18N.t('settings_running');
    try {
      const r = await api('/api/diagnostics/run', 'POST', {});
      $('#diagResults').innerHTML = r.checks.map(c => `
        <div class="diag-item">
          <span class="status ${c.ok ? 'paid' : 'unpaid'}"><span class="pip"></span>${escapeHtml(c.name)}</span>
          <span class="diag-detail">${escapeHtml(String(c.detail))} · ${c.ms}ms</span>
        </div>`).join('');
      const logEl = $('#diagLog');
      if (logEl) logEl.textContent = (r.log_tail || []).join('\n');
      const logWrap = $('#diagLogWrap');
      if (logWrap) logWrap.style.display = '';
      toast(r.ok ? I18N.t('toast_diag_all_ok') : I18N.t('toast_diag_issues'));
    } catch (e) {
      toast(e.message || I18N.t('toast_diag_failed'));
    } finally {
      diagBtn.disabled = false;
      diagBtn.textContent = origText;
    }
  });

  // Lock screen
  const lockBtn = $('#lockSubmit');
  if (lockBtn) lockBtn.addEventListener('click', doUnlock);
  const lockPin = $('#lockPin');
  if (lockPin) lockPin.addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });

  $('#downloadCsv').addEventListener('click', () => {
    const rows = [[I18N.t('csv_house'), I18N.t('csv_name'), I18N.t('csv_fee'), I18N.t('csv_month'), I18N.t('csv_status'), I18N.t('csv_paid_date'), I18N.t('csv_amount'), I18N.t('csv_score')]];
    state.houses.forEach(h => {
      const stats = computeHouseStats(h);
      stats.history.forEach(entry => {
        rows.push([
          h.house_number, h.name, h.fee,
          monthLabel(entry.month),
          entry.status,
          entry.paidDate ? entry.paidDate.toISOString().split('T')[0] : '',
          entry.amount || '',
          stats.totalScore
        ]);
      });
    });
    downloadCSV('guardpay-export-' + new Date().toISOString().split('T')[0] + '.csv', rows);
    toast(I18N.t('toast_csv_downloaded'));
  });

  // Keyboard fast-entry
  let kbBuffer = '';
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { kbBuffer = ''; updateKb(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (/^\d$/.test(e.key)) { kbBuffer += e.key; updateKb(); e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (kbBuffer) {
        const h = state.houses.find(x => x.house_number === kbBuffer);
         if (h) toggleHouse(h);
         else toast(I18N.t('toast_no_household', { num: kbBuffer }));
        kbBuffer = ''; updateKb();
      }
    } else if (e.key === 'Backspace') { kbBuffer = kbBuffer.slice(0, -1); updateKb(); }
  });

  function updateKb() {
    const el = $('#kbHint');
    if (!el) return;
    el.querySelector('.kb-num').textContent = kbBuffer || '—';
  }

  const kbClose = $('#kbHintClose');
  if (kbClose) kbClose.addEventListener('click', () => { $('#kbHint').style.display = 'none'; });

  // Test data buttons
  const loadTestDataBtn = $('#loadTestData');
  if (loadTestDataBtn) loadTestDataBtn.addEventListener('click', async () => {
    if (state.houses.length > 0) {
      if (!confirm(I18N.t('confirm_add_test'))) return;
    }
    const names = [
      'Abebe Kebede', 'Almaz Tesfaye', 'Bereket Hailu', 'Chaltu Bekele', 'Dawit Mengistu',
      'Eyerus Tadesse', 'Fikru Alemayehu', 'Genet Worku', 'Haile Gebrselassie', 'Ibrahim Mohammed',
      'Jemila Ahmed', 'Kebede Tsegaye', 'Lensa Bekele', 'Meles Zenawi', 'Nardos Gebre'
    ];
    const now = new Date();
    let added = 0;
    for (let i = 0; i < names.length; i++) {
      try {
        const res = await api('/api/houses', 'POST', {
          house_number: String(101 + i),
          name: names[i],
          fee: settingDefaultFee()
        });
        if (res.ok) added++;
      } catch (e) { /* skip */ }
    }
    // Refresh state to get house IDs
    await refreshAll();
    // Add payment history for last 6 months
    for (let m = 1; m <= 6; m++) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const pastMk = d.getFullYear() + '-' + pad2(d.getMonth() + 1);
      for (let i = 0; i < names.length; i++) {
        const houseNum = String(101 + i);
        const h = state.houses.find(x => x.house_number === houseNum);
        if (!h) continue;
        // ~70% pay on time, ~15% pay late, ~15% don't pay
        const roll = (i * 7 + m * 13) % 10;
        if (roll < 7) {
          // On time: paid 1-4 days before due date
          const dueDay = parseInt(state.settings.due_day) || 5;
          const paidDay = Math.max(1, dueDay - 1 - (i % 3));
          try {
            await api('/api/payments/toggle', 'POST', { house_id: h.id, month_key: pastMk });
            await api('/api/payments/update', 'POST', {
              house_id: h.id, month_key: pastMk,
              paid_date: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(paidDay),
              amount: h.fee
            });
          } catch (e) { /* skip */ }
        } else if (roll < 8.5) {
          // Late: paid 5-12 days after due date
          const dueDay = parseInt(state.settings.due_day) || 5;
          const paidDay = Math.min(28, dueDay + 5 + (i % 8));
          try {
            await api('/api/payments/toggle', 'POST', { house_id: h.id, month_key: pastMk });
            await api('/api/payments/update', 'POST', {
              house_id: h.id, month_key: pastMk,
              paid_date: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(paidDay),
              amount: h.fee
            });
          } catch (e) { /* skip */ }
        }
        // else: unpaid (no action)
      }
    }
    toast(I18N.t('toast_loaded_test', { n: added }));
    await refreshAll();
  });

  const clearTestDataBtn = $('#clearTestData');
  if (clearTestDataBtn) clearTestDataBtn.addEventListener('click', async () => {
    if (!confirm(I18N.t('confirm_clear_all'))) return;
    try {
      await api('/api/clear', 'POST');
      toast(I18N.t('toast_all_cleared'));
      await refreshAll();
    } catch (e) { toast(e.message || 'Error'); }
  });

  // Tooltip
  const tip = document.createElement('div');
  tip.className = 'tip';
  document.body.appendChild(tip);

  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if (t) {
      tip.innerHTML = t.dataset.tip;
      tip.classList.add('show');
      tip.style.left = e.clientX + 'px';
      tip.style.top = (e.clientY - 12) + 'px';
    }
  });
  document.addEventListener('mousemove', e => {
    if (tip.classList.contains('show')) {
      tip.style.left = e.clientX + 'px';
      tip.style.top = (e.clientY - 12) + 'px';
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('[data-tip]')) tip.classList.remove('show');
  });

  // Scroll progress
  const sp = $('#scrollProgress');
  window.addEventListener('scroll', () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    sp.style.width = (max > 0 ? (h.scrollTop / max * 100) : 0) + '%';
  }, { passive: true });

  // Ripple on buttons
  $$('.qa-btn,.act-btn,.export-btn,.btn-primary,.filter-btn,.status-toggle,.add-btn').forEach(b => {
    b.addEventListener('click', ripple);
  });

  // Close modals on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('exportOverlay');
      closeModal('addOverlay');
      closeModal('guardOverlay');
      closeDrawer();
    }
  });

  // Import review sheet + alias manager
  wireImportSheet();
  wireAliasManager();
}

function loadSettingsForm() {
  const s = state.settings;
  $('#settingName').value = s.neighborhood_name || '';
  $('#settingCurrency').value = s.currency || '';
  $('#settingDueDay').value = s.due_day || '5';
  $('#settingGuardName').value = s.guard_name || '';
  $('#settingGuardSalary').value = s.guard_salary || '';
  $('#settingDefaultFee').value = s.default_fee || '';
  $('#settingGuardAccount').value = s.guard_account_suffix || '';
  $('#settingStartDate').value = s.parse_start_date || '';
  $('#addFee').placeholder = settingDefaultFee();
  $('#guardAmount').placeholder = settingGuardSalary();
  const bbc = $('#settingBackupBefore');
  if (bbc) bbc.checked = s.backup_before_changes === '1';
  const pinToggle = $('#settingPinEnabled');
  if (pinToggle) {
    pinToggle.checked = !!(state.auth && state.auth.pin_enabled);
    const pf = $('#pinFields'); if (pf) pf.style.display = pinToggle.checked ? '' : 'none';
    const cw = $('#pinCurrentWrap'); if (cw) cw.style.display = pinToggle.checked ? '' : 'none';
  }
  updatePinStatusPip();
  loadBackupList();
  loadGdriveStatus();
  loadAliasManager();
}

function updatePinStatusPip() {
  const pip = $('#pinStatusPip'), text = $('#pinStatusText');
  if (!pip || !text) return;
  const enabled = !!(state.auth && state.auth.pin_enabled);
  pip.classList.toggle('paid', enabled);
  pip.classList.toggle('unpaid', !enabled);
  text.textContent = enabled ? I18N.t('settings_pin_status_on') : I18N.t('settings_pin_status_off');
}

function updatePinStrength(pin) {
  const bars = $$('#pinStrength span');
  if (!bars.length) return;
  let score = 0;
  if (pin.length >= 4) score = 1;
  if (pin.length >= 6) score = 2;
  if (pin.length >= 8) score = 3;
  if (pin.length >= 8 && /[^0-9]/.test(pin)) score = 4;
  bars.forEach((b, i) => b.classList.toggle('on', i < score));
}

/* ---------------- backup snapshot browser ---------------- */
async function loadBackupList() {
  const el = $('#backupList');
  if (!el) return;
  el.innerHTML = `<div class="backup-empty">${I18N.t('settings_loading_snapshots')}</div>`;
  try {
    const list = await api('/api/backups');
    if (!list.length) { el.innerHTML = `<div class="backup-empty">${I18N.t('settings_no_snapshots')}</div>`; return; }
    el.innerHTML = list.map(b => {
      const dt = new Date(b.modified);
      const kb = Math.max(1, Math.round(b.size / 1024));
      const kindKey = b.file.includes('-auto.db') ? 'settings_snapshot_auto'
        : b.file.includes('-manual.db') ? 'settings_snapshot_manual'
        : b.file.includes('-prerestore.db') ? 'settings_snapshot_prerestore'
        : b.file.includes('-gdrive.db') ? 'settings_snapshot_gdrive'
        : b.file.includes('-preimport.db') ? 'settings_snapshot_preimport' : '';
      return `
        <div class="backup-item">
          <div>
            <div class="backup-item-date">${dt.toLocaleString()}</div>
            <div class="backup-item-meta">${kindKey ? I18N.t(kindKey) + ' · ' : ''}${kb} KB</div>
          </div>
          <div class="backup-item-actions">
            <button class="btn-ghost" data-act="backup-download" data-file="${escapeHtml(b.file)}">${I18N.t('settings_download')}</button>
            <button class="btn-ghost" data-act="backup-restore" data-file="${escapeHtml(b.file)}">${I18N.t('settings_restore')}</button>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="backup-empty">${I18N.t('settings_snapshots_failed')}</div>`;
  }
}

/* ---------------- google drive integration ---------------- */
async function loadGdriveStatus() {
  const pip = $('#gdriveStatusPip'), text = $('#gdriveStatusText');
  const connectedBox = $('#gdriveConnected'), setup = $('#gdriveSetup');
  if (!pip || !text) return;
  try {
    const s = await api('/api/integrations/gdrive/status');
    if (s.connected) {
      pip.classList.remove('unpaid'); pip.classList.add('paid');
      text.textContent = I18N.t('settings_gdrive_connected');
      if (connectedBox) connectedBox.style.display = '';
      if (setup) setup.open = false;
      const lastEl = $('#gdriveLastBackup');
      if (lastEl) {
        lastEl.textContent = s.last_backup_at
          ? I18N.t('settings_gdrive_last_backup', { date: new Date(s.last_backup_at).toLocaleString() })
          : I18N.t('settings_gdrive_never_backed_up');
      }
    } else {
      pip.classList.add('unpaid'); pip.classList.remove('paid');
      text.textContent = I18N.t('settings_gdrive_not_connected');
      if (connectedBox) connectedBox.style.display = 'none';
    }
  } catch (e) { /* leave defaults showing */ }
}

/* ---------------- SMS importer panel ---------------- */
let smsCandidates = [];
let smsFilter = 'pending';
let smsQuery = '';
let smsGroup = 'none';
let smsConf = 'all';
let smsNamePool = null;


/* ---------------- alias manager ---------------- */
async function loadAliasManager() {
  const houseSel = document.getElementById('aliasHouse');
  const list = document.getElementById('aliasList');
  if (!houseSel || !list) return;
  const houses = (state.houses || []).filter(h => h.active);
  houseSel.innerHTML = houses.map(h => `<option value="${h.id}">${escapeHtml(h.house_number || '')} · ${escapeHtml(h.name || '')}</option>`).join('') || '<option value="">—</option>';
  if (!smsNamePool) {
    try { smsNamePool = (await api('/api/sms/namepool')).names || []; }
    catch (e) { smsNamePool = []; }
  }
  const dl = document.getElementById('aliasSuggestList');
  if (dl) dl.innerHTML = smsNamePool.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
  const aliases = state.aliases || [];
  if (!aliases.length) {
    list.innerHTML = `<div class="backup-empty">${I18N.t('settings_aliases_empty')}</div>`;
    return;
  }
  list.innerHTML = aliases.map(a => `
    <div class="backup-item">
      <div>
        <div class="backup-item-date">${escapeHtml(a.alias)}</div>
        <div class="backup-item-meta">${escapeHtml(a.house_number || '')} · ${escapeHtml(a.house_name || '')}</div>
      </div>
      <div class="backup-item-actions">
        <button class="btn-ghost" data-del-alias="${escapeHtml(a.alias)}" data-del-house="${a.house_id}">${I18N.t('settings_delete')}</button>
      </div>
    </div>`).join('');
}

async function refreshAliases() {
  try { await loadState(); } catch (e) { /* ignore */ }
  await loadAliasManager();
}

function wireAliasManager() {
  const add = document.getElementById('addAlias');
  const name = document.getElementById('aliasName');
  if (add && name) {
    add.addEventListener('click', async () => {
      const alias = name.value.trim();
      const houseId = document.getElementById('aliasHouse').value;
      if (!alias || !houseId) { toast(I18N.t('settings_aliases_needed')); return; }
      try {
        await api('/api/sms/aliases', 'POST', { house_id: Number(houseId), alias });
        name.value = '';
        toast(I18N.t('settings_aliases_added'));
        await refreshAliases();
      } catch (e) { toast(e.message || I18N.t('toast_server_error')); }
    });
  }
  const list = document.getElementById('aliasList');
  if (list) {
    list.addEventListener('click', async e => {
      const btn = e.target.closest('[data-del-alias]');
      if (!btn) return;
      if (!confirm(I18N.t('settings_aliases_del_confirm'))) return;
      try {
        await api('/api/sms/aliases/delete', 'POST', { house_id: Number(btn.dataset.delHouse), alias: btn.dataset.delAlias });
        await refreshAliases();
      } catch (err) { toast(err.message || I18N.t('toast_server_error')); }
    });
  }
}

/* ---------------- init ---------------- */
(async function init() {
  I18N.initLang();
  updateLangPickerState();
  applyTheme(getSavedTheme());
  wireEvents();
  const ok = await checkAuth();
  if (ok) await refreshAll();
})();

/* ================= Import review sheet (full-screen spreadsheet) ================= */
let impUnmatched = false;
let impDupOnly = false;
let impMonth = '';
let impMinAmt = '';
let impMaxAmt = '';
let impSort = 'date';
let impSelected = new Set();
let impActiveId = null;

function impVisibleRows() {
  const q = smsQuery.trim().toLowerCase();
  let rows = smsCandidates.filter(c => {
    if (smsFilter !== 'all' && c.status !== smsFilter) return false;
    if (smsConf !== 'all' && c.confidence !== smsConf) return false;
    if (impUnmatched && c.matched_house_id) return false;
    if (impDupOnly && !c.is_duplicate) return false;
    if (impMonth && (c.txn_date || '').slice(0, 7) !== impMonth) return false;
    if (impMinAmt !== '' && (c.amount || 0) < Number(impMinAmt)) return false;
    if (impMaxAmt !== '' && (c.amount || 0) > Number(impMaxAmt)) return false;
    if (q) {
      const hay = ((c.payer_raw || '') + ' ' + c.amount + ' ' + (c.ref_no || '') + ' ' + (c.house_name || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const newest = (a, b) => (b.txn_ts || 0) - (a.txn_ts || 0);
  if (impSort === 'date') rows.sort((a, b) => (a.txn_date || '').localeCompare(b.txn_date || '') || (a.txn_ts || 0) - (b.txn_ts || 0));
  else if (impSort === 'dateDesc') rows.sort((a, b) => (b.txn_date || '').localeCompare(a.txn_date || '') || (b.txn_ts || 0) - (a.txn_ts || 0));
  else if (impSort === 'amount') rows.sort((a, b) => (a.amount - b.amount) || newest(a, b));
  else if (impSort === 'amountDesc') rows.sort((a, b) => (b.amount - a.amount) || newest(a, b));
  else if (impSort === 'name') rows.sort((a, b) => (a.payer_raw || '').toLowerCase().localeCompare((b.payer_raw || '').toLowerCase()) || newest(a, b));
  else if (impSort === 'confidence') rows.sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.confidence] || 3) - ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[b.confidence] || 3) || newest(a, b));
  else if (impSort === 'status') rows.sort((a, b) => (a.status || '').localeCompare(b.status || '') || newest(a, b));
  return rows;
}

function impHouseOptions(sel) {
  return (state.houses || [])
    .filter(h => h.active)
    .map(h => `<option value="${h.id}" ${Number(sel) === Number(h.id) ? 'selected' : ''}>${escapeHtml(h.house_number || '')} · ${escapeHtml(h.name || '')}</option>`)
    .join('');
}

function impRenderSummary() {
  const el = $('#importSummary');
  const conf = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  let matched = 0, amt = 0;
  for (const c of smsCandidates) {
    amt += c.amount || 0;
    if (c.confidence in conf) conf[c.confidence]++;
    if (c.matched_house_id) matched++;
  }
  $('#impTotal').textContent = smsCandidates.length.toLocaleString();
  $('#impAmount').textContent = amt.toLocaleString();
  $('#impMatched').textContent = matched.toLocaleString();
  $('#impUnmatched').textContent = (smsCandidates.length - matched).toLocaleString();
  $('#impHigh').textContent = conf.HIGH.toLocaleString();
  $('#impMed').textContent = conf.MEDIUM.toLocaleString();
  $('#impLow').textContent = conf.LOW.toLocaleString();
  const done = smsCandidates.filter(c => c.status === 'applied' || c.status === 'rejected').length;
  const pct = smsCandidates.length ? Math.round(done / smsCandidates.length * 100) : 0;
  $('#importProgress').firstElementChild.style.width = pct + '%';
  $('#importProgressLabel').textContent = I18N.t('imp_progress', { done: done.toLocaleString(), total: smsCandidates.length.toLocaleString() });
}

function impRenderTable() {
  const body = $('#importBody');
  const empty = $('#importEmpty');
  const rows = impVisibleRows();
  impSelected.forEach(id => { if (!smsCandidates.some(c => c.id === id)) impSelected.delete(id); });
  if (!smsCandidates.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  body.innerHTML = rows.map(c => {
    const sel = impSelected.has(c.id) ? 'checked' : '';
    const dup = c.is_duplicate ? 'imp-dup' : '';
    const active = impActiveId === c.id ? 'imp-active' : '';
    const confClass = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' }[c.confidence] || 'LOW';
    const stClass = c.status;
    const canEdit = c.status === 'pending' || c.status === 'approved';
    return `<tr class="${dup} ${active}" data-id="${c.id}">
      <td><input type="checkbox" class="sms-chk" data-id="${c.id}" ${sel}></td>
      <td>${escapeHtml(c.txn_date || '')}</td>
      <td>${formatMoney(c.amount)}</td>
      <td class="imp-name-cell">${escapeHtml(c.payer_raw || '')}</td>
      <td>${canEdit
        ? `<select class="sms-house-select" data-id="${c.id}" data-field="house"><option value="">—</option>${impHouseOptions(c.matched_house_id)}</select>`
        : escapeHtml(c.house_name || (c.matched_house_id ? '#' + c.matched_house_id : ''))}</td>
      <td>${canEdit
        ? `<input class="sms-input" type="number" min="1" value="${c.months}" data-id="${c.id}" data-field="months">`
        : c.months}</td>
      <td>${canEdit
        ? `<input class="sms-input" style="width:96px" type="month" value="${escapeHtml(c.month_from || '')}" data-id="${c.id}" data-field="month_from">`
        : escapeHtml(c.month_from || '')}</td>
      <td class="imp-note-cell">${canEdit
        ? `<input class="sms-input" style="width:120px" type="text" value="${escapeHtml(c.note || '')}" data-id="${c.id}" data-field="note">`
        : escapeHtml(c.note || '')}</td>
      <td><span class="conf-badge ${confClass}">${c.confidence}</span></td>
      <td><span class="sms-badge st ${stClass}">${c.status}</span></td>
      <td><div class="imp-actions">
        ${c.status === 'approved' || c.status === 'pending'
          ? `<button class="sms-link" data-act="approve" data-id="${c.id}" title="Approve">✓</button>
             <button class="sms-link" data-act="reject" data-id="${c.id}" title="Reject">✕</button>`
          : `<button class="sms-link" data-act="undo" data-id="${c.id}" title="Back to pending">↺</button>`}
        ${c.status === 'pending' || c.status === 'approved'
          ? `<button class="sms-link" data-act="link" data-id="${c.id}" title="${escapeHtml(I18N.t('sms_link_title'))}">⛓</button>
             <button class="sms-link" data-act="dup" data-id="${c.id}" title="Duplicate">⛔</button>`
          : ''}
      </div></td>
    </tr>`;
  }).join('');
  const selAll = $('#importSelAll');
  if (selAll) selAll.checked = rows.length > 0 && impVisibleRows().every(c => impSelected.has(c.id));
}

function impBuildMonthFilter() {
  const sel = $('#importMonth');
  const months = [...new Set(smsCandidates.map(c => (c.txn_date || '').slice(0, 7)).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">' + escapeHtml(I18N.t('imp_month_all')) + '</option>' +
    months.map(m => `<option value="${m}">${m}</option>`).join('');
  sel.value = impMonth;
}

async function impUpdate(items) {
  const res = await api('/api/sms/review', 'POST', { updates: items });
  if (res.error) throw new Error(res.error);
  return res;
}

async function impLoad() {
  const data = await api('/api/sms/review');
  smsCandidates = data.candidates || [];
  state.sms_pending = smsCandidates.filter(c => c.status === 'pending').length;
  impSelected.clear();
  impBuildMonthFilter();
  impRenderSummary();
  impRenderTable();
  impRenderNamePool();
  updateStateBadge();
}

async function impAnalyze(file) {
  const status = $('#importStatus');
  status.textContent = I18N.t('sms_analyzing');
  try {
    const buf = await file.arrayBuffer();
    const res = await fetch(API + '/api/sms/analyze', { method: 'POST', body: buf });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || I18N.t('sms_analyze_failed'));
    status.textContent = I18N.t('sms_done', { n: data.summary ? data.summary.credits : 0 });
    await impLoad();
    toast(I18N.t('sms_done', { n: data.summary ? data.summary.credits : 0 }));
  } catch (e) {
    status.textContent = '';
    toast(e.message || I18N.t('sms_analyze_failed'));
  }
}

function impSelectedRows() {
  const ids = impVisibleRows().filter(c => impSelected.has(c.id)).map(c => c.id);
  return ids;
}

async function impBulk(status) {
  const ids = impSelectedRows();
  if (!ids.length) { toast(I18N.t('sms_none_selected')); return; }
  try {
    await impUpdate(ids.map(id => ({ id, status })));
    impSelected.clear();
    $('#importSelAll').checked = false;
    await impLoad();
  } catch (e) { toast(e.message || I18N.t('toast_server_error')); }
}

async function impMarkDup() {
  const ids = impSelectedRows();
  if (!ids.length) { toast(I18N.t('sms_none_selected')); return; }
  if (!confirm(I18N.t('imp_confirm_dup', { n: ids.length }))) return;
  try {
    await impUpdate(ids.map(id => ({ id, is_duplicate: 1 })));
    toast(I18N.t('imp_marked_dup', { n: ids.length }));
    impSelected.clear();
    await impLoad();
  } catch (e) { toast(e.message || I18N.t('toast_server_error')); }
}

async function impApproveHigh() {
  const high = smsCandidates.filter(c => c.status === 'pending' && c.confidence === 'HIGH');
  if (!high.length) { toast(I18N.t('sms_nothing_to_apply')); return; }
  if (!confirm(I18N.t('imp_confirm_approve_high', { n: high.length }))) return;
  try {
    await impUpdate(high.map(c => ({ id: c.id, status: 'approved' })));
    toast(I18N.t('imp_approved_high', { n: high.length }));
    await impLoad();
  } catch (e) { toast(e.message || I18N.t('toast_server_error')); }
}

async function impPreview() {
  const box = $('#importPreview');
  try {
    const res = await api('/api/sms/preview', 'POST', {});
    if (res.error) throw new Error(res.error);
    const plan = res.plan || [];
    if (!plan.length) { box.innerHTML = `<div class="import-empty">${I18N.t('imp_preview_empty')}</div>`; box.style.display = ''; return; }
    const tot = plan.reduce((s, p) => s + p.amount_per_month * p.months, 0);
    let html = `<h4>${I18N.t('imp_preview_title', { n: plan.length, amt: tot.toLocaleString() })}</h4><table>
      <thead><tr><th>${I18N.t('sms_col_house')}</th><th>${I18N.t('sms_col_months')}</th><th>${I18N.t('imp_col_amount_month')}</th><th>${I18N.t('sms_col_from')}</th><th>${I18N.t('imp_col_covered')}</th></tr></thead><tbody>`;
    html += plan.map(p => `<tr>
      <td>${escapeHtml(p.house_number || '')} · ${escapeHtml(p.house_name || '')}</td>
      <td>${p.months}</td><td>${p.amount_per_month.toLocaleString()}</td><td>${escapeHtml(p.month_from || '')}</td>
      <td>${p.covered.map(escapeHtml).join(', ')}</td></tr>`).join('');
    html += '</tbody></table>';
    if (res.conflicts && res.conflicts.length) {
      html += `<p class="conflict">${I18N.t('imp_preview_conflicts')} ${res.conflicts.length}</p>`;
    }
    box.innerHTML = html;
    box.style.display = '';
  } catch (e) { toast(e.message || I18N.t('toast_server_error')); }
}

async function impApply() {
  const approved = smsCandidates.filter(c => c.status === 'approved' && c.matched_house_id);
  const approvedUnmatched = smsCandidates.filter(c => c.status === 'approved' && !c.matched_house_id);
  if (approvedUnmatched.length) {
    toast(I18N.t('sms_apply_needs_link', { n: approvedUnmatched.length }));
  }
  if (!approved.length) {
    if (!approvedUnmatched.length) toast(I18N.t('sms_nothing_to_apply'));
    return;
  }
  try {
    const pv = await api('/api/sms/preview', 'POST', {});
    if (pv.error) throw new Error(pv.error);
    if ((pv.conflicts || []).length && !confirm(I18N.t('imp_apply_conflict_confirm'))) return;
    if (!confirm(I18N.t('sms_confirm_apply', { n: approved.length }))) return;
    const res = await api('/api/sms/apply', 'POST', {});
    toast(I18N.t('sms_applied', { n: res.applied || 0 }));
    $('#importPreview').style.display = 'none';
    await impLoad();
    await refreshAll();
  } catch (e) { toast(e.message || I18N.t('toast_server_error')); }
}

async function impRevert() {
  const applied = smsCandidates.filter(c => c.status === 'applied');
  if (!applied.length) { toast(I18N.t('sms_nothing_to_apply')); return; }
  if (!confirm(I18N.t('imp_revert_confirm', { n: applied.length }))) return;
  try {
    const res = await api('/api/sms/revert', 'POST', { ids: applied.map(c => c.id) });
    toast(I18N.t('imp_reverted', { n: res.reverted || 0, p: res.payments_removed || 0 }));
    await impLoad();
    await refreshAll();
  } catch (e) { toast(e.message || I18N.t('toast_server_error')); }
}

function impCsv() {
  const rows = impVisibleRows();
  if (!rows.length) { toast(I18N.t('sms_none_selected')); return; }
  const head = ['Date', 'Amount', 'Payer', 'House', 'Months', 'From', 'Confidence', 'Status', 'Note'];
  const lines = [head.join(',')];
  for (const c of rows) {
    const h = (state.houses || []).find(x => x.id === Number(c.matched_house_id));
    lines.push([c.txn_date, c.amount, '"' + (c.payer_raw || '').replace(/"/g, '""') + '"',
      '"' + (h ? h.house_number + ' ' + h.name : '').replace(/"/g, '""') + '"',
      c.months, c.month_from, c.confidence, c.status, '"' + (c.note || '').replace(/"/g, '""') + '"'].join(','));
  }
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'guardpay-sms-review.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast(I18N.t('imp_csv_downloaded'));
}

function impRenderNamePool() {
  const box = $('#importNamePool');
  if (!box) return;
  const counts = {};
  for (const c of smsCandidates) {
    const n = (c.payer_raw || '').trim();
    if (!n) continue;
    if (!counts[n]) counts[n] = { n: 0, amt: 0 };
    counts[n].n++; counts[n].amt += c.amount || 0;
  }
  const list = Object.entries(counts).sort((a, b) => b[1].n - a[1].n);
  box.innerHTML = list.length
    ? list.map(([name, v]) => `<div class="namepool-item" data-name="${escapeHtml(name)}" title="${escapeHtml(I18N.t('namepool_link_title'))}">
        <span>${escapeHtml(name)}</span><span class="np-count">${v.n} · ${v.amt.toLocaleString()}</span></div>`).join('')
    : `<div class="import-empty">${I18N.t('imp_namepool_empty')}</div>`;
}

function impLinkAsAlias(cand) {
  const name = (cand.payer_raw || '').trim();
  if (!name) { toast(I18N.t('sms_link_needs_house')); return; }
  const houseId = cand.matched_house_id;
  const h = (state.houses || []).find(x => x.id === Number(houseId));
  if (!houseId || !h) {
    const num = prompt(I18N.t('imp_link_house_ph') + ': ' + name);
    if (!num) return;
    if (!confirm(I18N.t('imp_link_new_confirm', { name }))) return;
    api('/api/houses', 'POST', { house_number: num, name, fee: settingDefaultFee() }).then(async () => {
      await refreshAll();
      const nh = (state.houses || []).find(x => String(x.house_number) === String(num));
      if (nh) await impUpdate([{ id: cand.id, matched_house_id: nh.id }]);
      toast(I18N.t('sms_linked'));
      await impLoad();
    }).catch(e => toast(e.message || I18N.t('toast_server_error')));
    return;
  }
  if (!confirm(I18N.t('sms_confirm_link', { name, house: h.house_number + ' ' + h.name }))) return;
  api('/api/sms/aliases', 'POST', { house_id: houseId, alias: name }).then(async () => {
    toast(I18N.t('sms_linked'));
    await impLoad();
  }).catch(e => toast(e.message || I18N.t('toast_server_error')));
}

function openImportSheet() {
  $('#importOverlay').classList.add('open');
  $('#importOverlay').setAttribute('aria-hidden', 'false');
  impLoad().then(() => {});
}

function closeImportSheet() {
  $('#importOverlay').classList.remove('open');
  $('#importOverlay').setAttribute('aria-hidden', 'true');
}

function wireImportSheet() {
  const openBtn = $('#openImportBtn');
  if (openBtn) openBtn.addEventListener('click', openImportSheet);
  const closeBtn = $('#importCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeImportSheet);
  const overlay = $('#importOverlay');
  if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeImportSheet(); });

  const pick = $('#importPickBtn');
  const file = $('#importFile');
  if (pick && file) {
    pick.addEventListener('click', () => file.click());
    file.addEventListener('change', () => { $('#importAnalyzeBtn').disabled = !file.files[0]; });
  }
  const ab = $('#importAnalyzeBtn');
  if (ab) ab.addEventListener('click', () => { if (file && file.files[0]) impAnalyze(file.files[0]); });
  const rb = $('#importRefreshBtn');
  if (rb) rb.addEventListener('click', impLoad);

  $$('#importStatusFilters [data-if]').forEach(b => {
    b.addEventListener('click', () => {
      $$('#importStatusFilters [data-if]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      smsFilter = b.dataset.if;
      impRenderTable();
    });
  });
  $$('#importConfFilters [data-ic]').forEach(b => {
    b.addEventListener('click', () => {
      $$('#importConfFilters [data-ic]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      smsConf = b.dataset.ic;
      impRenderTable();
    });
  });
  const ss = $('#importSearch');
  if (ss) ss.addEventListener('input', e => { smsQuery = e.target.value; impRenderTable(); });
  const mm = $('#importMonth');
  if (mm) mm.addEventListener('change', e => { impMonth = e.target.value; impRenderTable(); });
  const mn = $('#importMinAmt');
  if (mn) mn.addEventListener('input', e => { impMinAmt = e.target.value; impRenderTable(); });
  const mx = $('#importMaxAmt');
  if (mx) mx.addEventListener('input', e => { impMaxAmt = e.target.value; impRenderTable(); });
  const um = $('#importUnmatched');
  if (um) um.addEventListener('change', e => { impUnmatched = e.target.checked; impRenderTable(); });
  const dp = $('#importDupOnly');
  if (dp) dp.addEventListener('change', e => { impDupOnly = e.target.checked; impRenderTable(); });
  const so = $('#importSort');
  if (so) so.addEventListener('change', e => { impSort = e.target.value; impRenderTable(); });

  const selAll = $('#importSelAll');
  if (selAll) selAll.addEventListener('change', () => {
    const on = selAll.checked;
    $$('#importBody .sms-chk').forEach(cb => { cb.checked = on; });
    impVisibleRows().forEach(c => { if (on) impSelected.add(c.id); else impSelected.delete(c.id); });
  });

  const body = $('#importBody');
  if (body) {
    body.addEventListener('change', async e => {
      const el = e.target;
      const id = Number(el.dataset.id);
      const field = el.dataset.field;
      if (!field) return;
      const cand = smsCandidates.find(c => c.id === id);
      if (!cand) return;
      let patch = {};
      if (field === 'house') patch.matched_house_id = el.value ? Number(el.value) : null;
      else if (field === 'months') patch.months = Math.max(1, parseInt(el.value || '1', 10) || 1);
      else if (field === 'month_from') patch.month_from = el.value || '';
      else if (field === 'note') patch.note = el.value || '';
      try { await impUpdate([{ id, ...patch }]); Object.assign(cand, patch); impRenderTable(); impRenderSummary(); }
      catch (err) { toast(err.message || I18N.t('toast_server_error')); }
    });
    body.addEventListener('click', async e => {
      const cb = e.target.closest('.sms-chk');
      if (cb) {
        const id = Number(cb.dataset.id);
        if (cb.checked) impSelected.add(id); else impSelected.delete(id);
        const selAll = $('#importSelAll');
        if (selAll) selAll.checked = impVisibleRows().length > 0 && impVisibleRows().every(c => impSelected.has(c.id));
        return;
      }
      const btn = e.target.closest('.sms-link');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const act = btn.dataset.act;
      const cand = smsCandidates.find(c => c.id === id);
      if (!cand) return;
      impActiveId = id;
      try {
        if (act === 'approve') await impUpdate([{ id, status: 'approved' }]);
        else if (act === 'reject') await impUpdate([{ id, status: 'rejected' }]);
        else if (act === 'undo') await impUpdate([{ id, status: 'pending' }]);
        else if (act === 'dup') await impUpdate([{ id, is_duplicate: cand.is_duplicate ? 0 : 1 }]);
        else if (act === 'link') { impLinkAsAlias(cand); return; }
        await impLoad();
      } catch (err) { toast(err.message || I18N.t('toast_server_error')); }
    });
  }

  const asel = $('#importApproveSel');
  if (asel) asel.addEventListener('click', () => impBulk('approved'));
  const rsel = $('#importRejectSel');
  if (rsel) rsel.addEventListener('click', () => impBulk('rejected'));
  const dsel = $('#importDupSel');
  if (dsel) dsel.addEventListener('click', impMarkDup);
  const ahigh = $('#importApproveHigh');
  if (ahigh) ahigh.addEventListener('click', impApproveHigh);
  const pbtn = $('#importPreviewBtn');
  if (pbtn) pbtn.addEventListener('click', impPreview);
  const apbtn = $('#importApplyBtn');
  if (apbtn) apbtn.addEventListener('click', impApply);
  const rvbtn = $('#importRevertBtn');
  if (rvbtn) rvbtn.addEventListener('click', impRevert);
  const csv = $('#importCsvBtn');
  if (csv) csv.addEventListener('click', impCsv);

  const np = $('#importNamePool');
  if (np) np.addEventListener('click', async e => {
    const item = e.target.closest('.namepool-item');
    if (!item) return;
    const name = item.dataset.name;
    const cands = smsCandidates.filter(c => (c.payer_raw || '').trim() === name);
    if (!cands.length) return;
    impLinkAsAlias(cands[0]);
  });

  document.addEventListener('keydown', e => {
    if (!$('#importOverlay') || !$('#importOverlay').classList.contains('open')) return;
    if (e.key === 'Escape') closeImportSheet();
  });
}

function updateStateBadge() {
  const el = $('[data-nav="data"] .badge');
  if (el) el.textContent = state.sms_pending > 0 ? state.sms_pending : '';
}
