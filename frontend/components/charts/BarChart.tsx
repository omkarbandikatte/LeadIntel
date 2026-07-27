"use client";

interface BarDatum {
  label: string;
  value: number;
}

export function BarChart({
  data,
  valueFormat = (value: number) => value.toString(),
  color = "var(--series-1)",
  height = 220,
}: {
  data: BarDatum[];
  valueFormat?: (value: number) => string;
  color?: string;
  height?: number;
}) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / data.length;

  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none" role="img">
      {/* recessive gridlines */}
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <line
          key={fraction}
          x1={0}
          x2={100}
          y1={height - 24 - fraction * (height - 48)}
          y2={height - 24 - fraction * (height - 48)}
          stroke="var(--gridline)"
          strokeWidth={0.3}
        />
      ))}
      {/* baseline */}
      <line x1={0} x2={100} y1={height - 24} y2={height - 24} stroke="var(--baseline)" strokeWidth={0.5} />

      {data.map((datum, index) => {
        const barHeight = (datum.value / maxValue) * (height - 48);
        const x = index * barWidth + barWidth * 0.2;
        const width = barWidth * 0.6;
        const y = height - 24 - barHeight;

        return (
          <g key={datum.label}>
            <title>
              {datum.label}: {valueFormat(datum.value)}
            </title>
            <rect x={x} y={y} width={width} height={Math.max(barHeight, 1)} rx={1.2} fill={color} />
            <text
              x={x + width / 2}
              y={y - 4}
              textAnchor="middle"
              fontSize={4.2}
              fill="var(--text-secondary)"
            >
              {valueFormat(datum.value)}
            </text>
            <text
              x={x + width / 2}
              y={height - 12}
              textAnchor="middle"
              fontSize={4}
              fill="var(--text-muted)"
            >
              {datum.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
