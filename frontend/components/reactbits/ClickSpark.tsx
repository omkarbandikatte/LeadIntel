"use client";

// Ported from reactbits.dev (Animations → Click Spark).
import { useRef, useEffect, useCallback } from "react";

interface ClickSparkProps {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  extraScale?: number;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

const easeFunc = (t: number, easing: ClickSparkProps["easing"]) => {
  switch (easing) {
    case "linear":
      return t;
    case "ease-in":
      return t * t;
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default:
      return t * (2 - t); // ease-out
  }
};

export function ClickSpark({
  sparkColor = "var(--series-1)",
  sparkSize = 10,
  sparkRadius = 18,
  sparkCount = 8,
  duration = 450,
  easing = "ease-out",
  extraScale = 1,
  children,
  className = "",
  style,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const draw = (timestamp: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= duration) return false;

        const progress = easeFunc(elapsed / duration, easing);
        const distance = progress * sparkRadius * extraScale;
        const lineLength = sparkSize * (1 - progress);

        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);
        const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

        ctx.strokeStyle = sparkColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1 - progress;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return true;
      });
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      resizeObserver.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sparkColor, sparkSize, sparkRadius, duration, easing, extraScale]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const now = performance.now();
      for (let i = 0; i < sparkCount; i++) {
        sparksRef.current.push({ x, y, angle: (2 * Math.PI * i) / sparkCount, startTime: now });
      }
    },
    [sparkCount]
  );

  return (
    <div ref={containerRef} onClick={handleClick} className={`relative ${className}`} style={style}>
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-50 h-full w-full" />
      {children}
    </div>
  );
}
