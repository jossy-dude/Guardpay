# -*- coding: utf-8 -*-
"""
GuardPay.xlsx builder — neighborhood security-fee tracker for OnlyOffice.
Mirrors guardpay app logic (scoring 100/55/30/10, streak +15, tiers 400/200/100)
but rebuilt as a clean, visual, formula-driven workbook.
"""
import datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.chart import BarChart, LineChart, DoughnutChart, Reference
from openpyxl.utils import get_column_letter

# --------------------------------------------------------------------- style
FONT = "Arial"
INK = "1F1F1F"
NAVY = "1F3864"
NAVY2 = "2E4E8F"
BAND = "EEF3FA"
WHITE = "FFFFFF"
INPUT_FILL = "FFF2CC"     # yellow -> cells the user edits
INPUT_FONT = "1F4E79"     # blue text on inputs
LINK_FONT = "0E6B1E"      # green text -> cross-sheet link
MUTED = "6B7280"
GREEN_FILL, GREEN_FONT = "C6EFCE", "006100"
AMBER_FILL, AMBER_FONT = "FFE699", "9C5700"
YEL_FILL, YEL_FONT = "FFF2CC", "7F6000"
RED_FILL, RED_FONT = "FFC7CE", "9C0006"
GRAY_FILL, GRAY_FONT = "D9D9D9", "595959"

MONEY = '#,##0'
INT = '#,##0'
PCT = '0.0%'
DATE_FMT = 'yyyy-mm-dd'
MONTH_FMT = 'mmm yyyy'

thin = Side(style="thin", color="B8C4D9")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

def banner(ws, title, subtitle, last_col, height=3):
    ws.merge_cells(start_row=1, start_column=1, end_row=height, end_column=last_col)
    c = ws.cell(row=1, column=1, value=title)
    c.font = Font(name=FONT, size=18, bold=True, color=WHITE)
    c.fill = PatternFill("solid", fgColor=NAVY)
    c.alignment = Alignment(horizontal="left", vertical="top", indent=1)
    for r in range(1, height + 1):
        for col in range(1, last_col + 1):
            ws.cell(row=r, column=col).fill = PatternFill("solid", fgColor=NAVY)
    # subtitle as a cell comment? No — put it on the title cell as a second line
    c.value = f"{title}\n{subtitle}"
    c.alignment = Alignment(horizontal="left", vertical="center", indent=1, wrap_text=True)
    c.font = Font(name=FONT, size=16, bold=True, color=WHITE)

def section(ws, row, last_col, text):
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=last_col)
    c = ws.cell(row=row, column=1, value=text)
    c.font = Font(name=FONT, size=10, bold=True, color=WHITE)
    c.fill = PatternFill("solid", fgColor=NAVY2)
    c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    for col in range(1, last_col + 1):
        ws.cell(row=row, column=col).fill = PatternFill("solid", fgColor=NAVY2)
    return row

def label(ws, row, col, text, bold=False, size=10, color=INK):
    c = ws.cell(row=row, column=col, value=text)
    c.font = Font(name=FONT, size=size, bold=bold, color=color)
    return c

def input_cell(ws, row, col, value=None, fmt=None, align="center"):
    c = ws.cell(row=row, column=col, value=value)
    c.font = Font(name=FONT, size=10, color=INPUT_FONT)
    c.fill = PatternFill("solid", fgColor=INPUT_FILL)
    c.border = BORDER
    if fmt: c.number_format = fmt
    c.alignment = Alignment(horizontal=align, vertical="center")
    return c

def formula_cell(ws, row, col, formula, fmt=None, align="center", bold=False, link=False, fill=None):
    c = ws.cell(row=row, column=col, value=formula)
    color = LINK_FONT if link else INK
    c.font = Font(name=FONT, size=10, color=color, bold=bold)
    c.border = BORDER
    if fmt: c.number_format = fmt
    c.alignment = Alignment(horizontal=align, vertical="center")
    if fill: c.fill = PatternFill("solid", fgColor=fill)
    return c

def header_row(ws, row, headers, start_col=1):
    for i, h in enumerate(headers):
        c = ws.cell(row=row, column=start_col + i, value=h)
        c.font = Font(name=FONT, size=10, bold=True, color=WHITE)
        c.fill = PatternFill("solid", fgColor=NAVY2)
        c.border = BORDER
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    return row

def band_rows(ws, first, last, cols):
    for r in range(first, last + 1):
        if (r - first) % 2 == 1:
            for col in cols:
                cell = ws.cell(row=r, column=col)
                if cell.fill.fgColor.rgb in (None, "00000000"):
                    cell.fill = PatternFill("solid", fgColor=BAND)

def set_widths(ws, widths):
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

def hide_grid(ws):
    ws.sheet_view.showGridLines = False

