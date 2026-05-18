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
import { formatDateShort, formatMetric } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import type { ChartPoint } from "@/lib/calculations";
import type { ControlLines, MetricKey } from "@/lib/types";

interface IndexChartProps {
  data: ChartPoint[];
  metric: MetricKey;
  controlLines: ControlLines | null;
  showControlLines: boolean;
  valueFormatter?: (v: number) => string;
}

interface TooltipEntry {
  value?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  controlLines?: ControlLines | null;
  showControlLines?: boolean;
  metric?: MetricKey;
  valueFormatter?: (v: number) => string;
  isDark?: boolean;
}

function CustomTooltip({ active, payload, label, controlLines, showControlLines, metric, valueFormatter, isDark }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  const fmt = (v: number) => valueFormatter ? valueFormatter(v) : metric ? formatMetric(metric, v) : v.toFixed(2);

  const showLevels = showControlLines && controlLines;
  const meanColor = isDark ? "#e4e4e7" : "#1f2937";

  return (
    <div className={`rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[140px] border ${isDark ? "bg-zinc-800 border-zinc-700 text-zinc-100" : "bg-white border-zinc-200 text-zinc-900"}`}>
      <p className={`font-medium mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{label}</p>
      {value != null && (
        <p className={`font-bold text-sm mb-2 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{fmt(value)}</p>
      )}
      {showLevels && (
        <div className={`border-t pt-2 space-y-1 ${isDark ? "border-zinc-700" : "border-zinc-100"}`}>
          <div className="flex justify-between gap-4">
            <span style={{ color: "#065f46" }} className="font-semibold">+2σ</span>
            <span style={{ color: "#065f46" }} className="font-semibold">{fmt(controlLines.sd2Upper)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: "#6ee7b7" }} className="font-semibold">+1σ</span>
            <span style={{ color: "#6ee7b7" }} className="font-semibold">{fmt(controlLines.sd1Upper)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: meanColor }} className="font-semibold">Mean</span>
            <span style={{ color: meanColor }} className="font-semibold">{fmt(controlLines.mean)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: "#b45309" }} className="font-semibold">−1σ</span>
            <span style={{ color: "#b45309" }} className="font-semibold">{fmt(controlLines.sd1Lower)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: "#b91c1c" }} className="font-semibold">−2σ</span>
            <span style={{ color: "#b91c1c" }} className="font-semibold">{fmt(controlLines.sd2Lower)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function IndexChart({ data, metric, controlLines, showControlLines, valueFormatter }: IndexChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    grid:  isDark ? "#3f3f46" : "#f4f4f5",
    axis:  isDark ? "#a1a1aa" : "#52525b",
    mean:  isDark ? "#e4e4e7" : "#6b7280",
  };

  if (data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-zinc-400 text-sm">
        No data available for this selection.
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const pad = (maxVal - minVal) * 0.08 || Math.abs(maxVal) * 0.05 || 1;

  let domainMin = minVal - pad;
  let domainMax = maxVal + pad;
  if (showControlLines && controlLines) {
    domainMin = Math.min(domainMin, controlLines.sd2Lower - pad);
    domainMax = Math.max(domainMax, controlLines.sd2Upper + pad);
  }

  const tickInterval = Math.max(1, Math.floor(data.length / 6));

  const chartKey = `${metric}-${minVal.toFixed(2)}-${maxVal.toFixed(2)}-${data.length}-${controlLines?.mean.toFixed(2) ?? "x"}-${showControlLines}-${isDark}`;

  const fmt = (v: number) => valueFormatter ? valueFormatter(v) : formatMetric(metric ?? "pe", v);

  const controlLevelStrip = showControlLines && controlLines ? [
    { label: "+2σ", value: controlLines.sd2Upper, color: "#065f46" },
    { label: "+1σ", value: controlLines.sd1Upper, color: "#6ee7b7" },
    { label: "Mean", value: controlLines.mean,    color: isDark ? "#a1a1aa" : "#6b7280" },
    { label: "−1σ", value: controlLines.sd1Lower, color: "#b45309" },
    { label: "−2σ", value: controlLines.sd2Lower, color: "#b91c1c" },
  ] : null;

  return (
    <>
      {controlLevelStrip && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 pt-1 pb-3">
          {controlLevelStrip.map(({ label, value, color }) => (
            <span key={label} className="flex items-center gap-1.5 tabular-nums">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs font-semibold" style={{ color }}>{label}</span>
              <span className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{fmt(value)}</span>
            </span>
          ))}
        </div>
      )}
    <ResponsiveContainer key={chartKey} width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />

        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          interval={tickInterval}
          tick={{ fontSize: 11, fill: colors.axis }}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
          domain={[domainMin, domainMax]}
          allowDataOverflow={false}
          tick={{ fontSize: 11, fill: colors.axis }}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v: number) => {
            if (valueFormatter) return valueFormatter(v);
            if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1) + "k";
            if (Math.abs(v) >= 1000) return v.toFixed(0);
            return v.toFixed(2);
          }}
        />

        <Tooltip
          content={
            <CustomTooltip
              controlLines={controlLines}
              showControlLines={showControlLines}
              metric={metric}
              valueFormatter={valueFormatter}
              isDark={isDark}
            />
          }
        />

        <Line
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
        />

        {showControlLines && controlLines && (
          <>
            <ReferenceLine
              y={controlLines.mean}
              stroke={colors.mean}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{ value: "Mean", position: "insideTopRight", fontSize: 10, fill: colors.mean }}
            />
            <ReferenceLine
              y={controlLines.sd1Upper}
              stroke="#6ee7b7"
              strokeDasharray="3 5"
              strokeWidth={1}
              label={{ value: "+1σ", position: "insideTopRight", fontSize: 10, fill: "#6ee7b7" }}
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
              stroke="#065f46"
              strokeDasharray="2 6"
              strokeWidth={1}
              label={{ value: "+2σ", position: "insideTopRight", fontSize: 10, fill: "#065f46" }}
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
    </>
  );
}
