import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { History } from "@/lib/db/history";

type Session = History["sessions"][number];

const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

/** What the row says about a session, and where its link goes. */
export function sessionRow(session: Session): { tone: BadgeTone; label: string; action: string; href: string } {
  if (session.status === "in_progress") {
    const href = session.mode === "live" ? `/practice/check?session=${session.id}` : `/upload?session=${session.id}`;
    return { tone: "accent", label: "Berjalan", action: "Lanjutkan", href };
  }
  if (session.status === "finished") {
    return session.overall_score === null
      ? { tone: "warning", label: "Laporan belum ada", action: "Buat laporan", href: `/report/${session.id}` }
      : { tone: "success", label: "Selesai", action: "Lihat laporan", href: `/report/${session.id}` };
  }
  const label = session.status === "failed" ? "Gagal" : session.status === "expired" ? "Kedaluwarsa" : "Dibatalkan";
  return { tone: session.status === "failed" ? "danger" : "neutral", label, action: "Latihan lagi", href: "/practice" };
}

// Figma 04 Beranda, "Sesi terakhir".
export function SessionTable({ sessions }: { sessions: Session[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead className="border-b border-border-strong bg-surface-subtle">
          <tr className="text-label text-ink-secondary">
            <th className="px-3 py-2 font-semibold">Tanggal</th>
            <th className="py-2 font-semibold">Peran</th>
            <th className="py-2 font-semibold">Mode</th>
            <th className="py-2 font-semibold">Skor</th>
            <th className="py-2 font-semibold">Status</th>
            <th className="py-2">
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody className="text-body-sm">
          {sessions.map((session) => {
            const row = sessionRow(session);
            return (
              <tr key={session.id} className="border-t border-border-default">
                <td className="py-4 pr-3 pl-3">{DATE.format(new Date(session.created_at))}</td>
                <td className="py-4">{session.role}</td>
                <td className="py-4">{session.mode === "live" ? "Live" : "Unggah"}</td>
                <td className="text-h2 py-4 font-medium">
                  {session.overall_score ?? <span className="sr-only">Tidak ada skor</span>}
                </td>
                <td className="py-4">
                  <Badge tone={row.tone}>{row.label}</Badge>
                </td>
                <td className="py-4 pr-3 text-right">
                  <Link href={row.href} className={buttonVariants({ variant: "link", size: "text" })}>
                    {row.action}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