# ------------------------------------------------------------- sample data
HOUSEHOLDS = [
    ("H01", "Abebe Tadesse",   4000, "Active",   "0911 111 111", "Block A"),
    ("H02", "Marta Bekele",    4000, "Active",   "0912 222 222", "Block A"),
    ("H03", "Kebede Haile",    4500, "Active",   "0913 333 333", "Block B"),
    ("H04", "Selam Tesfaye",   3500, "Active",   "0914 444 444", "Block B"),
    ("H05", "Dawit Alemu",     4000, "Active",   "0915 555 555", "Block C"),
    ("H06", "Hanna Girma",     5000, "Active",   "0916 666 666", "Block C"),
    ("H07", "Yonas Worku",     4000, "Active",   "0917 777 777", "Block D"),
    ("H08", "Liya Solomon",    3500, "Inactive", "0918 888 888", "Block D"),
]
# per-house payment pattern for Jan..Jul (offset from due day, fraction of fee), None = missed
PATTERNS = {
    "H01": [(0,1),(0,1),(0,1),(0,1),(0,1),(0,1),(0,1)],       # always on time -> streak
    "H02": [(0,1),(0,1),(2,1),(0,1),(0,1),(0,1),(0,1)],       # one 2-day late
    "H03": [(0,1),(1,1),(0,1),(3,1),(0,1),(5,1),(0,1)],       # mixed
    "H04": [(9,1),(10,1),(12,1),(15,1),(11,1),(9,1),(14,1)],  # always late 8+ -> At Risk
    "H05": [(0,1),(0,1),(0,1),None,(0,1),(0,1),(0,1)],        # missed April
    "H06": [(0,1),(0,0.5),(0,1),(0,1),(0,1),(0,1),(0,1)],     # partial in Feb
    "H07": [(0,1),(4,1),(0,1),(0,1),(6,1),(0,1),(0,1)],       # some late
    "H08": [(0,1),(0,1),(0,1),None,None,None,None],           # inactive after Mar
}
EARLY_AUG = {"H01": 3, "H06": 2}   # paid early in August (due day 5, today Aug 4)

CURRENCY = "ETB"
DUE_DAY = 5
GUARD_NAME = "Night Watch Guard"
GUARD_SALARY = 30000
DEFAULT_FEE = 4000
CURRENT_YEAR = 2026
CURRENT_PERIOD = dt.date(2026, 8, 1)
MONTHS = [dt.date(2026, m, 1) for m in range(1, 13)]

wb = Workbook()
wb.remove(wb.active)
wb.properties.title = "GuardPay — Neighborhood Fee Tracker"
wb.properties.creator = "Jossy"
wb.calculation.fullCalcOnLoad = True

# ============================================================ SETTINGS =====
ws = wb.create_sheet("Settings")
ws.sheet_properties.tabColor = NAVY2
hide_grid(ws)
set_widths(ws, {"A": 42, "B": 24})
banner(ws, "\u2699 Settings & Assumptions", "Every formula in this workbook reads from here. Edit only the yellow cells.", 2)
row = section(ws, 4, 2, "General")
S = {}
general = [
    ("Neighborhood name", "Neighborhood Watch", None),
    ("Currency code", "ETB", None),
    ("Monthly due day", DUE_DAY, INT),
    ("Guard name", "Night Watch Guard", None),
    ("Guard monthly salary", GUARD_SALARY, MONEY),
    ("Default monthly fee", DEFAULT_FEE, MONEY),
    ("Current year", CURRENT_YEAR, INT),
    ("Current period (this month)", CURRENT_PERIOD, MONTH_FMT),
]
r = row + 1
S["DueDay"], S["CurrentPeriod"] = {}, {}
for g_lbl, value, fmt in general:
    label(ws, r, 1, g_lbl)
    c = input_cell(ws, r, 2, value, fmt=fmt, align="left")
    S[g_lbl] = r
    r += 1
row = section(ws, r + 1, 2, "Scoring rules (points per household per month)")
r = row + 1
score = [
    ("On-time payment", 100, INT),
    ("Late 1\u20133 days", 55, INT),
    ("Late 4\u20137 days", 30, INT),
    ("Late 8+ days", 10, INT),
    ("Missed payment", 0, INT),
    ("Streak bonus per consecutive on-time month", 15, INT),
]
for lbl, v, f in score:
    label(ws, r, 1, lbl)
    input_cell(ws, r, 2, v, fmt=f, align="left")
    S[lbl] = r
    r += 1
row = section(ws, r + 1, 2, "Reliability tiers (minimum total score)")
r = row + 1
for lbl, v in [("Excellent", 400), ("Reliable", 200), ("Inconsistent", 100)]:
    label(ws, r, 1, lbl)
    input_cell(ws, r, 2, v, fmt=INT, align="left")
    S[lbl] = r
    r += 1
c = label(ws, r, 1, "Below \u201cInconsistent\u201d \u2192 \u201cAt Risk\u201d")
c.font = Font(name=FONT, size=9, italic=True, color=MUTED)
r += 2
row = section(ws, r, 2, "Month list (for dropdowns \u2014 auto)")
r = row + 1
month_list_start = r
for m in MONTHS:
    input_cell(ws, r, 2, m, fmt=MONTH_FMT, align="left")
    r += 1
ws.freeze_panes = "A5"

# named ranges (Settings)
def name_range(name, cellref):
    wb.defined_names[name] = DefinedName(name, attr_text=cellref)
name_range("DueDay", f"Settings!$B${S['Monthly due day']}")
name_range("CurrentPeriod", f"Settings!$B${S['Current period (this month)']}")
name_range("CurrentYearVal", f"Settings!$B${S['Current year']}")
name_range("GuardSalary", f"Settings!$B${S['Guard monthly salary']}")
name_range("PtsOnTime", f"Settings!$B${S['On-time payment']}")
name_range("PtsLateMild", f"Settings!$B${S['Late 1\u20133 days']}")
name_range("PtsLateMod", f"Settings!$B${S['Late 4\u20137 days']}")
name_range("PtsLateSevere", f"Settings!$B${S['Late 8+ days']}")
name_range("StreakBonusPts", f"Settings!$B${S['Streak bonus per consecutive on-time month']}")
name_range("TierExcellent", f"Settings!$B${S['Excellent']}")
name_range("TierReliable", f"Settings!$B${S['Reliable']}")
name_range("TierInconsistent", f"Settings!$B${S['Inconsistent']}")
name_range("MonthList", f"Settings!$B${month_list_start}:$B${month_list_start + 11}")

