import { DashboardHeader } from "@/components/DashboardHeader";
import { IndexTabs } from "@/components/IndexTabs";
import type { HistoricalRow } from "@/lib/types";

// Static import: Next.js bundles historical.json at build time.
// Vercel redeploys whenever GitHub Actions pushes an updated JSON.
import historicalData from "@/data/historical.json";

export default function Home() {
  const rows = historicalData as HistoricalRow[];

  // Last row's date shown in the header as "Data as of"
  const latestDate =
    rows.length > 0 ? rows[rows.length - 1].date : new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen">
      <DashboardHeader dataAsOf={latestDate} />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
        <IndexTabs historicalData={rows} />
      </main>
    </div>
  );
}
