import Image from "next/image";
import { cn } from "cn";

const TONES = {
  accent: { box: "bg-surface-accent-subtle", text: "text-ink-accent", icon: null },
  neutral: { box: "border border-border-strong", text: "text-ink-secondary", icon: null },
  success: { box: "bg-success-bg", text: "text-ink-success", icon: "/icons/badge-success.svg" },
  warning: { box: "bg-warning-bg", text: "text-ink-warning", icon: "/icons/badge-warning.svg" },
  danger: { box: "bg-danger-bg", text: "text-ink-danger", icon: "/icons/badge-danger.svg" },
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "accent",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[2px] px-2 py-px text-xs leading-[18px] font-medium whitespace-nowrap",
        t.box,
        t.text,
        className,
      )}
    >
      {t.icon && <Image src={t.icon} alt="" width={14} height={14} />}
      {children}
    </span>
  );
}
