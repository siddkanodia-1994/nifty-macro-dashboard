import { DashboardHeader } from "@/components/DashboardHeader";
import { IndexTabs } from "@/components/IndexTabs";
import type { BYEYRow, HistoricalRow, USDINRRow } from "@/lib/types";

// Static imports: Next.js bundles JSON at build time.
// Vercel redeploys whenever GitHub Actions pushes updated data.
import historicalData from "@/data/historical.json";
import byeyRaw from "@/data/byey.json";
import usdinrRaw from "@/data/usdinr.json";

export default function Home() {
  const rows       = historicalData as HistoricalRow[];
  const byeyData   = byeyRaw as BYEYRow[];
  const usdinrData = usdinrRaw as USDINRRow[];

  // Last row's date shown in the header as "Data as of"
  const latestDate =
    rows.length > 0 ? rows[rows.length - 1].date : new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen">
      <DashboardHeader dataAsOf={latestDate} />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
        <IndexTabs historicalData={rows} byeyData={byeyData} usdinrData={usdinrData} />
      </main>
    </div>
  );
}
