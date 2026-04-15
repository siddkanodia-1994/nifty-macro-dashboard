"use client";

import {
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatDateShort } from "@/lib/utils";
import type { ChartPoint } from "@/lib/calculations";
import type { ControlLines, MetricKey } from "@/lib/types";

interface IndexChartProps {
  data: ChartPoint[];
  metric: MetricKey;
  controlLines: ControlLines | null;
  showControlLines: boolean;
}

interface TooltipEntry {
  value?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-zinc-700 mb-1">{label}</p>
      {value != null && (
        <p className="text-zinc-900 font-semibold">{value.toFixed(2)}</p>
      )}
    </div>
  );
}

export function IndexChart({ data, metric, controlLines, showControlLines }: IndexChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-zinc-400 text-sm">
        No data available for this selection.
      </div>
    );
  }

  // Determine Y-axis domain with a 5% padding
  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const pad = (maxVal - minVal) * 0.08;

  // Extend domain to include control lines if shown
  let domainMin = minVal - pad;
  let domainMax = maxVal + pad;
  if (showControlLines && controlLines) {
    domainMin = Math.min(domainMin, controlLines.sd2Lower - pad);
    domainMax = Math.max(domainMax, controlLines.sd2Upper + pad);
  }

  // X-axis tick spacing: show ~6 ticks regardless of window size
  const tickInterval = Math.max(1, Math.floor(data.length / 6));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />

        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          interval={tickInterval}
          tick={{ fontSize: 11, fill: "#a1a1aa" }}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
          domain={[domainMin, domainMax]}
          tick={{ fontSize: 11, fill: "#a1a1aa" }}
          axisLine={false}
          tickLine={false}
          width={55}
          tickFormatter={(v: number) => v.toFixed(1)}
        />

        <Tooltip content={<CustomTooltip />} />

        {/* Main price/metric line */}
        <Line
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
        />

        {/* Fixed control lines — computed from ALL historical data */}
        {showControlLines && controlLines && (
          <>
            <ReferenceLine
              y={controlLines.mean}
              stroke="#6b7280"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{ value: "Mean", position: "insideTopRight", fontSize: 10, fill: "#6b7280" }}
            />
            <ReferenceLine
              y={controlLines.sd1Upper}
              stroke="#f59e0b"
              strokeDasharray="3 5"
              strokeWidth={1}
              label={{ value: "+1σ", position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }}
            />
            <ReferenceLine
              y={controlLines.sd1Lower}
              stroke="#f59e0b"
              strokeDasharray="3 5"
              strokeWidth={1}
              label={{ value: "−1σ", position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }}
            />
            <ReferenceLine
              y={controlLines.sd2Upper}
              stroke="#ef4444"
              strokeDasharray="2 6"
              strokeWidth={1}
              label={{ value: "+2σ", position: "insideTopRight", fontSize: 10, fill: "#ef4444" }}
            />
            <ReferenceLine
              y={controlLines.sd2Lower}
              stroke="#ef4444"
              strokeDasharray="2 6"
              strokeWidth={1}
              label={{ value: "−2σ", position: "insideTopRight", fontSize: 10, fill: "#ef4444" }}
            />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
