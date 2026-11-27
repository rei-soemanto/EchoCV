"use client";

import { useId, useRef, useState } from "react";

const PARTS = [
  { key: "day", label: "Tanggal", placeholder: "HH", length: 2 },
  { key: "month", label: "Bulan", placeholder: "BB", length: 2 },
  { key: "year", label: "Tahun", placeholder: "TTTT", length: 4 },
] as const;
type Part = (typeof PARTS)[number]["key"];

/** "2000-05-01" once all three parts are filled in, else "" (the form then asks for a date). */
export function joinDate(parts: Record<Part, string>): string {
  const { day, month, year } = parts;
  if (!day || !month || year.length !== 4) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Day, month and year in three boxes that move to the next box once one is full (mid-MVP check):
 * the browser's own date field is slow to fill in on a phone and in some desktop locales.
 */
export function DateFields({
  label,
  hint,
  error,
  onChange,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [parts, setParts] = useState<Record<Part, string>>({ day: "", month: "", year: "" });
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  function type(index: number, raw: string) {
    // Digits beyond a full box carry on into the next ones, so pasting "05032001" fills all three.
    const next = { ...parts };
    let digits = raw.replace(/\D/g, "");
    let at = index;
    do {
      const { key, length } = PARTS[at];
      next[key] = digits.slice(0, length);
      digits = digits.slice(length);
      if (next[key].length === length && at < PARTS.length - 1) at++;
      else break;
    } while (digits);
    setParts(next);
    onChange(joinDate(next));
    boxes.current[at]?.focus();
  }

  return (
    <fieldset className="flex w-full flex-col gap-2" aria-describedby={hint || error ? `${id}-note` : undefined}>
      <legend className="text-label mb-2">{label}</legend>
      <div className="flex gap-3">
        {PARTS.map((part, i) => (
          <label key={part.key} className={`flex flex-col gap-1 ${part.key === "year" ? "w-28" : "w-20"}`}>
            <span className="text-body-sm text-ink-secondary">{part.label}</span>
            <input
              ref={(el) => {
                boxes.current[i] = el;
              }}
              inputMode="numeric"
              autoComplete={`bday-${part.key}`}
              placeholder={part.placeholder}
              value={parts[part.key]}
              aria-invalid={error ? true : undefined}
              onChange={(event) => type(i, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && !parts[part.key] && i > 0) {
                  event.preventDefault(); // only move back; deleting stays a separate key press
                  boxes.current[i - 1]?.focus();
                }
              }}
              className={`text-body min-h-11 w-full rounded-[2px] border-b bg-surface-card px-3 outline-none placeholder:text-ink-tertiary focus-visible:ring-3 focus-visible:ring-ring/50 ${
                error ? "border-ink-danger" : "border-border-strong"
              }`}
            />
          </label>
        ))}
      </div>
      {(hint || error) && (
        <p
          id={`${id}-note`}
          role={error ? "alert" : undefined}
          className={`text-body-sm ${error ? "text-ink-danger" : "text-ink-secondary"}`}
        >
          {error || hint}
        </p>
      )}
    </fieldset>
  );
}
