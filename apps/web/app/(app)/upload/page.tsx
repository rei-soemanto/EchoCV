import Link from "next/link";

import { PlaceholderPage } from "@/components/placeholder-page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { openSession } from "@/lib/db/open-session";
import { isUuid } from "@/lib/db/uploads";
import {
  failureReasonMessage,
  parseFailureReason,
  summarizeRecentUploads,
  type RecentUpload,
  type RecentUploadSession,
} from "@/lib/practice/video-upload";
import { createClient } from "@/lib/supabase/server";

import { UploadSession, type UploadItem } from "./upload-session";

export const metadata = { title: "Unggah rekaman · EchoCV" };

type RecentUploadRow = {
  id: string;
  answer_id: string;
  storage_path: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
};

type SessionUploadRow = {
  id: string;
  answer_id: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
};

type SessionSummaryRow = {
  id: string;
  role: string;
  status: string;
};

type RecentSessionEntry = RecentUploadSession & {
  role: string;
  sessionStatus: string | null;
};

async function loadRecentSessions(supabase: Awaited<ReturnType<typeof createClient>>): Promise<RecentSessionEntry[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data: rows } = await supabase
    .from("uploads")
    .select("id, answer_id, storage_path, status, failure_reason, created_at")
    .eq("kind", "video")
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(12);
  const uploads: RecentUpload[] = ((rows ?? []) as RecentUploadRow[])
    .map((row) => ({
      upload_id: row.id,
      answer_id: row.answer_id,
      session_id: row.storage_path.split("/")[1] ?? "",
      status: row.status,
      failure_reason: parseFailureReason(row.failure_reason),
      created_at: row.created_at,
    }))
    .filter((row) => row.session_id.length > 0);
  const summarized = summarizeRecentUploads(uploads);
  if (!summarized.length) return [];
  const { data: sessions } = await supabase
    .from("practice_sessions")
    .select("id, role, status")
    .in(
      "id",
      summarized.map((item) => item.sessionId),
    );
  const byId = new Map(((sessions ?? []) as SessionSummaryRow[]).map((s) => [s.id, s]));
  return summarized.map((item) => {
    const session = byId.get(item.sessionId);
    return {
      ...item,
      role: session?.role ?? "Sesi latihan",
      sessionStatus: session?.status ?? null,
    };
  });
}

function Start({ description, recent }: { description: string; recent: RecentSessionEntry[] }) {
  return (
    <PlaceholderPage title="Unggah rekaman" description={description}>
      <Link href="/practice" className={buttonVariants({ className: "w-fit" })}>
        Atur sesi baru
      </Link>
      {recent.length > 0 && (
        <section className="mt-4 flex flex-col gap-4 border-t border-ink-primary pt-6">
          <h2 className="text-h2">Analisis video terakhir</h2>
          <ul className="flex flex-col">
            {recent.map((item) => {
              const badge =
                item.status === "processing"
                  ? { tone: "accent" as const, label: "Dianalisis" }
                  : item.status === "failed"
                    ? { tone: "danger" as const, label: "Gagal" }
                    : { tone: "success" as const, label: "Selesai" };
              const action =
                item.sessionStatus === "in_progress"
                  ? { href: `/upload?session=${item.sessionId}`, label: "Lanjutkan unggahan" }
                  : item.sessionStatus === "finished"
                    ? { href: `/report/${item.sessionId}`, label: "Lihat laporan" }
                    : null;
              return (
                <li
                  key={item.sessionId}
                  className="flex flex-wrap items-start justify-between gap-4 border-b border-border-default py-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-h3">{item.role}</h3>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </div>
                    {item.status === "failed" && (
                      <p className="text-body-sm text-ink-danger">{failureReasonMessage(item.failureReason)}</p>
                    )}
                  </div>
                  {action && (
                    <Link href={action.href} className={buttonVariants({ variant: "outline" })}>
                      {action.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </PlaceholderPage>
  );
}

export default async function UploadPage(props: PageProps<"/upload">) {
  const { session: id } = await props.searchParams;
  const supabase = await createClient();
  if (!isUuid(id)) {
    const recent = await loadRecentSessions(supabase);
    return (
      <Start
        description="Atur sesi dengan mode Unggah dulu, lalu unggah satu video jawaban untuk setiap pertanyaan."
        recent={recent}
      />
    );
  }

  const opened = await openSession(supabase, id, "upload");
  if ("problem" in opened) {
    const recent = await loadRecentSessions(supabase);
    return <Start description={opened.problem!} recent={recent} />;
  }
  const { questions, answers } = opened;

  const { data: recentUploads } = answers.length
    ? await supabase
        .from("uploads")
        .select("id, answer_id, status, failure_reason, created_at")
        .eq("kind", "video")
        .in("status", ["processing", "failed"])
        .in(
          "answer_id",
          answers.map((a) => a.id),
        )
        .order("created_at", { ascending: false })
    : { data: [] };

  const items = questions.map((question): UploadItem => {
    const answer = answers.find((a) => a.session_question_id === question.id);
    const base = { id: question.id, question: question.question_text };
    if (answer?.status === "analyzed") return { ...base, state: "done" };
    if (answer?.status === "skipped") return { ...base, state: "skipped" };
    const latest = answer
      ? ((recentUploads ?? []) as SessionUploadRow[]).find((u) => u.answer_id === answer.id)
      : undefined;
    if (latest?.status === "processing") return { ...base, state: "processing", uploadId: latest.id };
    if (latest?.status === "failed") {
      return {
        ...base,
        state: "waiting",
        problem: failureReasonMessage(parseFailureReason(latest.failure_reason)),
      };
    }
    return { ...base, state: "waiting" };
  });

  return <UploadSession sessionId={opened.sessionId} initial={items} />;
}
