// Background motif: echo-like contour swirls in the paper's own darker tone (surface-sunken),
// so they catch the eye without competing with content. Decorative only.
const RINGS = [0, 1, 2, 3, 4];

function Swirl({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 600 600"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {RINGS.map((i) => {
        const r = 70 + i * 46;
        // A loose spiral arc: each ring starts a little further round, so the set reads as a swirl.
        return (
          <path
            key={i}
            d={`M ${300 - r} 300 C ${300 - r} ${300 - r * 1.1}, ${300 + r * 1.05} ${300 - r * 0.95}, ${300 + r} 300 S ${300 - r * 0.2} ${300 + r * 1.15}, ${300 - r * 0.55} ${300 + r * 0.5}`}
            stroke="var(--surface-sunken)"
            strokeWidth={i === 0 ? 2 : 1.5}
            strokeLinecap="round"
            transform={`rotate(${i * 18} 300 300)`}
          />
        );
      })}
    </svg>
  );
}

export function PaperSwirls() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
      <Swirl className="swirl absolute -top-48 -right-40 size-[640px] opacity-50 md:opacity-90" />
      <Swirl className="swirl swirl-reverse absolute -bottom-56 -left-48 size-[560px] opacity-40 md:opacity-70" />
    </div>
  );
}
