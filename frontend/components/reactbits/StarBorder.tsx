// Ported from reactbits.dev (Animations → Star Border), simplified to wrap any
// existing button/link element rather than being a polymorphic root itself.
interface StarBorderProps {
  className?: string;
  color?: string;
  speed?: string;
  thickness?: number;
  children: React.ReactNode;
}

export function StarBorder({
  className = "",
  color = "var(--series-1)",
  speed = "5s",
  thickness = 2,
  children,
}: StarBorderProps) {
  return (
    <span className={`reactbits-star-border-container ${className}`} style={{ padding: `${thickness}px` }}>
      <span
        className="reactbits-star-border-bottom"
        style={{ background: `radial-gradient(circle, ${color}, transparent 10%)`, animationDuration: speed }}
      />
      <span
        className="reactbits-star-border-top"
        style={{ background: `radial-gradient(circle, ${color}, transparent 10%)`, animationDuration: speed }}
      />
      <span className="reactbits-star-border-content">{children}</span>
    </span>
  );
}
