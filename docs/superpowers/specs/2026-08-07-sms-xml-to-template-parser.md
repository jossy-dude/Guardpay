# One-time SMS XML → Import Template Parser

**Status:** approved 2026-08-07
**Scope:** standalone one-time script. NOT an app feature. App import (aliases/opening balance) to be improved later, after this is done.

## Objective

Fill the GuardPay Excel import template from the SMS-backup XML by matching CBE fee payments into `*3325` to households, producing a reviewable workbook the user imports later. The XML is the source of truth and **improves** the user's manually-typed month cells.

## Inputs
- `/home/jossy/Downloads/Telegram Desktop/sms-20260807151251.xml` — 2873 SMS, 6 banks; CBE credits to `*3325` carry fee data.
- `/home/jossy/Downloads/guardpay-import-template.xlsx` — filled template (22 households, rows 2–38; manual text entries like `3000 - 21 at 10:00am` in Sep–Nov; flag/note rows 39–41).
- Known reference: user's 27-name list (Amharic + transliteration), fee timeline (3000 → later 4000), street-light exception (7000, some paid 10000), legacy pattern already in `SMS_praser/sms_import_engine.py`.

## Output workbook (new structure)
- **Sheet `Households`** — importable: `House # | Name | Fee | Aliases | Starting balance | Sep'25..Aug'26`. Month cells hold **plain amount numbers**; user's text cells preserved where no confident match exists. Unsure cells get a fill/flag color.
- **Sheet `Detail`** — every matched credit: Date | Time | Day | Amount | Payer (raw) | House # | Confidence | Note.
- **Sheet `Review`** — street-light 7000/10000, anonymous credits, unknown named payers, and any unmapped rows; the "Possible new / to review" list.

## Method
1. Extract CBE credits to `*3325` (reuse `sms_import_engine.py` regex: credited-with / credited-by / received-from; strict number shape; recipient-limit 3325; skip debits).
2. Pull payer names from named formats (`credited by NAME with ETB`, `received … account (Name) to …`).
3. Derive per-month fee regime from matched amounts (3000 → 4000; street-light month 7000 / 10000).
4. Match payers → template households via `normalize_name`/`name_similar`/`name_key` (order-tolerant, honorific-stripped); fallback to 27-name list then aliases/phone.
5. Place matched amount into the correct month column (Sep'25–Aug'26 mapping F–N); flag street-light and unmapped.

## Not included
No app changes, no Telebirr/CBEBirr/BOA, no auto-import.