# ============================================================ HOUSEHOLDS ===
ws = wb.create_sheet("Households")
ws.sheet_properties.tabColor = "2E7D5B"
hide_grid(ws)
set_widths(ws, {"A": 10, "B": 22, "C": 13, "D": 11, "E": 15, "F": 26, "G": 13})
banner(ws, "\U0001F3E0 Households", "Master register of every household paying into the fund. Yellow cells are inputs \u2014 add a row for a new household.", 7)
hdr = 4
header_row(ws, hdr, ["House No", "Resident Name", "Monthly Fee", "Status", "Phone", "Notes", "Date Added"])
HOUSE_FIRST = 5
for i, (no, name, fee, status, phone, notes) in enumerate(HOUSEHOLDS):
    r = HOUSE_FIRST + i
    input_cell(ws, r, 1, no)
    input_cell(ws, r, 2, name, align="left")
    input_cell(ws, r, 3, fee, fmt=MONEY, align="right")
    input_cell(ws, r, 4, status)
    input_cell(ws, r, 5, phone)
    input_cell(ws, r, 6, notes, align="left")
    input_cell(ws, r, 7, dt.date(2026, 1, 1), fmt=DATE_FMT)
HOUSE_LAST = HOUSE_FIRST + len(HOUSEHOLDS) - 1
band_rows(ws, HOUSE_FIRST, HOUSE_LAST, range(1, 8))
dv = DataValidation(type="list", formula1='"Active,Inactive"', allow_blank=False)
ws.add_data_validation(dv)
dv.add(f"D{HOUSE_FIRST}:D{HOUSE_LAST}")

srow = HOUSE_LAST + 2
label(ws, srow, 1, "Active households", bold=True)
formula_cell(ws, srow, 2, f'=COUNTIF(D{HOUSE_FIRST}:D{HOUSE_LAST},"Active")', fmt=INT, align="right", bold=True)
label(ws, srow + 1, 1, "Total active monthly fees", bold=True)
formula_cell(ws, srow + 1, 2, f'=SUMIF(D{HOUSE_FIRST}:D{HOUSE_LAST},"Active",C{HOUSE_FIRST}:C{HOUSE_LAST})', fmt=MONEY, align="right", bold=True)
ws.freeze_panes = f"A{HOUSE_FIRST}"

# named range for house dropdowns
name_range("HouseList", f"Households!$A${HOUSE_FIRST}:$A${HOUSE_LAST + 12}")
name_range("HouseNames", f"Households!$B${HOUSE_FIRST}:$B${HOUSE_LAST + 12}")
name_range("HouseFees", f"Households!$C${HOUSE_FIRST}:$C${HOUSE_LAST + 12}")
name_range("HouseStatus", f"Households!$D${HOUSE_FIRST}:$D${HOUSE_LAST + 12}")

# ========================================================== PAYMENTS LEDGER =
ws = wb.create_sheet("Payments Ledger")
ws.sheet_properties.tabColor = "1F3864"
hide_grid(ws)
set_widths(ws, {"A": 9, "B": 19, "C": 12, "D": 12, "E": 12, "F": 12, "G": 13,
                "H": 12, "I": 10, "J": 9, "K": 9, "L": 13, "M": 1, "N": 1})
banner(ws, "\U0001F4D2 Payments Ledger", "One row per household per month. Only the yellow cells (House No, Month, Paid Date, Amount Paid) are inputs \u2014 everything else is calculated.", 13)
hdr = 4
headers = ["House No", "Resident Name", "Month", "Monthly Fee", "Due Date", "Paid Date",
           "Amount Paid", "Status", "Days Late", "On-Time", "Points", "Outstanding", "Key"]
header_row(ws, hdr, headers)
LEDGER_FIRST = 5
r = LEDGER_FIRST
for house_no, name, fee, status, phone, notes in HOUSEHOLDS:
    for m, month in enumerate(MONTHS):
        # paid date + amount from sample pattern
        paid_date, amount = None, None
        if m <= 6:  # Jan..Jul
            pat = PATTERNS[house_no][m]
            if pat:
                offset, frac = pat
                due = month.replace(day=DUE_DAY)
                paid_date = due + dt.timedelta(days=offset)
                amount = round(fee * frac)
        elif m == 7 and house_no in EARLY_AUG:  # early Aug payers
            paid_date = dt.date(2026, 8, EARLY_AUG[house_no])
            amount = fee
        input_cell(ws, r, 1, house_no)
        formula_cell(ws, r, 2, f'=IFERROR(INDEX(HouseNames,MATCH(A{r},HouseList,0)),"")', align="left", link=True)
        input_cell(ws, r, 3, month, fmt=MONTH_FMT)
        formula_cell(ws, r, 4, f'=IFERROR(INDEX(HouseFees,MATCH(A{r},HouseList,0)),0)', fmt=MONEY, align="right", link=True)
        formula_cell(ws, r, 5, f'=DATE(YEAR(C{r}),MONTH(C{r}),MIN(DueDay,DAY(EOMONTH(C{r},0))))', fmt=DATE_FMT)
        input_cell(ws, r, 6, paid_date, fmt=DATE_FMT)
        input_cell(ws, r, 7, amount, fmt=MONEY, align="right")
        formula_cell(ws, r, 8,
            f'=IF($F{r}="",IF($C{r}<CurrentPeriod,"Missed",IF(AND($C{r}=CurrentPeriod,TODAY()>$E{r}),"Overdue","Upcoming")),IF($G{r}>=$D{r},IF($F{r}<=$E{r},"On Time","Late"),"Partial"))',
            align="center", bold=True)
        formula_cell(ws, r, 9, f'=IF($F{r}="","",$F{r}-$E{r})', fmt=INT)
        formula_cell(ws, r, 10, f'=IF($F{r}="",IF(OR($H{r}="Missed",$H{r}="Overdue"),0,""),IF($F{r}<=$E{r},1,0))', fmt=INT)
        formula_cell(ws, r, 11,
            f'=IF($F{r}="","",IF($F{r}<=$E{r},PtsOnTime,IF($F{r}-$E{r}<=3,PtsLateMild,IF($F{r}-$E{r}<=7,PtsLateMod,PtsLateSevere))))', fmt=INT)
        formula_cell(ws, r, 12, f'=IF($H{r}="Upcoming",0,MAX($D{r}-IF($G{r}="",0,$G{r}),0))', fmt=MONEY, align="right")
        formula_cell(ws, r, 13, f'=A{r}&"|"&TEXT(C{r},"yyyy-mm")', align="left")
        r += 1
