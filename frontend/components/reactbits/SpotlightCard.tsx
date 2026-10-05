"use client";

// Ported from reactbits.dev (Components → Spotlight Card).
import { useRef } from "react";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  spotlightColor?: string;
}

export function SpotlightCard({
  children,
  className = "",
  style,
  spotlightColor = "rgba(79, 70, 229, 0.18)",
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const div = divRef.current;
    if (!div) return;
    const rect = div.getBoundingClientRect();
    div.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    div.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
    div.style.setProperty("--spotlight-color", spotlightColor);
  };

  return (
    <div ref={divRef} onMouseMove={handleMouseMove} className={`reactbits-spotlight-card ${className}`} style={style}>
      {children}
    </div>
  );
}
