"use client";

interface LineDatum {
  label: string;
  value: number;
}

export function LineChart({
  data,
  valueFormat = (value: number) => value.toString(),
  color = "var(--series-1)",
  height = 160,
}: {
  data: LineDatum[];
  valueFormat?: (value: number) => string;
  color?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div style={{ color: "var(--text-muted)" }} className="py-8 text-center text-sm">
        Not enough history yet.
      </div>
    );
  }

  const svgH = height - 42; // SVG canvas height; remaining px for labels
  const W = 1000; // internal SVG width coordinate space
  const PAD = 16;

  const maxV = Math.max(...data.map((d) => d.value), 0.0001);
  const minV = Math.min(...data.map((d) => d.value), 0);
  const range = maxV - minV || 1;
  const plotH = svgH - 24; // inner plot height (top/bottom padding)

  const pts = data.map((d, i) => ({
    x: data.length > 1 ? PAD + (i / (data.length - 1)) * (W - PAD * 2) : W / 2,
    y: 14 + plotH - ((d.value - minV) / range) * plotH,
    d,
  }));

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Area fill under the line
  const areaPath =
    path +
    ` L ${pts[pts.length - 1].x.toFixed(1)} ${(14 + plotH).toFixed(1)}` +
    ` L ${pts[0].x.toFixed(1)} ${(14 + plotH).toFixed(1)} Z`;

  const manyPoints = data.length > 8;
  const labelFontSize = manyPoints ? "9px" : "11px";

  return (
    <div className="w-full select-none">
      {/* SVG: line, area fill, dots only — no text (text is HTML below) */}
      <svg
        viewBox={`0 0 ${W} ${svgH}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: `${svgH}px`, display: "block", overflow: "visible" }}
        aria-hidden
      >
        {/* Gridlines */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={14 + plotH - f * plotH}
            y2={14 + plotH - f * plotH}
            stroke="var(--gridline)"
            strokeWidth={1.5}
          />
        ))}
        {/* Area fill */}
        <path d={areaPath} fill={color} fillOpacity={0.08} />
        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots */}
        {pts.map(({ x, y, d }) => (
          <circle key={d.label} cx={x} cy={y} r={4} fill={color} />
        ))}
      </svg>
      {/* Baseline */}
      <div className="h-px w-full" style={{ backgroundColor: "var(--baseline)" }} />
      {/* Value + X-axis labels — pure HTML, no distortion */}
      <div className="relative mt-1.5 flex">
        {pts.map(({ d }) => (
          <div
            key={d.label}
            className="flex flex-1 flex-col items-center gap-0.5"
          >
            <span
              className="font-medium tabular-nums"
              style={{ fontSize: labelFontSize, color: "var(--text-secondary)", lineHeight: 1 }}
            >
              {valueFormat(d.value)}
            </span>
            <span
              style={{ fontSize: labelFontSize, color: "var(--text-muted)", lineHeight: 1 }}
            >
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

