"use client";

interface HBarDatum {
  label: string;
  value: number;
  secondaryValue?: number;
  secondaryLabel?: string;
}

export function HorizontalBarChart({
  data,
  valueFormat = (v: number) => v.toString(),
  color = "var(--series-1)",
  secondaryColor = "var(--status-good)",
  maxValue,
}: {
  data: HBarDatum[];
  valueFormat?: (v: number) => string;
  color?: string;
  secondaryColor?: string;
  maxValue?: number;
}) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="truncate font-medium" style={{ color: "var(--text-primary)", maxWidth: "60%" }}>
              {d.label}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              {valueFormat(d.value)}
              {d.secondaryValue !== undefined && (
                <span className="ml-2" style={{ color: secondaryColor }}>
                  {d.secondaryLabel ?? valueFormat(d.secondaryValue)}
                </span>
              )}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--gridline)" }}>
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: color }}
            />
            {d.secondaryValue !== undefined && (
              <div
                className="absolute left-0 top-0 h-full rounded-full opacity-50"
                style={{ width: `${(d.secondaryValue / max) * 100}%`, backgroundColor: secondaryColor }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
