import Link from "next/link";
import { redirect } from "next/navigation";

import { PlaceholderPage } from "@/components/placeholder-page";
import { TopBar } from "@/components/top-bar";
import { buttonVariants } from "@/components/ui/button";
import { openSession } from "@/lib/db/open-session";
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

  const opened = await openSession(await createClient(), id, "live");
  if ("problem" in opened) return <Unavailable description={opened.problem!} />;
  const { questions, answers } = opened;

  // After a reload, carry on from the first question that is not analysed or skipped yet.
  const done = new Set(
    answers.filter((a) => a.status === "analyzed" || a.status === "skipped").map((a) => a.session_question_id),
  );
  const next = questions.findIndex((q) => !done.has(q.id));
  const startAt = next === -1 ? questions.length : next; // all done: the room just finishes

  return <InterviewRoom sessionId={opened.sessionId} questions={questions} startAt={startAt} />;
}
