// Inspired by reactbits.dev (Backgrounds → Beams) — pure CSS sweeping light
// beams, no canvas/WebGL needed.
interface BeamsProps {
  colors?: string[];
  className?: string;
}

export function Beams({ colors = ["var(--series-1)", "var(--accent-l)", "var(--status-good)"], className = "" }: BeamsProps) {
  return (
    <div className={`reactbits-beams ${className}`} aria-hidden>
      {colors.map((color, i) => (
        <span
          key={i}
          className="reactbits-beam"
          style={{
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            animationDelay: `${i * -4.5}s`,
            top: `${12 + i * 30}%`,
          }}
        />
      ))}
    </div>
  );
}
