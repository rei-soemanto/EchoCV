import Image from "next/image";
import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

// shortcut: the design's sample data; swap for the Sessions API (KAN-24) and history (KAN-55).
const STATS = [
  { label: "Skor latihan terakhir", value: "78", unit: "dari 100" },
  { label: "Kata pengisi per menit", value: "2,4", unit: "turun dari 4,1 minggu lalu" },
  { label: "Kecepatan bicara", value: "142", unit: "kata per menit" },
];

const SESSIONS: {
  id: string;
  date: string;
  role: string;
  mode: string;
  score?: number;
  status: { tone: BadgeTone; label: string };
}[] = [
  { id: "s4", date: "19 Okt 2026", role: "Frontend Developer", mode: "Live", score: 78, status: { tone: "success", label: "Selesai" } },
  { id: "s3", date: "16 Okt 2026", role: "Frontend Developer", mode: "Live", score: 71, status: { tone: "success", label: "Selesai" } },
  { id: "s2", date: "12 Okt 2026", role: "Data Analyst", mode: "Unggah", score: 66, status: { tone: "warning", label: "Sebagian" } },
  { id: "s1", date: "9 Okt 2026", role: "IT Support", mode: "Unggah", status: { tone: "danger", label: "Gagal" } },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1">Selamat datang kembali</h1>
          <p className="text-body text-ink-secondary">
            Sisa 2 dari 3 sesi gratis bulan ini. Kuota kembali setiap tanggal 1.
          </p>
        </div>
        <Badge>Gratis: 2 dari 3</Badge>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <Link href="/practice" className={buttonVariants()}>
          <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
          Mulai latihan baru
        </Link>
        <Link href="/practice?quick=1" className={buttonVariants({ variant: "link", size: "text" })}>
          Latihan cepat: perkenalkan diri
        </Link>
      </div>

      <dl className="grid gap-10 sm:grid-cols-3">
        {STATS.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 border-t border-ink-primary pt-4">
            <dt className="text-body-sm text-ink-secondary">{s.label}</dt>
            <dd className="flex items-baseline gap-2">
              <span className="text-number">{s.value}</span>
              <span className="text-body-sm text-ink-secondary">{s.unit}</span>
            </dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-4 border-t border-ink-primary pt-6">
        <h2 className="text-h2">Fokus berikutnya</h2>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex max-w-2xl flex-1 flex-col gap-2">
            <h3 className="text-h3">Kata pengisi</h3>
            <p className="text-body text-ink-secondary">
              Ini aspek terlemah Anda minggu ini. Coba set pertanyaan perilaku (STAR) dan tarik
              napas satu kali sebelum mulai menjawab.
            </p>
          </div>
          <Link href="/practice" className={buttonVariants({ variant: "outline" })}>
            Latih set STAR
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h2">Sesi terakhir</h2>
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
              {SESSIONS.map((s) => (
                <tr key={s.id} className="border-t border-border-default">
                  <td className="py-4 pr-3 pl-3">{s.date}</td>
                  <td className="py-4">{s.role}</td>
                  <td className="py-4">{s.mode}</td>
                  <td className="text-h2 py-4 font-medium">
                    {s.score ?? <span className="sr-only">Tidak ada skor</span>}
                  </td>
                  <td className="py-4">
                    <Badge tone={s.status.tone}>{s.status.label}</Badge>
                  </td>
                  <td className="py-4 text-right">
                    <Link
                      href={s.score === undefined ? "/practice" : `/report/${s.id}`}
                      className={buttonVariants({ variant: "link", size: "text" })}
                    >
                      {s.score === undefined ? "Coba lagi" : "Lihat laporan"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-body-sm text-ink-secondary">
          Analisis yang gagal tidak mengurangi kuota Anda.
        </p>
      </section>
    </div>
  );
}
