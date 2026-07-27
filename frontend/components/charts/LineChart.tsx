"use client";

interface LineDatum {
  label: string;
  value: number;
}

export function LineChart({
  data,
  valueFormat = (value: number) => value.toString(),
  color = "var(--series-1)",
  height = 220,
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

  const maxValue = Math.max(...data.map((d) => d.value), 0.0001);
  const minValue = Math.min(...data.map((d) => d.value), 0);
  const range = maxValue - minValue || 1;
  const stepX = data.length > 1 ? 100 / (data.length - 1) : 0;
  const plotHeight = height - 48;

  const points = data.map((datum, index) => {
    const x = data.length > 1 ? index * stepX : 50;
    const y = 12 + plotHeight - ((datum.value - minValue) / range) * plotHeight;
    return { x, y, datum };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none" role="img">
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <line
          key={fraction}
          x1={0}
          x2={100}
          y1={12 + plotHeight - fraction * plotHeight}
          y2={12 + plotHeight - fraction * plotHeight}
          stroke="var(--gridline)"
          strokeWidth={0.3}
        />
      ))}
      <line x1={0} x2={100} y1={12 + plotHeight} y2={12 + plotHeight} stroke="var(--baseline)" strokeWidth={0.5} />

      <path d={path} fill="none" stroke={color} strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" />

      {points.map(({ x, y, datum }) => (
        <g key={datum.label}>
          <title>
            {datum.label}: {valueFormat(datum.value)}
          </title>
          <circle cx={x} cy={y} r={1.4} fill={color} />
          <text x={x} y={height - 4} textAnchor="middle" fontSize={4} fill="var(--text-muted)">
            {datum.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
