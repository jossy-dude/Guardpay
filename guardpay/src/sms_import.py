"""
SMS import — a dedicated CBE SMS-backup (XML) parser that builds a review
queue of *credits* landing in the guard's own CBE bank account.

Design
======
The Telegram-backed SMS backup contains transaction alerts from several
banks. Only **CBE bank alerts** are imported (telebirr and CBEBirr transfers
are intentionally kept manual). The guard pays and receives money into ONE
Commercial Bank of Ethiopia account whose masked short number ends in
``guard_account_suffix`` (e.g. ``3325``; full number ``1000665063325``).
CBE announces credits to that account in three shapes:

  * CBE bank      ``Account 1***3325 has been Credited with ETB 3,000.00``
  * CBE named     ``Account 1***3325 has been credited by NAME with ETB 8000.00``
  * CBE received  ``You have received ETB 12,000.00 from account 1***9324
                     (Faris Bedilu Anbase) to your account 1***3325``

The same money is ALSO announced as a *debit* on the payer's own account, so we
only count *credits into the guard account*, and we always resolve the RECIPIENT
account (never the first account, which is usually the SENDER).

Guidance encoded here
---------------------
* Reads the ``body``/``address``/``date`` XML attributes of every ``<sms>``.
* Routes strictly on a CBE credit arriving at the guard suffix.
* Amounts use a strict number shape so a trailing sentence period never breaks
  Decimal parsing (the bug that silently dropped the 30+ "received" credits).
* Confidence reflects how strongly a credit looks like a guard-fee payment
  (fee multiple) and whether the payer matches a known house/alias.
"""
import re
import unicodedata
from datetime import datetime
from decimal import Decimal

# ---------------------------------------------------------------------------
# Amount parsing
# ---------------------------------------------------------------------------
# Amounts appear as 4000, 4,000, 4,000.00, 5080.5, 7000.00Br. A trailing
# sentence period is NOT part of the number.
_AMT = r'\d[\d,]*(?:\.\d+)?'
_ETB_RE = re.compile(r'ETB\s*(' + _AMT + ')', re.I)
_BR_RE = re.compile(r'Br\.?\s*(' + _AMT + ')', re.I)


def _to_int(value):
    try:
        s = str(value).replace(',', '').strip()
        s = re.sub(r'\D+$', '', s)
        return int(Decimal(s))
    except Exception:
        return 0


def _to_decimal(value):
    try:
        return Decimal(str(value).replace(',', ''))
    except Exception:
        return Decimal('0')


# ---------------------------------------------------------------------------
# Name normalisation — Ethiopian names
# ---------------------------------------------------------------------------
_HONORIFICS = re.compile(
    r'^(ato|a?to|w/ro|wro|w/o|wo|weizero|woizero|weizerit|w?rt|mr|mrs|ms|miss|'
    r'mx|dr|eng|prof|professor|sheikh|hajj|hadji|sir|madam)\s+', re.I)
_PUNCT_RE = re.compile(r"[^a-z0-9 ]")


def normalize_name(raw):
    """Lowercase, strip honoring titles + punctuation, collapse whitespace."""
    if not raw:
        return ''
    t = unicodedata.normalize('NFKD', str(raw))
    t = ''.join(c for c in t if not unicodedata.combining(c))
    t = t.lower()
    t = t.replace('/', ' ').replace('-', ' ')
    t = _PUNCT_RE.sub(' ', t)
    while _HONORIFICS.match(t):
        t = _HONORIFICS.sub('', t).strip()
    return re.sub(r'\s+', ' ', t).strip()


