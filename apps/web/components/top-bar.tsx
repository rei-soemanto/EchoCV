import Link from "next/link";

export function TopBar({ note }: { note: string }) {
  return (
    <header className="flex items-center justify-between gap-6 border-b border-border-default px-4 py-4 md:px-12 md:py-6">
      <Link href="/dashboard" className="text-h2">
        EchoCV
      </Link>
      <p className="text-body-sm text-right text-ink-secondary">{note}</p>
    </header>
  );
}
