// Inspired by reactbits.dev (Backgrounds → Dot Grid) — a static dot-grid wash
// with a slow drifting highlight, pure CSS.
interface DotGridProps {
  color?: string;
  className?: string;
}

export function DotGrid({ color = "var(--series-1)", className = "" }: DotGridProps) {
  return (
    <div
      className={`reactbits-dot-grid ${className}`}
      style={{ ["--dot-color" as string]: color }}
      aria-hidden
    />
  );
}
