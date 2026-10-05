"use client";

// Inspired by reactbits.dev (Backgrounds → Particles) — a drifting dot field,
// implemented with canvas instead of the WebGL/OGL original.
import { useEffect, useRef } from "react";

interface ParticlesProps {
  color?: string;
  count?: number;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  alpha: number;
}

export function Particles({ color = "var(--series-1)", count = 46, className = "" }: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resolveColor = (value: string) => {
      const match = /^var\((--[\w-]+)\)$/.exec(value.trim());
      if (!match) return value;
      return getComputedStyle(container).getPropertyValue(match[1]).trim() || "#818cf8";
    };
    const resolvedColor = resolveColor(color);

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = canvas.width = rect.width;
      height = canvas.height = rect.height;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 1 + Math.random() * 2,
      vy: 0.12 + Math.random() * 0.25,
      vx: (Math.random() - 0.5) * 0.15,
      alpha: 0.2 + Math.random() * 0.5,
    }));

    let rafId: number;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        p.y -= p.vy;
        p.x += p.vx;
        if (p.y < -5) { p.y = height + 5; p.x = Math.random() * width; }
        if (p.x < -5) p.x = width + 5;
        if (p.x > width + 5) p.x = -5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = resolvedColor;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [color, count]);

  return <canvas ref={canvasRef} className={`pointer-events-none h-full w-full ${className}`} aria-hidden />;
}
