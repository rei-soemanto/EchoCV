import Image from "next/image";

// Figma "Choice": selected has a tint, a heavier edge and a filled radio.
export function ChoiceGroup({
  name,
  label,
  hint,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  options: [string, string][];
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex w-full flex-col gap-3">
      <legend className="text-label mb-3">{label}</legend>
      {hint && <p className="text-body-sm -mt-2 text-ink-secondary">{hint}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(([key, text]) => {
          const checked = value === key;
          return (
            <label
              key={key}
              className={`text-body-sm flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-4 py-3 focus-within:ring-3 focus-within:ring-ring/50 ${
                checked
                  ? "border-[1.5px] border-surface-accent bg-surface-accent-subtle"
                  : "border border-border-strong"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={key}
                checked={checked}
                onChange={() => onChange(key)}
                className="sr-only"
              />
              <Image src={checked ? "/icons/radio-checked.svg" : "/icons/radio.svg"} alt="" width={18} height={18} />
              {text}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