LEDGER_LAST = r - 1
band_rows(ws, LEDGER_FIRST, LEDGER_LAST, range(1, 14))
ws.column_dimensions["M"].hidden = True
ws.freeze_panes = f"D{LEDGER_FIRST}"

# status conditional formatting
from openpyxl.formatting.rule import FormulaRule
cf = ws.conditional_formatting
cf.add(f"H{LEDGER_FIRST}:H{LEDGER_LAST}",
       FormulaRule(formula=[f'$H{LEDGER_FIRST}="On Time"'], fill=PatternFill("solid", fgColor=GREEN_FILL), font=Font(color=GREEN_FONT, bold=True)))
cf.add(f"H{LEDGER_FIRST}:H{LEDGER_LAST}",
       FormulaRule(formula=[f'$H{LEDGER_FIRST}="Late"'], fill=PatternFill("solid", fgColor=AMBER_FILL), font=Font(color=AMBER_FONT, bold=True)))
cf.add(f"H{LEDGER_FIRST}:H{LEDGER_LAST}",
       FormulaRule(formula=[f'$H{LEDGER_FIRST}="Partial"'], fill=PatternFill("solid", fgColor=YEL_FILL), font=Font(color=YEL_FONT, bold=True)))
cf.add(f"H{LEDGER_FIRST}:H{LEDGER_LAST}",
       FormulaRule(formula=[f'$H{LEDGER_FIRST}="Missed"'], fill=PatternFill("solid", fgColor=RED_FILL), font=Font(color=RED_FONT, bold=True)))
cf.add(f"H{LEDGER_FIRST}:H{LEDGER_LAST}",
       FormulaRule(formula=[f'$H{LEDGER_FIRST}="Overdue"'], fill=PatternFill("solid", fgColor="F4B0B8"), font=Font(color="7F0B12", bold=True)))
cf.add(f"H{LEDGER_FIRST}:H{LEDGER_LAST}",
       FormulaRule(formula=[f'$H{LEDGER_FIRST}="Upcoming"'], fill=PatternFill("solid", fgColor=GRAY_FILL), font=Font(color=GRAY_FONT)))
cf.add(f"I{LEDGER_FIRST}:I{LEDGER_LAST}",
       FormulaRule(formula=[f'AND($I{LEDGER_FIRST}>0,$I{LEDGER_FIRST}<=3)'], font=Font(color=AMBER_FONT)))
cf.add(f"I{LEDGER_FIRST}:I{LEDGER_LAST}",
       FormulaRule(formula=[f'$I{LEDGER_FIRST}>3'], font=Font(color=RED_FONT, bold=True)))

# dropdowns for House No and Month
dv = DataValidation(type="list", formula1="=HouseList", allow_blank=True)
ws.add_data_validation(dv); dv.add(f"A{LEDGER_FIRST}:A{LEDGER_LAST}")
dv = DataValidation(type="list", formula1="=MonthList", allow_blank=True)
ws.add_data_validation(dv); dv.add(f"C{LEDGER_FIRST}:C{LEDGER_LAST}")

# named ranges for ledger columns
name_range("LgHouse", f"'Payments Ledger'!$A${LEDGER_FIRST}:$A${LEDGER_LAST}")
name_range("LgMonth", f"'Payments Ledger'!$C${LEDGER_FIRST}:$C${LEDGER_LAST}")
name_range("LgDue", f"'Payments Ledger'!$E${LEDGER_FIRST}:$E${LEDGER_LAST}")
name_range("LgPaidDate", f"'Payments Ledger'!$F${LEDGER_FIRST}:$F${LEDGER_LAST}")
name_range("LgDaysLate", f"'Payments Ledger'!$I${LEDGER_FIRST}:$I${LEDGER_LAST}")
name_range("LgAmount", f"'Payments Ledger'!$G${LEDGER_FIRST}:$G${LEDGER_LAST}")
name_range("LgStatus", f"'Payments Ledger'!$H${LEDGER_FIRST}:$H${LEDGER_LAST}")
name_range("LgOnTime", f"'Payments Ledger'!$J${LEDGER_FIRST}:$J${LEDGER_LAST}")
name_range("LgPoints", f"'Payments Ledger'!$K${LEDGER_FIRST}:$K${LEDGER_LAST}")
name_range("LgOutstanding", f"'Payments Ledger'!$L${LEDGER_FIRST}:$L${LEDGER_LAST}")
name_range("LgKey", f"'Payments Ledger'!$M${LEDGER_FIRST}:$M${LEDGER_LAST}")
name_range("LgStreak", f"'Payments Ledger'!$N${LEDGER_FIRST}:$N${LEDGER_LAST}")

