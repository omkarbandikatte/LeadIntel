"use client";

import { useEffect, useRef, useState } from "react";

interface FadeInProps {
  children: React.ReactNode;
  /** Delay before the animation starts, in milliseconds. Default 0. */
  delay?: number;
  /** Direction to animate from. Default "up". */
  direction?: "up" | "left" | "none";
  /** Intersection threshold before the animation fires. Default 0.1. */
  threshold?: number;
  className?: string;
}

/**
 * Wraps children in a div that fades in once it scrolls into the viewport.
 * Uses IntersectionObserver — fires once, then disconnects.
 */
export function FadeIn({
  children,
  delay = 0,
  direction = "up",
  threshold = 0.1,
  className = "",
}: FadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  const translateMap = {
    up:   "translateY(22px)",
    left: "translateX(-22px)",
    none: "none",
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : translateMap[direction],
        transition: `opacity 0.5s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
