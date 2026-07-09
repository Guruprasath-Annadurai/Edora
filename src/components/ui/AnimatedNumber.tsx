import { useEffect, useRef, useState } from 'react';
import type React from 'react';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

interface Props {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function AnimatedNumber({ value, duration = 800, decimals = 0, prefix = '', suffix = '', className, style }: Props) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const rafRef  = useRef<number>(0);

  useEffect(() => {
    const from  = prevRef.current;
    const delta = value - from;
    const start = performance.now();

    cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const current  = from + delta * easeOutCubic(progress);
      setDisplay(parseFloat(current.toFixed(decimals)));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
      else prevRef.current = value;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration, decimals]);

  return (
    <span className={className} style={style}>
      {prefix}{display.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}
