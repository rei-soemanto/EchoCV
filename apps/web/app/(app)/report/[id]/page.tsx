import Link from "next/link";
import { notFound } from "next/navigation";

import { PlaceholderPage } from "@/components/placeholder-page";
import { buttonVariants } from "@/components/ui/button";
import { isUuid } from "@/lib/db/uploads";
import { fillerTarget } from "@/lib/report/view";
import type { Band } from "@/lib/scoring/score";
import { createClient } from "@/lib/supabase/server";

import { SessionReport } from "./session-report";

export const metadata = { title: "Laporan sesi · EchoCV" };

const LEVELS: Record<string, string> = {
  internship: "Magang",
  fresh_graduate: "Fresh graduate",
  junior: "Junior",
  mid_level: "Menengah",
};
const SETS: Record<string, string> = {
  general: "Umum",
  behavioral: "Perilaku (STAR)",
  role_specific: "Teknis sesuai peran",
};

export default async function ReportPage(props: PageProps<"/report/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();

  // Row-level security limits the read to the signed-in user's own session.
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("practice_sessions")
    .select("id, role, level, question_set, language, mode, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();

  if (session.status === "in_progress") {
    return (
      <PlaceholderPage title="Sesi belum selesai" description="Laporan dibuat setelah semua pertanyaan dijawab.">
        <Link
          href={session.mode === "live" ? `/practice/room?session=${id}` : `/upload?session=${id}`}
          className={buttonVariants({ className: "w-fit" })}
        >
          Lanjutkan sesi
        </Link>
      </PlaceholderPage>
    );
  }

  const { data: bands } = await supabase.from("scoring_bands").select("*").eq("dimension", "fillers");

  const started = new Date(session.created_at);
  const date = started.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
  const time = started.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

  return (
    <SessionReport
      sessionId={id}
      fillerTarget={fillerTarget((bands ?? []) as Band[], session.language)}
      // Upload mode has no calibration: the speech service measures against the answer's own start
      // (baseline "answer_start"). The API does not store that field, and it is the same for every upload.
      lessPrecise={session.mode === "upload"}
      title={`Laporan sesi, ${date}`}
      subtitle={`${session.role}, ${LEVELS[session.level] ?? session.level}, set ${SETS[session.question_set] ?? session.question_set}, ${time.replace(".", ":")}`}
    />
  );
}
