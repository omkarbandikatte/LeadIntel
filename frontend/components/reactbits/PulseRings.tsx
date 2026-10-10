// Inspired by reactbits.dev (Backgrounds / Animations) — concentric pulse
// rings radiating from the center, pure CSS.
interface PulseRingsProps {
  color?: string;
  className?: string;
}

export function PulseRings({ color = "var(--series-1)", className = "" }: PulseRingsProps) {
  return (
    <div className={`reactbits-pulse-rings ${className}`} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="reactbits-pulse-ring" style={{ borderColor: color, animationDelay: `${i * 1.1}s` }} />
      ))}
    </div>
  );
}