# streak helper column N (hidden) — consecutive on-time months, future months carry forward
for rr in range(LEDGER_FIRST, LEDGER_LAST + 1):
    formula_cell(ws, rr, 14,
        f'=IF(OR($J{rr}="",$A{rr}=""),IF($A{rr}=$A{rr-1},$N{rr-1},0),IF($J{rr}=1,IF($A{rr}=$A{rr-1},$N{rr-1}+1,1),0))', align="left")
ws.column_dimensions["N"].hidden = True

# ======================================================== SCORES & TIERS ===
ws = wb.create_sheet("Scores & Tiers")
ws.sheet_properties.tabColor = "6B3FA0"
hide_grid(ws)
set_widths(ws, {"A": 10, "B": 22, "C": 12, "D": 11, "E": 9, "F": 10, "G": 12,
                "H": 13, "I": 12, "J": 12, "K": 14, "L": 8})
banner(ws, "\U0001F3C6 Scores & Tiers", "Per-household reliability: base points + streak bonus = total score \u2192 tier. All automatic.", 12)
hdr = 4
header_row(ws, hdr, ["House No", "Resident Name", "Months Paid", "On-Time", "Late", "Missed",
                     "Base Score", "Streak Bonus", "Total Score", "Tier", "Rank"])
SCORE_FIRST = 5
SCORE_LAST = SCORE_FIRST + len(HOUSEHOLDS) - 1
for i in range(len(HOUSEHOLDS)):
    rr = SCORE_FIRST + i
    house = HOUSEHOLDS[i][0]
    formula_cell(ws, rr, 1, f'=INDEX(HouseList,{i+1})')
    formula_cell(ws, rr, 2, f'=IFERROR(INDEX(HouseNames,MATCH(A{rr},HouseList,0)),"")', align="left", link=True)
    formula_cell(ws, rr, 3, f'=COUNTIFS(LgHouse,$A{rr},LgPaidDate,"<>")', fmt=INT)
    formula_cell(ws, rr, 4, f'=COUNTIFS(LgHouse,$A{rr},LgStatus,"On Time")', fmt=INT)
    formula_cell(ws, rr, 5, f'=COUNTIFS(LgHouse,$A{rr},LgStatus,"Late")', fmt=INT)
    formula_cell(ws, rr, 6, f'=COUNTIFS(LgHouse,$A{rr},LgStatus,"Missed")', fmt=INT)
    formula_cell(ws, rr, 7, f'=SUMIFS(LgPoints,LgHouse,$A{rr})', fmt=INT)
    formula_cell(ws, rr, 8,
        f'=INDEX(LgStreak,MATCH($A{rr}&"|"&TEXT(DATE(CurrentYearVal,12,1),"yyyy-mm"),LgKey,0))*StreakBonusPts', fmt=INT)
    formula_cell(ws, rr, 9, f'=$G{rr}+$H{rr}', fmt=INT, bold=True)
    formula_cell(ws, rr, 10,
        f'=IF($I{rr}>=TierExcellent,"Excellent",IF($I{rr}>=TierReliable,"Reliable",IF($I{rr}>=TierInconsistent,"Inconsistent","At Risk")))',
        bold=True)
    formula_cell(ws, rr, 11, f'=RANK($I{rr},$I${SCORE_FIRST}:$I${SCORE_LAST})', fmt=INT)
band_rows(ws, SCORE_FIRST, SCORE_LAST, range(1, 12))
# tier colors
cf = ws.conditional_formatting
cf.add(f"J{SCORE_FIRST}:J{SCORE_LAST}",
       FormulaRule(formula=[f'$J{SCORE_FIRST}="Excellent"'], fill=PatternFill("solid", fgColor=GREEN_FILL), font=Font(color=GREEN_FONT, bold=True)))
cf.add(f"J{SCORE_FIRST}:J{SCORE_LAST}",
       FormulaRule(formula=[f'$J{SCORE_FIRST}="Reliable"'], fill=PatternFill("solid", fgColor=AMBER_FILL), font=Font(color=AMBER_FONT, bold=True)))
cf.add(f"J{SCORE_FIRST}:J{SCORE_LAST}",
       FormulaRule(formula=[f'$J{SCORE_FIRST}="Inconsistent"'], fill=PatternFill("solid", fgColor=YEL_FILL), font=Font(color=YEL_FONT, bold=True)))
cf.add(f"J{SCORE_FIRST}:J{SCORE_LAST}",
       FormulaRule(formula=[f'$J{SCORE_FIRST}="At Risk"'], fill=PatternFill("solid", fgColor=RED_FILL), font=Font(color=RED_FONT, bold=True)))
ws.freeze_panes = f"A{SCORE_FIRST}"

