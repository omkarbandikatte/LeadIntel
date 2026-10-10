// Ported from reactbits.dev (Components → Marquee / Logo Loop), simplified to a text ticker.
interface MarqueeProps {
  items: string[];
  speed?: number;
  className?: string;
}

export function Marquee({ items, speed = 28, className = "" }: MarqueeProps) {
  const doubled = [...items, ...items];
  return (
    <div className={`overflow-hidden ${className}`} style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}>
      <div className="reactbits-marquee-track" style={{ animationDuration: `${speed}s` }}>
        {doubled.map((item, i) => (
          <span key={i} className="mx-5 whitespace-nowrap text-sm font-medium tracking-wide" style={{ color: "var(--text-muted)" }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
