import { useId } from "react";

export function TextField({
  label,
  hint,
  error,
  ...input
}: { label: string; hint?: string; error?: string | null } & React.ComponentProps<"input">) {
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-2">
      <label htmlFor={id} className="text-label">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-note` : undefined}
        className={`text-body min-h-11 w-full rounded-[2px] border-b bg-surface-card px-3 outline-none placeholder:text-ink-tertiary focus-visible:ring-3 focus-visible:ring-ring/50 ${
          error ? "border-ink-danger" : "border-border-strong"
        }`}
        {...input}
      />
      {(hint || error) && (
        <p
          id={`${id}-note`}
          role={error ? "alert" : undefined}
          className={`text-body-sm ${error ? "text-ink-danger" : "text-ink-secondary"}`}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
