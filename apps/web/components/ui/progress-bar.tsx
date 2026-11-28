"use client";

import { useEffect, useState } from "react";

export function estimate(elapsedMs: number, expectedMs: number): number {
  return Math.min(0.95, 1 - Math.exp(-Math.max(0, elapsedMs) / Math.max(1, expectedMs)));
}

export function useElapsed(running: boolean): number {
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const begin = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock is the external system
    setStart(begin);
    setNow(begin);
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [running]);
  return running && start !== null ? now - start : 0;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-3 w-full overflow-hidden rounded-full bg-border-default"
    >
      <div className="h-full rounded-full bg-surface-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}