# ======================================================= GUARD SETTLEMENT ===
ws = wb.create_sheet("Guard Settlement")
ws.sheet_properties.tabColor = "B45309"
hide_grid(ws)
set_widths(ws, {"A": 14, "B": 14, "C": 14, "D": 14, "E": 16, "F": 15, "G": 4})
banner(ws, "\U0001F4B0 Guard Settlement", f"Money collected from the neighborhood vs what {GUARD_NAME} is paid. Yellow = your entries.", 6)
hdr = 4
header_row(ws, hdr, ["Month", "Expected", "Collected", "Outstanding", "Paid to Guard", "Surplus / Balance"])
GUARD_FIRST = 5
for i, m in enumerate(MONTHS):
    rr = GUARD_FIRST + i
    formula_cell(ws, rr, 1, m, fmt=MONTH_FMT, align="left")
    formula_cell(ws, rr, 2, f'=SUMIFS(HouseFees,HouseStatus,"Active")', fmt=MONEY, align="right", link=True)
    formula_cell(ws, rr, 3, f'=SUMIFS(LgAmount,LgMonth,$A{rr})', fmt=MONEY, align="right", link=True)
    formula_cell(ws, rr, 4, f'=SUMIFS(LgOutstanding,LgMonth,$A{rr})', fmt=MONEY, align="right", link=True)
    input_cell(ws, rr, 5, 30000 if i < 3 else None, fmt=MONEY, align="right")
    formula_cell(ws, rr, 6, f'=$C{rr}-$E{rr}', fmt=MONEY, align="right", bold=True)
GUARD_LAST = GUARD_FIRST + len(MONTHS) - 1
band_rows(ws, GUARD_FIRST, GUARD_LAST, range(1, 7))
trow = GUARD_LAST + 2
label(ws, trow, 1, "Year to date", bold=True)
formula_cell(ws, trow, 2, f'=SUM(B{GUARD_FIRST}:B{GUARD_LAST})', fmt=MONEY, align="right", bold=True)
formula_cell(ws, trow, 3, f'=SUM(C{GUARD_FIRST}:C{GUARD_LAST})', fmt=MONEY, align="right", bold=True)
formula_cell(ws, trow, 4, f'=SUM(D{GUARD_FIRST}:D{GUARD_LAST})', fmt=MONEY, align="right", bold=True)
formula_cell(ws, trow, 5, f'=SUM(E{GUARD_FIRST}:E{GUARD_LAST})', fmt=MONEY, align="right", bold=True)
formula_cell(ws, trow, 6, f'=C{trow}-E{trow}', fmt=MONEY, align="right", bold=True)

grow = trow + 3
section(ws, grow, 6, "Guard payment log (add each payment to the guard here)")
grow += 1
header_row(ws, grow, ["Date", "Amount", "Method", "Note", "", ""])
grow += 1
LOG_FIRST = grow
for sample in [(dt.date(2026,1,5), 30000, "Cash", "January salary"),
               (dt.date(2026,2,5), 30000, "Cash", "February salary"),
               (dt.date(2026,3,5), 30000, "Telebirr", "March salary")]:
    input_cell(ws, grow, 1, sample[0], fmt=DATE_FMT)
    input_cell(ws, grow, 2, sample[1], fmt=MONEY, align="right")
    input_cell(ws, grow, 3, sample[2])
    input_cell(ws, grow, 4, sample[3], align="left")
    grow += 1
LOG_LAST = grow + 9
dv = DataValidation(type="list", formula1='"Cash,Bank Transfer,Telebirr,CBE Birr"', allow_blank=True)
ws.add_data_validation(dv); dv.add(f"C{LOG_FIRST}:C{LOG_LAST}")
band_rows(ws, LOG_FIRST, LOG_LAST, range(1, 5))
label(ws, LOG_LAST + 1, 1, "Total paid to guard", bold=True)
formula_cell(ws, LOG_LAST + 1, 2, f'=SUM(B{LOG_FIRST}:B{LOG_LAST})', fmt=MONEY, align="right", bold=True)

# ========================================================= MONTHLY REPORT ===
ws = wb.create_sheet("Monthly Report")
ws.sheet_properties.tabColor = "B45309"
hide_grid(ws)
set_widths(ws, {"A": 11, "B": 22, "C": 12, "D": 12, "E": 12, "F": 12, "G": 13, "H": 12, "I": 10, "J": 13})
ws.merge_cells("A1:J2")
c = ws.cell(row=1, column=1, value=f"\U0001F4C4 Monthly Collection Report\n{GUARD_NAME} fund \u2014 {CURRENCY} \u2014 pick a month below, then export to PDF")
c.font = Font(name=FONT, size=16, bold=True, color=WHITE)
c.fill = PatternFill("solid", fgColor=NAVY)
c.alignment = Alignment(horizontal="left", vertical="center", indent=1, wrap_text=True)
for r in range(1, 3):
    for col in range(1, 11):
        ws.cell(row=r, column=col).fill = PatternFill("solid", fgColor=NAVY)

label(ws, 4, 1, "Month", bold=True)
dv = DataValidation(type="list", formula1="=MonthList", allow_blank=False)
ws.add_data_validation(dv)
c = input_cell(ws, 4, 2, CURRENT_PERIOD, fmt=MONTH_FMT, align="left")
dv.add("B4")
label(ws, 4, 4, "Neighborhood", bold=True)
formula_cell(ws, 4, 5, '=Settings!$B$5', align="left", link=True)
label(ws, 4, 7, "Report date", bold=True)
formula_cell(ws, 4, 8, '=TODAY()', fmt=DATE_FMT, link=True)

summary = section(ws, 6, 10, "Summary")
header_row(ws, 7, ["House No", "Resident Name", "Monthly Fee", "Due Date", "Paid Date", "Amount Paid",
                   "Status", "Days Late", "Points", "Outstanding"])
