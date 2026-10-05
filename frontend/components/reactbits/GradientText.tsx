// Ported from reactbits.dev (Text Animations → Gradient Text).
interface GradientTextProps {
  children: React.ReactNode;
  className?: string;
  colors?: string[];
  animationSpeed?: number;
  showBorder?: boolean;
}

export function GradientText({
  children,
  className = "",
  colors = ["var(--series-1)", "var(--accent-l)", "var(--series-1)"],
  animationSpeed = 6,
  showBorder = false,
}: GradientTextProps) {
  const gradientStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(to right, ${colors.join(", ")})`,
    backgroundSize: "300% 100%",
    animationDuration: `${animationSpeed}s`,
  };

  return (
    <span className={`reactbits-gradient-text ${className}`}>
      {showBorder && <span aria-hidden className="reactbits-gradient-text-border" style={gradientStyle} />}
      <span className="reactbits-gradient-text-content" style={gradientStyle}>
        {children}
      </span>
    </span>
  );
}
