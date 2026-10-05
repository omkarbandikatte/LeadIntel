// Visual adaptation of reactbits.dev's "Aurora" background (CSS blobs instead of the
// WebGL/OGL version, to avoid adding a new runtime dependency to this project).
interface AuroraProps {
  colors?: string[];
  speed?: number;
  className?: string;
}

export function Aurora({
  colors = ["var(--series-1)", "var(--accent-l)", "var(--status-good)"],
  speed = 16,
  className = "",
}: AuroraProps) {
  return (
    <div className={`reactbits-aurora ${className}`} aria-hidden>
      {colors.map((color, i) => (
        <span
          key={i}
          className="reactbits-aurora-blob"
          style={{
            background: color,
            animationDuration: `${speed + i * 4}s`,
            animationDelay: `${i * -3}s`,
          }}
        />
      ))}
    </div>
  );
}