REP_FIRST = 8
for i in range(len(HOUSEHOLDS)):
    rr = REP_FIRST + i
    formula_cell(ws, rr, 1, f'=INDEX(HouseList,{i+1})')
    formula_cell(ws, rr, 2, f'=IFERROR(INDEX(HouseNames,MATCH(A{rr},HouseList,0)),"")', align="left", link=True)
    formula_cell(ws, rr, 3, f'=IFERROR(INDEX(HouseFees,MATCH(A{rr},HouseList,0)),0)', fmt=MONEY, align="right", link=True)
    key = f'$A{rr}&"|"&TEXT($B$4,"yyyy-mm")'
    formula_cell(ws, rr, 4, f'=IFERROR(INDEX(LgDue,MATCH({key},LgKey,0)),"")', fmt=DATE_FMT)
    formula_cell(ws, rr, 5, f'=IFERROR(INDEX(LgPaidDate,MATCH({key},LgKey,0)),"")', fmt=DATE_FMT)
    formula_cell(ws, rr, 6, f'=IFERROR(INDEX(LgAmount,MATCH({key},LgKey,0)),"")', fmt=MONEY, align="right")
    formula_cell(ws, rr, 7, f'=IFERROR(INDEX(LgStatus,MATCH({key},LgKey,0)),"")', bold=True)
    formula_cell(ws, rr, 8, f'=IFERROR(INDEX(LgDaysLate,MATCH({key},LgKey,0)),"")', fmt=INT)
    formula_cell(ws, rr, 9, f'=IFERROR(INDEX(LgPoints,MATCH({key},LgKey,0)),"")', fmt=INT)
    formula_cell(ws, rr, 10, f'=IFERROR(INDEX(LgOutstanding,MATCH({key},LgKey,0)),"")', fmt=MONEY, align="right")
REP_LAST = REP_FIRST + len(HOUSEHOLDS) - 1
band_rows(ws, REP_FIRST, REP_LAST, range(1, 11))
tot = REP_LAST + 2
label(ws, tot, 1, "Total collected", bold=True)
formula_cell(ws, tot, 3, f'=SUMIFS(LgAmount,LgMonth,$B$4)', fmt=MONEY, align="right", bold=True, link=True)
label(ws, tot, 4, "Outstanding", bold=True)
formula_cell(ws, tot, 5, f'=SUMIFS(LgOutstanding,LgMonth,$B$4)', fmt=MONEY, align="right", bold=True, link=True)
label(ws, tot, 6, "On-time payments", bold=True)
formula_cell(ws, tot, 7, f'=COUNTIFS(LgMonth,$B$4,LgStatus,"On Time")', fmt=INT, bold=True, link=True)

ws.page_setup.orientation = "landscape"
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 1
ws.sheet_properties.pageSetUpPr.fitToPage = True
ws.print_area = f"A1:J{tot + 1}"
ws.oddFooter.center.text = "&A - GuardPay Monthly Report &D"
ws.oddFooter.center.size = 8

# ============================================================== DASHBOARD ===
ws = wb.create_sheet("Dashboard")
ws.sheet_properties.tabColor = "1F3864"
hide_grid(ws)
set_widths(ws, {"A": 16, "B": 18, "C": 18, "D": 18, "E": 18, "F": 18, "G": 18, "H": 16})
banner(ws, "GuardPay \u2014 Neighborhood Fee Tracker", "Live overview of collections, reliability and guard settlement. All numbers are formulas \u2014 nothing to type here.", 8)

# KPI cards row 5-8
kpis = [
    ("Total collected YTD", f'=SUMIFS(LgAmount,LgMonth,"<="&CurrentPeriod)', MONEY, NAVY, "C9D6F2"),
    ("Outstanding", f'=SUMIFS(LgOutstanding,LgMonth,"<="&CurrentPeriod)', MONEY, "9C0006", "FFC7CE"),
    ("Collection rate", f'=SUMIFS(LgAmount,LgMonth,"<="&CurrentPeriod)/(SUMIFS(HouseFees,HouseStatus,"Active")*COUNTIFS(MonthList,"<="&CurrentPeriod))', PCT, "006100", "C6EFCE"),
    ("On-time rate", f'=COUNTIFS(LgMonth,"<="&CurrentPeriod,LgStatus,"On Time")/(COUNTIFS(LgMonth,"<="&CurrentPeriod,LgStatus,"On Time")+COUNTIFS(LgMonth,"<="&CurrentPeriod,LgStatus,"Late"))', PCT, "1F3864", "DDEBF7"),
    ("Active households", '=COUNTIF(HouseStatus,"Active")', INT, "1F3864", "DDEBF7"),
    ("Paid to guard YTD", f"='Guard Settlement'!$E${trow}", MONEY, "B45309", "FDE9D9"),
]
for i, (t, f, fmt, fc, bg) in enumerate(kpis):
    col = 1 + i * 2
    # value block merged rows 5-7, label on row 8
    ws.merge_cells(start_row=5, start_column=col, end_row=7, end_column=col + 1)
    cell = ws.cell(row=5, column=col, value=f)
    cell.font = Font(name=FONT, size=20, bold=True, color=fc)
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.number_format = fmt
    for rr in range(5, 9):
        for cc in range(col, col + 2):
            ws.cell(row=rr, column=cc).fill = PatternFill("solid", fgColor=bg)
            ws.cell(row=rr, column=cc).border = BORDER
    lbl = ws.cell(row=8, column=col, value=t)
    lbl.font = Font(name=FONT, size=9, color=MUTED)
    lbl.alignment = Alignment(horizontal="center", vertical="center")

