// Inspired by reactbits.dev (Backgrounds → Waves) — layered animated SVG
// waves, pure CSS/SVG so no canvas/WebGL dependency is needed.
interface WavesProps {
  colors?: string[];
  className?: string;
}

export function Waves({ colors = ["var(--series-1)", "var(--accent-l)"], className = "" }: WavesProps) {
  return (
    <div className={`reactbits-waves ${className}`} aria-hidden>
      {colors.map((color, i) => (
        <svg
          key={i}
          className="reactbits-wave"
          style={{ animationDelay: `${i * -6}s`, animationDuration: `${18 + i * 6}s`, bottom: `${i * 6}%`, opacity: 0.35 - i * 0.1 }}
          viewBox="0 0 1200 200"
          preserveAspectRatio="none"
        >
          <path
            d="M0,100 C150,180 350,20 600,100 C850,180 1050,20 1200,100 L1200,200 L0,200 Z"
            fill={color}
          />
        </svg>
      ))}
    </div>
  );
}
