// Figma "Consent Row" with its "Toggle": a checkbox shown as a switch, labelled by the text beside it.
export function ConsentRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex w-full cursor-pointer items-center gap-6 border-t border-border-default py-5">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-label">{title}</span>
        <span className="text-body-sm text-ink-secondary">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="relative h-[26px] w-11 shrink-0 cursor-pointer appearance-none rounded-full border border-border-strong bg-surface-sunken outline-none before:absolute before:top-[2px] before:left-[2px] before:size-5 before:rounded-full before:bg-ink-secondary before:transition-transform checked:border-surface-accent checked:bg-surface-accent checked:before:translate-x-[18px] checked:before:bg-ink-on-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </label>
  );
}