# monthly data table (chart source) rows 10-22
section(ws, 10, 8, "Monthly data (auto \u2014 drives the charts below)")
header_row(ws, 11, ["Month", "Expected", "Collected", "Outstanding", "On-time rate", "", "", ""])
for i, m in enumerate(MONTHS):
    rr = 12 + i
    formula_cell(ws, rr, 1, m, fmt=MONTH_FMT, align="left")
    formula_cell(ws, rr, 2, f'=SUMIFS(HouseFees,HouseStatus,"Active")', fmt=MONEY, align="right", link=True)
    formula_cell(ws, rr, 3, f'=SUMIFS(LgAmount,LgMonth,$A{rr})', fmt=MONEY, align="right", link=True)
    formula_cell(ws, rr, 4, f'=SUMIFS(LgOutstanding,LgMonth,$A{rr})', fmt=MONEY, align="right", link=True)
    formula_cell(ws, rr, 5, f'=IFERROR(COUNTIFS(LgMonth,$A{rr},LgStatus,"On Time")/(COUNTIFS(LgMonth,$A{rr},LgStatus,"On Time")+COUNTIFS(LgMonth,$A{rr},LgStatus,"Late")),"")', fmt=PCT)
band_rows(ws, 12, 23, range(1, 6))

# charts
bar = BarChart()
bar.type = "col"; bar.style = 10
bar.title = "Monthly collection vs target"
bar.y_axis.title = f"Amount ({CURRENCY})"; bar.x_axis.title = None
data = Reference(ws, min_col=2, min_row=11, max_col=3, max_row=23)
cats = Reference(ws, min_col=1, min_row=12, max_row=23)
bar.add_data(data, titles_from_data=True)
bar.set_categories(cats)
bar.height = 8.5; bar.width = 16
ws.add_chart(bar, "A26")

line = LineChart()
line.title = "On-time payment rate"
line.y_axis.title = "Rate"; line.y_axis.numFmt = "0%"
data = Reference(ws, min_col=5, min_row=11, max_col=5, max_row=23)
line.add_data(data, titles_from_data=True)
line.set_categories(cats)
line.height = 8.5; line.width = 16
ws.add_chart(line, "H26")

# status split this month (doughnut)
sec = section(ws, 34, 8, "This month breakdown (auto)")
header_row(ws, 35, ["Status", "Count", "", "", "", "", "", ""])
statuses = ["On Time", "Late", "Partial", "Missed", "Overdue", "Upcoming"]
for i, st in enumerate(statuses):
    rr = 36 + i
    label(ws, rr, 1, st)
    formula_cell(ws, rr, 2, f'=COUNTIFS(LgMonth,CurrentPeriod,LgStatus,"{st}")', fmt=INT)
dough = DoughnutChart()
dough.title = "Payments this month"
data = Reference(ws, min_col=2, min_row=35, max_col=2, max_row=41)
lbls = Reference(ws, min_col=1, min_row=36, max_row=41)
dough.add_data(data, titles_from_data=True)
dough.set_categories(lbls)
dough.height = 8.5; dough.width = 14
ws.add_chart(dough, "F34")

# leaderboard
sec2 = section(ws, 44, 8, "Leaderboard (top by total score)")
header_row(ws, 45, ["Rank", "Household", "Score", "Tier", "", "", "", ""])
for i in range(5):
    rr = 46 + i
    formula_cell(ws, rr, 1, i + 1, fmt=INT)
    formula_cell(ws, rr, 2, f'=INDEX(\'Scores & Tiers\'!$B${SCORE_FIRST}:$B${SCORE_LAST},MATCH(LARGE(\'Scores & Tiers\'!$I${SCORE_FIRST}:$I${SCORE_LAST},{i+1}),\'Scores & Tiers\'!$I${SCORE_FIRST}:$I${SCORE_LAST},0))', align="left", link=True)
    formula_cell(ws, rr, 3, f'=LARGE(\'Scores & Tiers\'!$I${SCORE_FIRST}:$I${SCORE_LAST},{i+1})', fmt=INT)
    formula_cell(ws, rr, 4, f'=IFERROR(INDEX(\'Scores & Tiers\'!$J${SCORE_FIRST}:$J${SCORE_LAST},MATCH($C{rr},\'Scores & Tiers\'!$I${SCORE_FIRST}:$I${SCORE_LAST},0)),"")', bold=True)
band_rows(ws, 46, 50, range(1, 5))

# how-to legend
lrow = 53
section(ws, lrow, 8, "How to use this workbook")
howto = [
    "1. Settings \u2192 edit the yellow cells (neighborhood, due day, guard salary, scoring rules). Everything recalculates.",
    "2. Households \u2192 add/remove households. House No, name, fee, status, phone are inputs.",
    "3. Payments Ledger \u2192 for each household & month, type only the Paid Date and Amount Paid (yellow).",
    "4. Scores & Tiers, Guard Settlement, Dashboard update themselves from the ledger.",
    "5. Monthly Report \u2192 pick a month, then File \u2192 Export as PDF (OnlyOffice) to print or share.",
    "Blue cells = formulas (do not type over them). Yellow cells = your inputs.",
]
for i, t in enumerate(howto):
    c = ws.cell(row=lrow + 1 + i, column=1, value=t)
    c.font = Font(name=FONT, size=9, color=MUTED)
    ws.merge_cells(start_row=lrow + 1 + i, start_column=1, end_row=lrow + 1 + i, end_column=8)

# reorder: Dashboard first
wb.move_sheet("Dashboard", offset=-6)

OUT = "/home/jossy/Documents/Projects/Payment-tracker/guardpay/GuardPay.xlsx"
wb.save(OUT)
print("saved:", OUT)
print("households:", len(HOUSEHOLDS), "| ledger rows:", LEDGER_LAST - LEDGER_FIRST + 1)
