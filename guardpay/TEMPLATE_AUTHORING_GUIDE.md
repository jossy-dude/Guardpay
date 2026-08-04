# GuardPay — PDF Template Authoring Guide

> **Purpose.** When someone says *"make me a new printable/PDF export template for GuardPay"*,
> hand them this document. Follow it exactly and the resulting template will:
> (a) plug into the existing `PDF_TEMPLATES` structure with **zero refactoring**,
> (b) match GuardPay's visual design language,
> (c) print correctly on A4, and
> (d) be feature‑complete (page numbers, headers/footers, zebra striping, color‑coded
> status, currency formatting, empty‑state handling, long‑list pagination).

This guide is derived directly from the shipped code:
- `static/app.js` — `PDF_TEMPLATES`, `prepareReportData`, `pdfStyle`, the preview/print logic.
- `static/index.html` — the export modal (`#pdfTplGrid`, `#pdfPreviewFrame`).
- `static/style.css` — the design tokens (oklch palette, fonts, spacing, the seal/masthead aesthetic).

You may copy existing templates verbatim as a starting point — they live at
`app.js` lines **1267–1376** (`PDF_TEMPLATES`) and **1064–1265** (the shared helpers
`pdfStyle`, `pdfShell`, `pdfHouseTable`, `pdfSummaryRow`, `pdfGuardBlock`,
`pdfLeaderboardTable`, `pdfOverdueList`, `fmtDateStr`, `pdfBadge`, `formatMoney`,
`escapeHtml`).

---

## 1. The data contract — what every template receives

Each template is called as a **function `(d) => htmlString`** where `d` is the object
returned by `prepareReportData()` (`app.js:1125`). You never build data yourself — you
only read from `d`. The full shape (with real example values) is below.

```js
d = {
  settings: {                       // state.settings — raw app settings
    neighborhood_name: "Sunset Estate",   // string | undefined
    currency: "ETB",                       // string, defaults to 'ETB' if missing
    due_day: "5",                          // string (UI), e.g. "5"
    guard_name: "Night Watch Guard",      // string | undefined
    guard_salary: "8000"                   // string (UI) | number
  },

  monthKey: "2026-07",              // string, "YYYY-MM" for the current month
  monthLabel: "July 2026",          // string, human label of monthKey
  currency: "ETB",                  // string — same as settings.currency || 'ETB'

  // Array of current-month snapshots, one per household, in register order.
  houses: [
    {
      house_number: "131",          // string (e.g. "131") or number
      name: "Lensa Bekele",         // string
      fee: 500,                     // number
      status: "ontime",             // one of: 'ontime' | 'late' | 'overdue' | 'missed' | 'upcoming'
      paidDate: <Date|null>,        // Date object if paid, else null
      amount: 500,                  // number — amount credited this month (fee if paid, 0 if not)
      score: 420,                   // number — timeliness score / 100
      currentStreak: 6,             // number
      longestStreak: 11,            // number
      onTimeRate: 100               // number, 0–100
    }
    // ...one entry per household
  ],

  // Aggregate current-month figures.
  summary: {
    collected: 15000,               // number — sum of amounts for paid households
    expected: 25000,                // number — sum of all fees
    outstanding: 10000,             // number — expected - collected
    pct: 60,                        // number 0–100 — paidCount / total
    avgScore: 318,                  // number — rounded mean of house.score
    paidCount: 30,                  // number — households paid on time or late
    total: 50                       // number — total households in register
  },

  // Guard settlement block for the current month.
  guard: {
    name: "Neighborhood Guard",     // string — settings.guard_name || 'Neighborhood Guard'
    salary: 8000,                   // number — parseInt(guard_salary) || 8000
    collected: 15000,               // number — same as summary.collected
    surplus: 7000,                  // number — collected - salary
    payment: {                      // null if no guard payment recorded this month
      date: "2026-07-03",           // string YYYY-MM-DD
      method: "cash",               // string: 'transfer' | 'cash' | 'mobile' | undefined
      amount: 8000,                 // number
      note: "On time"               // string | undefined
    }
  },

  // Top 10 households by streak then score (descending).
  leaderboard: [
    { house: "131", name: "Lensa Bekele", score: 420, streak: 6 }
    // ... up to 10
  ],

  // Overdue/missed households, sorted by house number ascending. Empty array = all current.
  overdue: [
    { house: "132", name: "Dawit Taye", fee: 500 }
    // ...
  ],

  // 12-month rollup for the current year.
  annual: {
    year: 2026,
    months: [                       // 12 entries, Jan..Dec
      {
        mk: "2026-01",              // string YYYY-MM
        label: "January",          // string
        short: "Jan",              // string (3 chars)
        collected: 24000,          // number
        expected: 25000,           // number
        onTime: 92,                // number 0–100
        full: false                // boolean — expected>0 && collected>=expected
      }
      // ...
    ],
    totalCollected: 280000,         // number
    totalExpected: 300000,          // number
    completion: 93,                 // number 0–100
    guardYearTotal: 48000,          // number — sum of guard_payments for this year
    households: [                   // all households, scored for the year
      {
        house: "131", name: "Lensa Bekele", fee: 500,
        paidTotal: 6000,            // number — monthsPaid * fee
        monthsActive: 12,           // number — resolved months
        score: 420                  // number (note: house.score from current month)
      }
      // ...
    ]
  },

  generated: "7/10/2026, 3:24:11 PM"   // string — new Date().toLocaleString()
}
```

