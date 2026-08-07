"""Server-side scoring mirrors the frontend so exported reports are consistent."""

from ..core.config import (
    SCORING_STREAK_CAP,
    SCORING_STREAK_PER_MONTH,
    SCORING_TIERS,
    SCORING_WINDOW_MONTHS,
)


def build_history(created_month: str, payments: list[dict], due_day: int, end_month: str | None = None):
    """Create per-month history from created_month up to now (or end_month)."""
    from datetime import date

    today = end_month or date.today().strftime("%Y-%m")
    ye, me = map(int, today.split("-"))
    by_month = {}
    for p in payments:
        # A payment row signals "paid" for that month even when the stored
        # paid_date is missing/empty (toggle can create a paid row with no date).
        by_month[p["month_key"]] = p

    history = []
    yy, mm = map(int, created_month.split("-"))
    guard = 0
    while (yy, mm) <= (ye, me) and guard < 1200:
        key = f"{yy:04d}-{mm:02d}"
        pay = by_month.get(key)
        if pay:
            from datetime import date as _d
            import calendar

            last_day = calendar.monthrange(yy, mm)[1]
            # Default a missing/unparseable paid_date to the month end so the
            # payment still scores as resolved/ontime instead of unpaid.
            raw = pay.get("paid_date")
            if not raw:
                raw = f"{key}-{last_day:02d}"
            try:
                paid = _d.fromisoformat(raw)
            except ValueError:
                paid = _d(yy, mm, last_day)
                raw = f"{key}-{last_day:02d}"
            due = _d(yy, mm, min(due_day, last_day))
            days_diff = (paid - due).days
            history.append({
                "month_key": key,
                "status": "ontime",
                "days_diff": days_diff,
                "paid_date": raw,
                "amount": pay["amount"],
            })
        else:
            status = "unpaid" if key < today else "upcoming"
            history.append({"month_key": key, "status": status, "days_diff": 999, "paid_date": None, "amount": None})
        mm += 1
        if mm > 12:
            mm = 1
            yy += 1
        guard += 1
    return history


def compute_reliability(created_month: str, payments: list[dict], due_day: int) -> dict:
    history = build_history(created_month, payments, due_day)
    resolved = [h for h in history if h["status"] != "upcoming"]

    current_streak = 0
    for h in reversed(history):
        if h["status"] == "upcoming":
            continue
        if h["status"] == "ontime":
            current_streak += 1
        else:
            break

    longest = 0
    run = 0
    for h in history:
        if h["status"] == "upcoming":
            continue
        if h["status"] == "ontime":
            run += 1
            longest = max(longest, run)
        else:
            run = 0

    on_time_count = sum(1 for h in resolved if h["status"] == "ontime")
    on_time_rate = round(on_time_count / len(resolved) * 100) if resolved else 0

    start = len(resolved) - SCORING_WINDOW_MONTHS if len(resolved) > SCORING_WINDOW_MONTHS else 0
    in_window = resolved[start:]
    hit = 0.0
    total = 0.0
    for idx, h in enumerate(in_window):
        weight = 1 + (idx / max(len(in_window) - 1, 1))
        total += weight
        if h["status"] == "ontime":
            hit += weight
    base = round(hit / total * 100) if total else 0

    streak_bonus = min(current_streak * SCORING_STREAK_PER_MONTH, SCORING_STREAK_CAP)
    score = max(0, min(100, base + streak_bonus))

    if score >= SCORING_TIERS["excellent"]:
        tier = "excellent"
    elif score >= SCORING_TIERS["reliable"]:
        tier = "reliable"
    elif score >= SCORING_TIERS["inconsistent"]:
        tier = "inconsistent"
    else:
        tier = "at_risk"

    return {
        "history": history,
        "resolved": resolved,
        "current_streak": current_streak,
        "longest_streak": longest,
        "on_time_rate": on_time_rate,
        "reliability_score": score,
        "tier": tier,
    }