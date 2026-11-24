// Report building blocks from the Figma Components page. The landing page shows them with
// sample values; the report page (KAN-40) feeds them real metrics.

const TICKS = Array.from({ length: 39 }, (_, i) => i + 1);

/** Positions are fractions 0..1 of the answer's length. */
export function TimecodeTape({
  issues,
  playhead,
  scale,
}: {
  issues: number[];
  playhead?: number;
  scale: string[];
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="relative h-14 w-full bg-surface-sunken" aria-hidden="true">
        {TICKS.map((i) => (
          <span
            key={i}
            className={`absolute bottom-0 w-px bg-ink-primary ${i % 5 === 0 ? "h-[22px]" : "h-[14px]"}`}
            style={{ left: `${i * 2.5}%` }}
          />
        ))}
        {issues.map((x, i) => (
          <span key={i} className="absolute inset-y-0 w-0.5 bg-warning-fill" style={{ left: `${x * 100}%` }} />
        ))}
        {playhead !== undefined && (
          <span className="absolute -top-1.5 h-[68px] w-0.5 bg-surface-inverse" style={{ left: `${playhead * 100}%` }} />
        )}
      </div>
      <Scale values={scale} />
    </div>
  );
}

export function PaceMeter({
  wpm,
  min,
  max,
  targetLow,
  targetHigh,
}: {
  wpm: number;
  min: number;
  max: number;
  targetLow: number;
  targetHigh: number;
}) {
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-[40px] leading-[44px]">{wpm} kata per menit</p>
        <p className="text-body-sm text-ink-secondary">
          Target latihan {targetLow} sampai {targetHigh}
        </p>
      </div>
      <div className="relative h-14 w-full bg-surface-sunken" aria-hidden="true">
        <span
          className="absolute inset-y-0 bg-success-fill/30"
          style={{ left: at(targetLow), right: `calc(100% - ${at(targetHigh)})` }}
        />
        <span className="absolute -top-1.5 h-[68px] w-0.5 rounded-full bg-surface-inverse" style={{ left: at(wpm) }} />
      </div>
      <Scale values={[min, targetLow, targetHigh, max].map(String)} />
    </div>
  );
}

function Scale({ values }: { values: string[] }) {
  return (
    <div className="flex justify-between font-mono text-xs leading-4 text-ink-tertiary" aria-hidden="true">
      {values.map((v) => (
        <span key={v}>{v}</span>
      ))}
    </div>
  );
}

export function FeedbackMarker({ time, title, tip }: { time: string; title: string; tip: string }) {
  return (
    <div className="flex w-full gap-5 border-t border-border-default py-4">
      <p className="w-28 shrink-0 font-mono text-[13px] leading-5 text-ink-accent sm:w-38">{time}</p>
      <div className="flex flex-col gap-1">
        <p className="text-base leading-6 font-semibold">{title}</p>
        <p className="text-body-sm text-ink-secondary">{tip}</p>
      </div>
    </div>
  );
}