### Field‑by‑field rules
- **`d.settings`** is the raw settings object. Prefer `d.currency` and `d.monthLabel`
  over reading `settings` directly; they are pre‑normalized.
- **`status`** values map to badge classes via `statusClass()` (`app.js:63`):
  `ontime → 'paid'`, `late → 'late'`, `overdue/missed → 'overdue'`, `upcoming → 'upcoming'`.
  Use `pdfBadge(status)` (see §3) — never hand‑roll status pills.
- **Money** is printed through `formatMoney(n)` which appends the currency automatically
  (e.g. `formatMoney(15000)` → `"15,000 ETB"`). Do **not** append currency yourself.
- **Dates** are `Date` objects or ISO strings; render them with `fmtDateStr(x)` which
  returns a localized `"Jul 10, 2026"` or `"—"` for null/invalid. Never `toLocaleDateString`
  a raw field inline (it can throw on null).
- **Empty arrays** (`d.overdue`, `d.leaderboard`, `d.houses`) must have an explicit
  empty‑state row (see §5, `pdfOverdueList` does this at `app.js:1257`).
- **`d.annual.households[].score`** is the *current‑month* score, not a yearly average.
  Don't label it "yearly score" — call it "Score".

---

## 2. The template function signature

A PDF template is **a property on the `PDF_TEMPLATES` object** — a function taking the
`d` data object and returning a **complete standalone HTML document string**.

```js
const PDF_TEMPLATES = {
  // existing keys: standard | formal | guard-handover | resident | annual
  'my-template': function (d) {
    // 1. Build a style string with pdfStyle({...theme overrides...})
    const style = pdfStyle({ accent: '#xxxxxx', headBg: '#xxxxxx', headText: '#ffffff', line: '#xxxxxx' });

    // 2. Build the body string using the d.* contract and shared helpers
    const body = '...html...';

    // 3. Wrap in the document shell and RETURN the string
    return pdfShell(style, body);
  }
};
```

### To expose the template in the UI you must also do TWO things
1. **Register a label** in `PDF_TEMPLATE_LABELS` (`app.js:867`):
   ```js
   const PDF_TEMPLATE_LABELS = {
     // ...existing...
     'my-template': 'My New Template'
   };
   ```
2. **Add a selector tile** in `index.html` inside `#pdfTplGrid` (`index.html:323`),
   copying an existing `.tpl-opt` and changing `data-pdf="my-template"` and the title/desc:
   ```html
   <div class="tpl-opt" data-pdf="my-template" role="radio" tabindex="0" aria-checked="false">
     <div class="t">My New Template</div><div class="d">Short description of what it shows</div>
   </div>
   ```

