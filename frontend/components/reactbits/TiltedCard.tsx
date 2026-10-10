"use client";

// Ported from reactbits.dev (Components → Tilted Card), using framer-motion
// springs (already a project dependency) instead of the original vanilla-JS version.
import { useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

interface TiltedCardProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  scaleOnHover?: number;
}

export function TiltedCard({ children, className = "", maxTilt = 10, scaleOnHover = 1.02 }: TiltedCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 150, damping: 18 });
  const springY = useSpring(rotateY, { stiffness: 150, damping: 18 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * 2 * maxTilt);
    rotateX.set(-(py - 0.5) * 2 * maxTilt);
    el.style.setProperty("--mouse-x", `${px * 100}%`);
    el.style.setProperty("--mouse-y", `${py * 100}%`);
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div ref={ref} className={`reactbits-tilted-card ${className}`}>
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX: springX, rotateY: springY, transformStyle: "preserve-3d" }}
        whileHover={{ scale: scaleOnHover }}
        className="relative"
      >
        {children}
        <div className="reactbits-tilted-card-glare pointer-events-none absolute inset-0 rounded-[inherit]" />
      </motion.div>
    </div>
  );
}
