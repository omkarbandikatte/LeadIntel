"use client";

// Inspired by reactbits.dev (Backgrounds → Squares) — a drifting grid with
// occasional glowing cells, implemented with canvas instead of the
// OGL/WebGL original to avoid adding a new dependency.
import { useEffect, useRef } from "react";

interface SquaresProps {
  color?: string;
  squareSize?: number;
  speed?: number;
  className?: string;
}

interface GlowCell {
  col: number;
  row: number;
  phase: number;
}

export function Squares({ color = "var(--series-1)", squareSize = 44, speed = 0.3, className = "" }: SquaresProps) {
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

    const glowCells: GlowCell[] = Array.from({ length: 10 }, () => ({
      col: Math.floor(Math.random() * 40),
      row: Math.floor(Math.random() * 40),
      phase: Math.random() * Math.PI * 2,
    }));

    let offset = 0;
    let rafId: number;
    const draw = (t: number) => {
      offset += speed;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;

      const cols = Math.ceil(width / squareSize) + 2;
      const rows = Math.ceil(height / squareSize) + 2;
      const startX = -(offset % squareSize);
      const startY = -(offset % squareSize);

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = startX + c * squareSize;
          const y = startY + r * squareSize;
          ctx.strokeRect(x, y, squareSize, squareSize);
        }
      }

      glowCells.forEach((cell) => {
        const x = startX + cell.col * squareSize;
        const y = startY + cell.row * squareSize;
        const alpha = 0.12 + 0.1 * Math.sin(t / 900 + cell.phase);
        ctx.fillStyle = resolvedColor;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillRect(x, y, squareSize, squareSize);
        ctx.globalAlpha = 1;
      });

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [color, squareSize, speed]);

  return <canvas ref={canvasRef} className={`pointer-events-none h-full w-full ${className}`} aria-hidden />;
}