### How the runtime consumes it (so you know what "done" means)
- **Live preview** (`renderPdfPreview`, `app.js:875`): sets `iframe.srcdoc` to
  `PDF_TEMPLATES[expPdf](prepareReportData())`. Your function must run in the **iframe's
  own document** with no access to app globals — only the `d` argument and the helpers
  defined above it in `app.js` are in scope. Keep all logic self‑contained in the function.
- **Print/export** (`doExport`, `app.js:964`): opens `window.open('', '_blank')`, writes
  the HTML, and calls `window.print()` after 600ms. This **prints the A4 `@page` CSS** —
  so your `@page` rules (§4) are what make it A4.
- **Fallback**: if `expPdf` isn't a key in `PDF_TEMPLATES`, the code falls back to
  `'standard'`. So a missing key silently produces the wrong template — always register
  the key and the label.

### Metadata convention (label/description/icon)
There is no per‑template metadata object — "label/description/icon" live in the HTML tile:
- **label** = the `.t` div text (also mirrored in `PDF_TEMPLATE_LABELS`).
- **description** = the `.d` div text.
- **icon** = a Unicode glyph prepended via CSS `::before` on `.t` (see
  `app.js:356`–`360`; e.g. `\1F4C4` for documents). Add one line per new key:
  ```css
  .pdf-tpl-wrap .tpl-opt[data-pdf="my-template"] .t::before{content:"\1F4DC  "}
  ```

---

## 3. Reusable helpers you MUST use (do not reinvent)

These are already defined in `app.js`. Reuse them so your output matches existing templates.

| Helper | Signature | Use it for |
|---|---|---|
| `pdfStyle(o)` | `pdfStyle({accent, headBg, headText, line})` | Returns the full `<style>` block **including `@page A4` and every class** (masthead-bar, stat, table, badge, etc.). Pass override colors. **Call this — do not write your own `<style>`.** |
| `pdfShell(style, body)` | `(styleStr, bodyStr) => htmlDoc` | Wraps `<style>` + `<div class="doc">…</div>` into `<!DOCTYPE html>…`. Always return its result. |
| `pdfHouseTable(houses, opts)` | `(d.houses, {showPaidDate, showScore, showStreak})` | Renders the standard ledger table with header repeating on every page, zebra striping, and empty‑state built in. `opts` keys are booleans. |
| `pdfSummaryRow(summary)` | `(d.summary) => html` | The 4‑stat "Collected / Outstanding / Completion / Avg timeliness" row. |
| `pdfGuardBlock(guard)` | `(d.guard) => html` | Guard settlement box (collected/salary/surplus + recorded payment). |
| `pdfLeaderboardTable(lb)` | `(d.leaderboard) => html` | Ranked leaderboard table with empty‑state. |
| `pdfOverdueList(overdue)` | `(d.overdue) => html` | Overdue follow‑up table; prints the 🎉 all‑current message when empty. |
| `pdfBadge(status)` | `pdfBadge('ontime') => html` | Color‑coded status pill using the shared `.badge` classes. Always use this for status. |
| `fmtDateStr(d)` | `(Date|string|null) => 'Jul 10, 2026' | '—'` | Safe date formatting. |
| `formatMoney(n)` | `(number) => '15,000 ETB'` | Currency formatting with thousands separators + currency suffix. |
| `escapeHtml(s)` | `(string) => escaped` | **Escape every dynamic string** you inject (names, neighborhood name, notes). Prevents broken layout / injection. |

> Rule of thumb: if a helper exists for it, use it. The only thing you *customize* is the
> `pdfStyle` color overrides and the arrangement of `body`.

---

## 4. Required print CSS conventions

These are enforced by `pdfStyle()` (`app.js:1074`). **Do not override them** unless you
have a reason and re‑test print output. Documented here so you understand why they exist
and so you don't break them.

