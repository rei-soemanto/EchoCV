import Link from "next/link";
import { redirect } from "next/navigation";

import { PlaceholderPage } from "@/components/placeholder-page";
import { TopBar } from "@/components/top-bar";
import { buttonVariants } from "@/components/ui/button";
import { isUuid } from "@/lib/db/uploads";
import { createClient } from "@/lib/supabase/server";

import { InterviewRoom } from "./interview-room";

export const metadata = { title: "Ruang wawancara · EchoCV" };

function Unavailable({ description }: { description: string }) {
  return (
    <>
      <TopBar note="Ruang wawancara" />
      <main className="px-4 pt-8 pb-16 md:px-12 md:pt-12">
        <PlaceholderPage title="Sesi tidak bisa dibuka" description={description}>
          <Link href="/practice" className={buttonVariants({ className: "w-fit" })}>
            Atur sesi baru
          </Link>
        </PlaceholderPage>
      </main>
    </>
  );
}

export default async function InterviewRoomPage(props: PageProps<"/practice/room">) {
  const { session: id } = await props.searchParams;
  if (!isUuid(id)) redirect("/practice");

  // Row-level security limits every read to the signed-in user's own rows.
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("practice_sessions")
    .select("id, language, mode, status")
    .eq("id", id)
    .maybeSingle();
  if (!session) return <Unavailable description="Sesi ini tidak ditemukan." />;
  if (session.mode !== "live") return <Unavailable description="Sesi ini memakai mode Unggah, bukan Live." />;
  if (session.status !== "in_progress") {
    return <Unavailable description="Sesi ini sudah selesai atau dibatalkan." />;
  }

  const { data: questions } = await supabase
    .from("session_questions")
    .select("id, position, question_text")
    .eq("session_id", id)
    .order("position");
  if (!questions?.length) return <Unavailable description="Sesi ini belum punya pertanyaan." />;

  // After a reload, carry on from the first question that is not analysed or skipped yet.
  const { data: answers } = await supabase
    .from("answers")
    .select("session_question_id, status")
    .in(
      "session_question_id",
      questions.map((q) => q.id),
    );
  const done = new Set(
    (answers ?? []).filter((a) => a.status === "analyzed" || a.status === "skipped").map((a) => a.session_question_id),
  );
  const next = questions.findIndex((q) => !done.has(q.id));
  const startAt = next === -1 ? questions.length : next; // all done: the room just finishes

  return <InterviewRoom sessionId={session.id} questions={questions} startAt={startAt} />;
}
