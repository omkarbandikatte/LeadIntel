"use client";

interface BarDatum {
  label: string;
  value: number;
}

export function BarChart({
  data,
  valueFormat = (value: number) => value.toString(),
  color = "var(--series-1)",
  height = 160,
}: {
  data: BarDatum[];
  valueFormat?: (value: number) => string;
  color?: string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const manyBars = data.length > 8;
  const labelSize = manyBars ? "8px" : "10px";
  const valueLabelSize = manyBars ? "8px" : "10px";
  // chart area height minus space for x-labels (20px) and value labels above bars (18px)
  const chartH = height - 38;

  return (
    <div className="w-full select-none">
      {/* Bar area */}
      <div className="relative flex items-end gap-px" style={{ height: `${chartH}px` }}>
        {/* Gridlines */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <div
            key={f}
            className="pointer-events-none absolute inset-x-0"
            style={{
              bottom: `${f * chartH}px`,
              height: "1px",
              backgroundColor: "var(--gridline)",
            }}
          />
        ))}
        {data.map((d) => {
          const pct = d.value / max;
          const barH = Math.max(pct * chartH, d.value > 0 ? 3 : 0);
          return (
            <div key={d.label} className="relative flex h-full flex-1 flex-col items-center justify-end">
              {/* Value label above bar */}
              {d.value > 0 && (
                <div
                  className="absolute z-10 whitespace-nowrap font-medium tabular-nums"
                  style={{
                    bottom: `${barH + 3}px`,
                    fontSize: valueLabelSize,
                    color: "var(--text-secondary)",
                    lineHeight: 1,
                  }}
                >
                  {valueFormat(d.value)}
                </div>
              )}
              {/* Bar */}
              <div
                className="w-full rounded-t-sm"
                style={{ height: `${barH}px`, backgroundColor: color }}
              />
            </div>
          );
        })}
      </div>
      {/* Baseline */}
      <div className="h-px w-full" style={{ backgroundColor: "var(--baseline)" }} />
      {/* X-axis labels */}
      <div className="mt-1 flex gap-px">
        {data.map((d) => (
          <div
            key={d.label}
            className="flex-1 overflow-hidden text-center"
            style={{
              fontSize: labelSize,
              color: "var(--text-muted)",
              lineHeight: "1.2",
              whiteSpace: manyBars ? "nowrap" : "normal",
              textOverflow: "ellipsis",
            }}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