### @page A4 + margins
```css
@page { size: A4; margin: 15mm 14mm;
  @bottom-center { content: "Page " counter(page) " of " counter(pages);
    font-family:Arial,sans-serif; font-size:9px; color:#9aa; } }
@page :first { margin-top: 12mm; }
```
- A4 is the paper size. Do not change `size`.
- The page footer with `"Page X of Y"` is automatic — **do not add your own footer
  page counter** (you can't; `counter(pages)` only works in `@page`).
- Keep content inside the print margin. The `.doc` wrapper is `max-width:780px; margin:0 auto`.

### Print color fidelity (CRITICAL)
```css
body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
```
This makes backgrounds (masthead bar, badges, zebra rows) actually print. **Never remove
it** — many browsers drop background colors by default, which would white‑out your design.

### Avoid cutting rows across pages
```css
thead { display: table-header-group; }   /* repeats table header on each page */
```
- `pdfHouseTable` already uses this. If you hand‑write a `<table>`, include `thead` with
  `display:table-header-group` and wrap each data row so a row never splits.
- To force a clean page break between major sections:
  ```css
  .pagebreak { page-break-before: always; }
  ```
  Add the class to a section's wrapper (the `annual` template uses it at `app.js:1370`).
- Avoid `page-break-inside: avoid` on very tall blocks (they can vanish) — prefer it only on
  single rows/cards.

### Zebra striping & borders (already in `pdfStyle`)
```css
tbody tr:nth-child(even) { background:#f7f9fb; }
tbody td { border-bottom:1px solid <line>; }
thead th { background:<headBg>; color:<headText>; border-bottom:2px solid <accent>; }
```
Maintain these for readability on long lists. Reuse `<line>`/`<accent>` from your `pdfStyle` args.

---

## 5. Design tokens — make templates look native

The app's design language is a **warm editorial "newspaper ledger"**: Playfair‑style serif
display headings, Inter/mono body, an oklch palette, generous spacing, a "seal"/masthead
aesthetic, and color‑coded status. Templates print as a *document*, not a screenshot of the
UI, so we approximate the palette with **hex equivalents** (the `pdfStyle` args) and reuse
the serif headings.

### Color tokens
The app uses oklch variables (`style.css:1`). For PDF we pass hex. Existing template accents:

| Token | App oklch (`:root`) | Hex used in PDF templates |
|---|---|---|
| `--accent` | `oklch(52% 0.13 35)` | `#1d7a44` (standard) — *choose a hue per template* |
| `--green` | `oklch(56% 0.13 152)` | `#1d7a44` / `#0f7b8a` |
| `--danger` | `oklch(54% 0.17 25)` | badge overdue `#b42318` |
| text fg | `oklch(23% 0.02 60)` | `#1f2933` |
| muted | `oklch(52% 0.014 60)` | `#7b8794` / `#5a6b7b` |
| line | `oklch(88% 0.008 80)` | `#e1e6ea` (standard) |
| surface zebra | — | `#f7f9fb` |

**Per‑template accent palette (from shipped templates)** — pick one family and stay
consistent within the doc:
- `standard` → green `#1d7a44`, headBg `#1d7a44`, headText `#ffffff`, line `#e1e6ea`
- `formal` → navy `#2b3a55`, headBg `#2b3a55`, line `#d8dde3`
- `guard-handover` → amber `#b4690e`, headBg `#b4690e`, line `#e7ddcf`
- `resident` → teal `#0f7b8a`, headBg `#0f7b8a`, line `#d9e6e8`
- `annual` → purple `#5b3a8e`, headBg `#5b3a8e`, line `#e2dcec`

Badge colors (fixed in `pdfStyle`, do not change):
- paid → bg `#e3f5ea` / text `#1d7a44`
- late → bg `#fdf2dc` / text `#9a6b14`
- overdue → bg `#fde4e1` / text `#b42318`
- upcoming → bg `#eef1f4` / text `#5a6b7b`

### Typography
- Body / data: `Arial, Helvetica, sans-serif`, base `font-size:12px`, `line-height:1.5`.
- Display headings (`h1,h2,h3`, `.cover-title`, `.section-title`): `Georgia, "Times New Roman", serif`.
- Monospace for numbers/labels: `Arial` fallback; the app uses `'JetBrains Mono'`/`ui-monospace`
  on screen but PDFs stick to Arial for portability. Right‑align numeric columns with
  `.num { text-align:right; font-variant-numeric: tabular-nums; }`.

### Spacing & shape language
- Cards/stat boxes: `border-radius:8px`, `border:1px solid <line>`, `padding:12px 14px`.
- Section gap: `.section { margin-top:22px }`; section title is `font-size:15px`,
  `border-bottom:2px solid <accent>`, `padding-bottom:4px`, `margin-bottom:10px`.
- The masthead bar (cover) is `border-radius:8px`, `padding:18px 22px`, flex space‑between,
  `headBg` background with `headText` text — this is the signature "seal/masthead" look.
  Mirror it: kicker (uppercase, letter‑spaced) + title on the left, period on the right.
- Double‑rule letterhead (formal template) uses `border-bottom:3px double <accent>`.

### Status semantics (must stay color‑consistent everywhere)
| status | meaning | badge class |
|---|---|---|
| `ontime` | paid on/before due day | `.badge.paid` |
| `late` | paid after due day | `.badge.late` |
| `overdue` | due, not paid (past) | `.badge.overdue` |
| `missed` | a past month never paid | `.badge.overdue` |
| `upcoming` | not yet due | `.badge.upcoming` |

---

## 6. Reusable skeleton / boilerplate

Copy this as the starting point for any new template. It is a filled‑in, commented variant
of the `standard` template with placeholders. Drop it into `PDF_TEMPLATES`, then tune
`ACCENT`/`HEAD_BG`/`LINE` and the body sections.

```js
'my-template': function (d) {
  /* ---------- 1. THEME OVERRIDES (pick a hue family, see §5) ---------- */
  const ACCENT  = '#1d7a44';   // your template's signature hue
  const HEAD_BG = '#1d7a44';   // masthead/header background
  const HEAD_TX = '#ffffff';   // masthead/header text
  const LINE    = '#e1e6ea';   // hairline borders / zebra contrast

  /* ---------- 2. STYLE: always via pdfStyle() (includes @page A4) ---------- */
  const style = pdfStyle({ accent: ACCENT, headBg: HEAD_BG, headText: HEAD_TX, line: LINE });

  /* ---------- 3. BODY: build from the d.* contract ---------- */
  const body =
    /* Cover / masthead — the signature "seal" bar. Escape all dynamic text. */
    '<div class="masthead-bar">' +
      '<div>' +
        '<div class="kicker">' + escapeHtml(d.settings.neighborhood_name || 'Neighborhood Watch') + '</div>' +
        '<div class="cover-title">MY TEMPLATE TITLE</div>' +   // <- customize
      '</div>' +
      '<div class="cover-period">' + escapeHtml(d.monthLabel) + '</div>' +
    '</div>' +
    /* Meta line under the cover */
    '<div class="cover-meta">Generated ' + escapeHtml(d.generated) +
      ' · Currency ' + escapeHtml(d.currency) + ' · ' + d.summary.total + ' households</div>' +

    /* Summary stats (reuse helper) */
    '<div class="section">' + pdfSummaryRow(d.summary) + '</div>' +

    /* Ledger table — opts flag which columns to show. Empty-state is built in. */
    '<div class="section"><div class="section-title">Household Ledger</div>' +
      pdfHouseTable(d.houses, { showPaidDate: true, showScore: true, showStreak: false }) +
    '</div>' +

    /* Guard settlement (omit if your template is resident-facing) */
    '<div class="section"><div class="section-title">Guard Settlement</div>' +
      pdfGuardBlock(d.guard) +
    '</div>' +

    /* Overdue follow-up (prints 🎉 all-current message when empty) */
    '<div class="section"><div class="section-title">Overdue & Follow-up</div>' +
      pdfOverdueList(d.overdue) +
    '</div>' +

    /* Footer note (page numbers are automatic via @page) */
    '<div class="foot">Generated by GuardPay · ' +
      escapeHtml(d.settings.neighborhood_name || 'Neighborhood Watch') +
      ' · ' + escapeHtml(d.monthLabel) + '</div>';

  /* ---------- 4. RETURN the wrapped document ---------- */
  return pdfShell(style, body);
}
```

### Adding a custom section (e.g. a totals table)
Use the existing `.stat` / `.totals` classes so styling is consistent:
```js
'<div class="section"><div class="section-title">Compliance Totals</div>' +
  '<table><thead><tr><th>Item</th><th class="num">Amount</th></tr></thead><tbody>' +
    '<tr><td>Expected</td><td class="num">' + formatMoney(d.summary.expected) + '</td></tr>' +
    '<tr><td>Collected</td><td class="num">' + formatMoney(d.summary.collected) + '</td></tr>' +
    '<tr class="totals"><td>Surplus</td><td class="num">' + formatMoney(d.guard.surplus) + '</td></tr>' +
  '</tbody></table></div>'
```

### Forcing a page break before a section
Add `pagebreak` to the section wrapper:
```js
'<div class="section pagebreak"><div class="section-title">Per-Household Summary</div>' + ... + '</div>'
```

### Custom status rendering (when not using pdfHouseTable)
```js
pdfBadge(h.status)   // returns <span class="badge paid">Paid on time</span> etc.
```
Use it for single statuses; use `statusLabel(s)` / `statusClass(s)` (`app.js:60`) if you
need the text or class separately.

### Long-list pagination
You get it for free from `thead { display:table-header-group }` in `pdfStyle`. Just ensure
every `<table>` you author has a `<thead>` and that rows are plain `<tr>` (no wrapper divs
inside `<tbody>` that would block header repetition). For very long custom lists, consider
chunking into multiple `<table>` blocks each with its own `<thead>`.

---

## 7. "Done" checklist (author must satisfy all)

**Contract & data**
- [ ] Template is a function `(d) => string` added to `PDF_TEMPLATES` (key matches a
      `data-pdf` tile and a `PDF_TEMPLATE_LABELS` entry).
- [ ] Only reads `d` — no global/app state referenced (it runs inside an isolated iframe).
- [ ] Every injected string is wrapped in `escapeHtml(...)` (names, neighborhood, notes).
- [ ] All money via `formatMoney(...)`; all dates via `fmtDateStr(...)`; all status via
      `pdfBadge(...)` / `statusClass(...)`.
- [ ] Empty states handled: `d.houses`, `d.overdue`, `d.leaderboard` empty → a
      "No households…" / "All current 🎉" row (reuse the helpers; they already do this).

**Layout & print**
- [ ] Style built with `pdfStyle({accent,headBg,headText,line})`; result wrapped by
      `pdfShell(style, body)`. No hand‑written `@page` or `<style>` that would shadow it.
- [ ] Prints on **A4** with the automatic `"Page X of Y"` footer (verify in the preview iframe → print preview).
- [ ] `print-color-adjust:exact` is present (it is, via `pdfStyle`) — backgrounds print.
- [ ] Long lists paginate with repeated table headers; no row is split across a page
      awkwardly; `.pagebreak` used between major sections where needed.

**Design language**
- [ ] Accent/header colors form one consistent family; masthead bar uses the signature
      kicker + title / period layout.
- [ ] Serif display headings, Arial body, mono/tabular numerics right‑aligned.
- [ ] Zebra striping, `.section-title` underline in accent, rounded cards with hairline borders.
- [ ] Status colors match the badge semantics table (§5).

**UX / wiring**
- [ ] Selector tile added to `#pdfTplGrid` in `index.html` with correct `data-pdf`,
      title, and description; an icon `::before` rule added in `style.css`.
- [ ] Live preview renders without errors (`renderPdfPreview` falls back to `standard`
      only if the key is missing — so a broken template shows as the fallback, which is a
      bug; confirm yours renders).
- [ ] "Generate & download" opens the print dialog and the output looks identical to preview.
- [ ] No console errors when the template function executes.

---

## 8. Common mistakes to avoid (observed in / around the current code)

1. **Forgetting to register the key in three places.** A new template needs (a) a property
   in `PDF_TEMPLATES`, (b) an entry in `PDF_TEMPLATE_LABELS`, and (c) a `.tpl-opt[data-pdf]`
   tile in `index.html`. Miss any one and the template is unreachable or silently falls back
   to `standard` (`app.js:886`, `app.js:965`).

2. **Hand‑writing `<style>` instead of `pdfStyle()`.** The `@page A4`, `print-color-adjust`,
   `thead` repetition, zebra, and badge classes all live in `pdfStyle`. Re‑writing them
   risks dropping the page footer or color fidelity. Always call `pdfStyle(...)`.

3. **Escaping dynamic text.** `d.settings.neighborhood_name`, `d.houses[].name`, and
   `guard.payment.note` are user input. The `resident`/`formal` templates escape them; if you
   interpolate raw you risk broken HTML and an injection vector. Wrap in `escapeHtml(...)`.

4. **Appending currency manually.** `formatMoney(n)` already appends the currency
   (`"15,000 ETB"`). Writing `formatMoney(x) + ' ' + d.currency` double‑prints it.

5. **Calling `.toLocaleDateString()` on a possibly‑null date.** `paidDate` can be `null` and
   raw history dates can be invalid. The app's `fmtDateStr()` guards this and returns `"—"`.
   Use it; don't inline formatting.

6. **Using screen CSS variables (`var(--accent)`, `oklch(...)`) inside the PDF HTML.**
   The preview iframe and print window do **not** have GuardPay's `:root` theme variables.
   The `pdfStyle` args take **hex** strings for exactly this reason. Hard‑coding oklch will
   render as default/black in print.

7. **Breaking long‑list pagination.** Wrapping `<tbody>` rows in extra `<div>`s, or omitting
   `<thead>`, stops header repetition and can split rows. Keep tables flat with a real
   `<thead>`. The shared `pdfHouseTable` is safe; custom tables must follow the same shape.

8. **Adding your own page‑number footer.** `counter(pages)` only works inside `@page`. A
   `<div class="foot">Page …</div>` cannot know the total pages and will show wrong numbers.
   Rely on the `@bottom-center` rule in `pdfStyle`.

9. **Mislabeling `annual.households[].score`.** It is the *current‑month* score, not a yearly
   average. Don't caption it "Yearly score" (the `annual` template correctly labels it "Score").

10. **`annual` data only covers the current year.** `prepareReportData` calls
    `getYearData(new Date().getFullYear())`. Future/historical years are not provided to PDF
    templates — don't build a template that assumes an arbitrary selectable year.

11. **`generatePDF()` is dead/legacy code.** There is an older `generatePDF()` (`app.js:1378`)
    that does NOT use `PDF_TEMPLATES` and is not wired to any button. Don't extend it — add to
    `PDF_TEMPLATES` instead, which is what the export modal actually uses.

12. **Theme/oklch mismatch between screen and print.** Screen uses 5 themes (light/dark/sepia/
    midnight/forest). PDFs ignore the active theme and always print the light‑equilibrium
    palette via the hex `pdfStyle` args. Do not try to read `data-theme` inside a template —
    it isn't passed in `d`.

---

### TL;DR for the engineer
- **Data contract:** the single object returned by `prepareReportData()` — keys
  `settings, monthKey, monthLabel, currency, houses[], summary{}, guard{}, leaderboard[],
  overdue[], annual{}, generated`. Money ⇒ `formatMoney`, dates ⇒ `fmtDateStr`, status ⇒ `pdfBadge`.
- **Signature:** `PDF_TEMPLATES['key'] = function(d){ return pdfShell(pdfStyle({accent,headBg,headText,line}), body); }`,
  plus a `PDF_TEMPLATE_LABELS` entry and a `#pdfTplGrid` tile. No other refactoring needed.