def name_similar(a, b):
    """Similarity 0..1 between two raw names (order-tolerant)."""
    na, nb = normalize_name(a), normalize_name(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    sa, sb = set(na.split()), set(nb.split())
    jac = len(sa & sb) / len(sa | sb) if (sa | sb) else 0.0
    if jac >= 0.5:
        return jac
    return 0.25


def match_house(name, houses, aliases, threshold=0.5):
    """Best house id + score for a payer name, else (None, 0.0).

    Compares against house names and house aliases (order-tolerant).
    """
    best_id, best = None, 0.0
    for h in houses:
        sc = name_similar(name, h['name']) if h.get('name') else 0.0
        if sc > best:
            best, best_id = sc, h['id']
    for a in aliases:
        if a.get('house_id') is None:
            continue
        sc = name_similar(name, a['alias'])
        if sc > best:
            best, best_id = sc, a['house_id']
    if best >= threshold:
        return best_id, best
    return None, best


def name_key(name):
    n = normalize_name(name)
    return ' '.join(sorted(n.split())) if n else ''


# ---------------------------------------------------------------------------
# CBE message formats (recipient-limited)
# ---------------------------------------------------------------------------
_ACCT = r'1\*{2,}(\d{4})'              # masked CBE account 1***3325
_ACCT_FULL = r'(?:1000\d{6}?|\d{6,})(\d{4})\b'

# Account 1***3325 has been Credited with ETB 3,000.00
_RE_CR_WITH = re.compile(
    r'account\s+' + _ACCT + r'\s+has\s+been\s+credited\s+with\s+etb\s*(' + _AMT + ')',
    re.I)
# Account 1***3325 has been Credited with ETB 12,000.00 from Amelework Girma,
#   on 15/07/2026 at 11:51:22 with Ref No FT261962XD37
_RE_CR_WITH_FROM = re.compile(
    r'account\s+' + _ACCT + r'\s+has\s+been\s+credited\s+with\s+etb\s*(' + _AMT +
    r')\s+from\s+([^,]+?)\s*,' , re.I)
_RE_FROM_NAME = re.compile(r'\sfrom\s+([^,]+?)\s*,')
_RE_REF_NO = re.compile(r'with\s+ref(?:erence)?\s+no\.?\s+([A-Za-z0-9]+)', re.I)
# Account 1***3325 has been credited by NAME with ETB 8000.00
_RE_CR_BY = re.compile(
    r'account\s+' + _ACCT + r'\s+has\s+been\s+credited\s+by\s+(.+?)\s+with\s+etb\s*(' +
    _AMT + ')', re.I)
# You have received ETB 12,000.00 from account 1***9324 (Faris Bedilu Anbase)
# to your account 1***3325
_RE_CR_RECV = re.compile(
    r'you\s+have\s+received\s+etb\s*(' + _AMT + r')\s+from\s+account\s+' + _ACCT +
    r'\s*(?:\(\s*([^)]*)\s*\)\s*)?to\s+your\s+account\s+' + _ACCT, re.I)
# Current Balance is ETB130,000.11 / Available Balance is ETB25485.26
_RE_BALANCE = re.compile(
    r'(?:current|available|avail\.?|your\s+current)\s+balance\s+is\s+' +
    r'(?:etb\s*)?(' + _AMT + ')', re.I)

# leave-clear of the guard's OWN debit messages (non-credits)
_DEBIT_HINT = re.compile(
    r'\bdebited\b|\bwithdraw(a l)?\b|internet\s+package|recharge|receipt\s+of|'
    r'\bpaid\s+etb\b|\blent\s+from\b', re.I)

# CBE bank-alert messages (the only import scope; telebirr/CBEBirr kept manual)
_SENDER_BANK = {'CBE': 'CBE'}


def _unescape_attr(s):
    import html as _html
    return _html.unescape(s)


def _local_date(ts_ms):
    try:
        return datetime.fromtimestamp(int(ts_ms) / 1000.0).strftime('%Y-%m-%d')
    except Exception:
        return ''


def add_months(ym, n):
    if not ym or '-' not in ym:
        return ym
    y, m = int(ym[:4]), int(ym[5:7])
    t = y * 12 + (m - 1) + n
    return '%04d-%02d' % (t // 12, t % 12 + 1)


def month_of(date_str):
    return date_str[:7] if date_str and len(date_str) >= 7 else ''

# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------
def _pick_balance(text):
    m = _RE_BALANCE.search(text)
    return _to_int(m.group(1)) if m else None


def _extract_credit(text, sender, suffix):
    """Return a credit dict from ONE message, or None if not a credit into suffix.

    ``suffix`` is the guard's 4-digit account ending (e.g. '3325').
    """
    t = ' '.join(text.split())
    bank = _SENDER_BANK.get(sender)
    if bank is None:
        return None
    if _DEBIT_HINT.search(t):
        return None

    payer_raw = ''
    amount = None
    ref_no = ''
    account = suffix

    # --- CBE credit formats (recipient = guard account) ---
    m = _RE_CR_BY.search(t)
    if m:
        acct = m.group(1)
        if acct == suffix:
            payer_raw = m.group(2)
            amount = _to_int(m.group(3))
    else:
        m = _RE_CR_RECV.search(t)
        if m:
            recv_acct = m.group(4)
            if recv_acct == suffix:
                amount = _to_int(m.group(1))
                payer_raw = m.group(3).strip() if m.group(3) else ''
        else:
            m = _RE_CR_WITH.search(t)
            if m and m.group(1) == suffix:
                amount = _to_int(m.group(2))
                fm = _RE_FROM_NAME.search(t)
                if fm:
                    payer_raw = fm.group(1).strip()
                rm = _RE_REF_NO.search(t)
                if rm:
                    ref_no = rm.group(1)

    if amount is None or amount <= 0:
        return None
    balance = _pick_balance(t)
    return {
        'bank': bank,
        'account_last4': suffix,
        'direction': 'credit',
        'amount': amount,
        'balance': balance or 0,
        'ref_no': ref_no,
        'payer_raw': payer_raw,
        'sender': sender,
    }


def analyze(raw, settings, houses, aliases):
    """Parse an SMS-backup byte/str XML into a review queue of credits.

    Returns ``{'summary': {...}, 'candidates': [...], 'name_pool': [...]}``.
    The XML layout (SMS Backup & Restore):
      <sms protocol="0" address="CBE" date="...">...</sms>
    """
    suffix = str(settings.get('guard_account_suffix', '')).strip() or '3325'
    try:
        import xml.etree.ElementTree as ET
    except ImportError:
        ET = None

    raw = raw if isinstance(raw, bytes) else str(raw).encode('utf-8', 'ignore')

    credits = []
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(raw)
        for sms in root:
            if sms.tag != 'sms':
                continue
            address = sms.get('address', '')
            if address not in _SENDER_BANK:
                continue
            ts = sms.get('date', '') or ''
            ts_ms = int(ts) if ts.isdigit() else 0
            cr = _extract_credit(sms.get('body', ''), address, suffix)
            if cr:
                cr['txn_ts'] = ts_ms
                cr['txn_date'] = _local_date(ts_ms)
                cr['sort_ts'] = ts_ms
                credits.append(cr)
    except Exception:
        # Fallback: naive text scan on <sms ... body="..."> attributes
        import re as _re
        data = raw.decode('utf-8', 'ignore')
        for m in _re.finditer(
                r'<sms\b[^>]*\saddress="([^"]*)"[^>]*\sdate="([^"]*)"[^>]*'
                r'\sbody="((?:[^"\\]|\\.)*)"', data):
            address, dat, body = m.group(1), m.group(2), _unescape_attr(m.group(3))
            if address not in _SENDER_BANK:
                continue
            ts_ms = int(dat) if dat.isdigit() else 0
            cr = _extract_credit(body, address, suffix)
            if cr:
                cr['txn_ts'] = ts_ms
                cr['txn_date'] = _local_date(ts_ms)
                cr['sort_ts'] = ts_ms
                credits.append(cr)

    # ---------------- normalise / dedup ----------------
    seen = {}
    ordered = []
    for cr in credits:
        if not isinstance(cr, dict):
            continue
        key = (cr['txn_ts'], cr['account_last4'], cr['amount'])
        if key in seen:
            continue
        seen[key] = True
        ordered.append(cr)
    credits = ordered

    # ---------------- name pool ----------------
    pool = {}
    for cr in credits:
        name = normalize_name(cr['payer_raw'])
        if not name:
            continue
        p = pool.setdefault(name_key(cr['payer_raw']),
                            {'raw': cr['payer_raw'], 'count': 0, 'amounts': []})
        p['count'] += 1
        if cr['amount'] not in p['amounts']:
            p['amounts'].append(cr['amount'])
    name_pool = [
        {'name': v['raw'], 'count': v['count'], 'amounts': sorted(v['amounts'])}
        for v in pool.values()
    ]
    name_pool.sort(key=lambda x: (-x['count'], x['name']))

    # ---------------- confidence ----------------
    for cr in credits:
        matched_id, mscore = match_house(cr['payer_raw'], houses, aliases)
        cr['match_score'] = mscore
        cr['matched_house_id'] = matched_id
        cr['confidence'] = _confidence(cr, houses, aliases)
        cr['months'] = 1
        cr['month_from'] = cr['txn_date'][:7] if cr['txn_date'] else ''
        cr['status'] = 'pending'

    candidates = sorted(credits, key=lambda x: (-(x['txn_ts'] or 0), x['amount']))
    summary = {
        'credits': len(candidates),
        'matched': sum(1 for c in candidates if c['matched_house_id']),
        'high': sum(1 for c in candidates if c['confidence'] == 'HIGH'),
        'medium': sum(1 for c in candidates if c['confidence'] == 'MEDIUM'),
        'low': sum(1 for c in candidates if c['confidence'] == 'LOW'),
        'names': len(name_pool),
        'start': min((c['txn_date'] for c in candidates if c['txn_date']), default=''),
        'guard_account': suffix,
    }
    return {'summary': summary, 'candidates': candidates, 'name_pool': name_pool}


# ---------------------------------------------------------------------------
# Confidence
# ---------------------------------------------------------------------------
def _confidence(cr, houses, aliases):
    name = normalize_name(cr['payer_raw'])
    amount = cr['amount'] or 0

    # known payer name OR clear fee multiple => HIGH
    if name:
        for h in houses:
            if name_similar(name, h['name']) >= 0.5:
                return 'HIGH'
        for a in aliases:
            if a.get('house_id') and name_similar(name, a['alias']) >= 0.5:
                return 'HIGH'

    if amount in (200, 400, 800, 1200, 1600, 2000, 2400, 3000, 4000, 5000, 8000,
                  10000, 12000, 16000, 20000, 24000, 30000, 40000, 50000):
        return 'HIGH'
    if amount % 1000 == 0 and amount >= 1000:
        return 'MEDIUM'
    return 'LOW'


def suggest_houses(query, houses, aliases, limit=5):
    """Fuzzy-suggest houses for a typed name (used in the review UI)."""
    scores = []
    for h in houses:
        sc = name_similar(query, h['name']) if h['name'] else 0.0
        for a in aliases:
            if a['house_id'] == h['id']:
                sc = max(sc, name_similar(query, a['alias']))
        scores.append((sc, h))
    scores.sort(key=lambda x: x[0], reverse=True)
    return [{'id': h['id'], 'name': h['name'], 'score': round(sc, 3)}
            for sc, h in scores[:limit] if sc > 0.0]


def selftest():
    """Per-format unit checks: each message shape must produce the expected
    (amount, payer, account) credit. Returns (ok, detail_list)."""
    checks = [
        ("credited-with",
         "CBE", "Dear Customer your Account 1********3325 has been Credited with ETB 3,000.00. "
                "Your Current Balance is ETB 3313.18. Thank you for Banking with CBE!",
         3000, '', '3325'),
        ("credited-by",
         "CBE", "Dear Customer your Account 1********3325 has been credited by MELESE AMSALU HAILU "
                "with ETB 8000.00. Your Available Balance is ETB 25485.26.",
         8000, 'MELESE AMSALU HAILU', '3325'),
("received",
         "CBE", "Dear Customer, You have received ETB 12,000.00 from account 1********9324 "
                "(Faris Bedilu Anbase) to your account 1********3325. Current Balance is ETB 48000.00.",
         12000, 'Faris Bedilu Anbase', '3325'),
        ("credited-with-from",
         "CBE", "Dear Eyosiyas your Account 1*********3325 has been Credited with ETB 12,000.00 "
                "from Amelework Girma, on 15/07/2026 at 11:51:22 with Ref No FT261962XD37 "
                "Your Current Balance is ETB 39,329.85. Thank you for Banking with CBE!",
         12000, 'Amelework Girma', '3325'),
        ("wrong-suffix-ignored",
         "CBE", "Dear Customer your Account 1********7849 has been Credited with ETB 5.00.",
         None, '', '3325'),
        ("debit-ignored",
         "CBE", "Dear Customer your Account 1********3325 has been debited with ETB 5.00.",
         None, '', '3325'),
        ("amount-no-period-clash",
         "CBE", "Dear Customer your Account 1********3325 has been Credited with ETB 150,000.00. "
                "Your Current Balance is ETB 133,000.00.",
         150000, '', '3325'),
    ]
    results = []
    for name, sender, body, amount, payer, suffix in checks:
        cr = _extract_credit(body, sender, suffix)
        got = cr['amount'] if cr else None
        ok = got == amount and (cr['payer_raw'] if cr else '') == payer
        results.append({"name": name, "ok": ok,
                        "detail": f"expected {amount!r} got {got!r} payer {payer!r} vs {(cr['payer_raw'] if cr else '')!r}"})
    ok = all(r['ok'] for r in results)
    return ok, results
