"use client";

// Ported from reactbits.dev (Text Animations → Count Up), adapted to this repo's framer-motion version.
import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";

interface CountUpProps {
  to: number;
  from?: number;
  direction?: "up" | "down";
  delay?: number;
  duration?: number;
  className?: string;
  startWhen?: boolean;
  separator?: string;
  prefix?: string;
  suffix?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

export function CountUp({
  to,
  from = 0,
  direction = "up",
  delay = 0,
  duration = 1.6,
  className = "",
  startWhen = true,
  separator = "",
  prefix = "",
  suffix = "",
  onStart,
  onEnd,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(direction === "down" ? to : from);

  const damping = 20 + 40 * (1 / duration);
  const stiffness = 100 * (1 / duration);
  const springValue = useSpring(motionValue, { damping, stiffness });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  const target = direction === "down" ? from : to;
  const hasDecimals = target.toString().includes(".");

  useEffect(() => {
    if (ref.current) {
      ref.current.textContent = `${prefix}${direction === "down" ? to : from}${suffix}`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isInView || !startWhen) return;
    const startId = setTimeout(() => {
      onStart?.();
      motionValue.set(target);
    }, delay * 1000);
    const endId = setTimeout(() => onEnd?.(), delay * 1000 + duration * 1000);
    return () => {
      clearTimeout(startId);
      clearTimeout(endId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInView, startWhen]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      if (!ref.current) return;
      const options: Intl.NumberFormatOptions = {
        useGrouping: !!separator,
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: hasDecimals ? 2 : 0,
      };
      const formatted = Intl.NumberFormat("en-US", options).format(latest);
      const withSeparator = separator ? formatted.replace(/,/g, separator) : formatted;
      ref.current.textContent = `${prefix}${withSeparator}${suffix}`;
    });
    return () => unsubscribe();
  }, [springValue, separator, hasDecimals, prefix, suffix]);

  return <span className={className} ref={ref} />;
}
