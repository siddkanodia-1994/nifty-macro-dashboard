# Archived one-off scripts

Kept for reference only — none of these run in CI or are needed day to day.
They resolve paths relative to `scripts/`, so they will not run from this folder
as-is; copy one back to `scripts/` deliberately if you ever need it.

| Script | What it was for |
| --- | --- |
| `parse-excel.py`, `import-backfill.py` | Initial import of index history from the Excel workbooks |
| `merge-new-data.py` | One-time merge of newly added indices |
| `fix-microcap-eps-bv.py` | One-time correction of Microcap 250 EPS/BV |
| `seed-new-index-projections.mjs` | One-time Redis seed for new indices' projections |
| `parse-byey.py` | Initial BY-EY build — **rewrites `data/byey.json` from scratch**, wiping every row added since; do not re-run |
| `fetch-live-prices.mjs` | Old GitHub Actions live-price fallback, replaced by calling `/api/refresh-live-prices` |
