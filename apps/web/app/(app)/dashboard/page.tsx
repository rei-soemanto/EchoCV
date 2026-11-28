import Image from "next/image";
import Link from "next/link";

import { SessionTable } from "@/components/session-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireProfile } from "@/lib/db/current-profile";
import { loadHistory } from "@/lib/db/history";
import {
  failureReasonMessage,
  parseFailureReason,
  summarizeRecentUploads,
  type RecentUpload,
} from "@/lib/practice/video-upload";
import { decimal, NEXT_STEPS } from "@/lib/report/view";
import { createClient } from "@/lib/supabase/server";

type UploadRow = {
  id: string;
  answer_id: string;
  storage_path: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
};

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col gap-1 border-t border-ink-primary pt-4">
      <dt className="text-body-sm text-ink-secondary">{label}</dt>
      <dd className="flex items-baseline gap-2">
        <span className="text-number">{value}</span>
        <span className="text-body-sm text-ink-secondary">{unit}</span>
      </dd>
    </div>
  );
}

export default async function DashboardPage() {
  const account = await requireProfile();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [history, uploadsResult] = auth.user
    ? await Promise.all([
        loadHistory(supabase, auth.user.id, 20),
        supabase
          .from("uploads")
          .select("id, answer_id, storage_path, status, failure_reason, created_at")
          .eq("kind", "video")
          .in("status", ["processing", "failed"])
          .order("created_at", { ascending: false })
          .limit(10),
      ])
    : [null, { data: [] }];
  if (!history) throw new Error("Could not load the practice history.");

  const recentUploads: RecentUpload[] = ((uploadsResult.data ?? []) as UploadRow[])
    .map((row) => ({
      upload_id: row.id,
      answer_id: row.answer_id,
      session_id: row.storage_path.split("/")[1] ?? "",
      status: row.status,
      failure_reason: parseFailureReason(row.failure_reason),
      created_at: row.created_at,
    }))
    .filter((row) => row.session_id.length > 0);
  const openSessions = new Map(history.sessions.filter((s) => s.status === "in_progress").map((s) => [s.id, s]));
  const videoAnalyses = summarizeRecentUploads(recentUploads)
    .filter((item) => (item.status === "processing" || item.status === "failed") && openSessions.has(item.sessionId))
    .map((item) => ({ ...item, role: openSessions.get(item.sessionId)!.role }));

  const latest = history.trends.overall.at(-1);
  const finished = history.sessions.filter((s) => s.overall_score !== null).length;
  const firstName = account.fullName.split(" ")[0];
  const weakest = history.weakest;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">{finished ? `Selamat datang kembali, ${firstName}` : `Selamat datang, ${firstName}`}</h1>
        <p className="text-body text-ink-secondary">
          {finished
            ? "Lihat apa yang berubah sejak latihan pertama, lalu latih satu hal berikutnya."
            : "Mulai dengan satu latihan singkat. Laporan pertama Anda muncul di sini."}
        </p>
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

      {latest && (
        <dl className="grid gap-10 sm:grid-cols-3">
          <Stat label="Skor latihan terakhir" value={decimal(latest.score)} unit="dari 100" />
          <Stat
            label="Perubahan sejak sesi pertama"
            value={history.change === null ? "–" : `${history.change > 0 ? "+" : ""}${decimal(history.change)}`}
            unit={history.change === null ? "perlu dua sesi" : "poin"}
          />
          <Stat label="Sesi dengan laporan" value={String(finished)} unit="sesi" />
        </dl>
      )}

      {videoAnalyses.length > 0 && (
        <section className="flex flex-col gap-4 border-t border-ink-primary pt-6">
          <h2 className="text-h2">Analisis video</h2>
          <ul className="flex flex-col">
            {videoAnalyses.map((item) => (
              <li
                key={item.sessionId}
                className="flex flex-wrap items-start justify-between gap-4 border-b border-border-default py-4 last:border-b-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-h3">{item.role}</h3>
                    <Badge tone={item.status === "processing" ? "accent" : "danger"}>
                      {item.status === "processing" ? "Dianalisis" : "Gagal"}
                    </Badge>
                  </div>
                  {item.status === "failed" && (
                    <p className="text-body-sm text-ink-danger">{failureReasonMessage(item.failureReason)}</p>
                  )}
                </div>
                <Link href={`/upload?session=${item.sessionId}`} className={buttonVariants({ variant: "outline" })}>
                  Buka unggahan
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {weakest && (
        <section className="flex flex-col gap-4 border-t border-ink-primary pt-6">
          <h2 className="text-h2">Fokus berikutnya</h2>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex max-w-2xl flex-1 flex-col gap-2">
              <h3 className="text-h3">{weakest.label.id}</h3>
              <p className="text-body text-ink-secondary">
                Ini aspek dengan rata-rata terendah Anda ({decimal(weakest.score)} dari 100). {NEXT_STEPS[weakest.id]}
              </p>
            </div>
            <Link href="/practice" className={buttonVariants({ variant: "outline" })}>
              Latih sekarang
            </Link>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-h2">Sesi terakhir</h2>
          {history.sessions.length > 5 && (
            <Link href="/history" className={buttonVariants({ variant: "link", size: "text" })}>
              Lihat semua sesi
            </Link>
          )}
        </div>
        {history.sessions.length ? (
          <SessionTable sessions={history.sessions.slice(0, 5)} />
        ) : (
          <p className="text-body text-ink-secondary">Belum ada sesi latihan.</p>
        )}
      </section>
    </div>
  );
}
