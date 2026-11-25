import openpyxl, json
from datetime import datetime

WB_PATH   = "../New File.xlsm"
JSON_PATH = "data/historical.json"

wb   = openpyxl.load_workbook(WB_PATH, data_only=True)
data = json.load(open(JSON_PATH))
by_date = {r["date"]: r for r in data}

ws = wb["Microcap 250"]
rows = list(ws.iter_rows(values_only=True))[1:]  # skip header

updated = 0
for row in rows:
    if row[1] is None:
        continue
    date = row[1].strftime("%Y-%m-%d") if isinstance(row[1], datetime) else str(row[1])[:10]
    if date not in by_date:
        print(f"  SKIP {date} — not in historical.json")
        continue
    by_date[date]["NIFTY_MICROCAP_250"] = {
        "close":      row[2],
        "pe":         row[3],
        "pb":         row[4],
        "impliedEPS": row[5],
        "impliedBV":  row[6],
    }
    updated += 1

sorted_rows = sorted(by_date.values(), key=lambda r: r["date"])
with open(JSON_PATH, "w") as f:
    json.dump(sorted_rows, f, separators=(",", ":"))

print(f"Done. Updated {updated} rows.")

row_apr1 = by_date.get("2022-04-01", {}).get("NIFTY_MICROCAP_250", {})
print(f"Spot-check 2022-04-01: impliedEPS={row_apr1.get('impliedEPS'):.4f} (expect ~234.80)")
print(f"Spot-check 2022-04-01: impliedBV={row_apr1.get('impliedBV'):.4f} (expect ~5084.70)")
