import Link from "next/link";

import { PlaceholderPage } from "@/components/placeholder-page";
import { buttonVariants } from "@/components/ui/button";
import { openSession } from "@/lib/db/open-session";
import { isUuid } from "@/lib/db/uploads";
import { createClient } from "@/lib/supabase/server";

import { UploadSession, type UploadItem } from "./upload-session";

export const metadata = { title: "Unggah rekaman · EchoCV" };

function Start({ description }: { description: string }) {
  return (
    <PlaceholderPage title="Unggah rekaman" description={description}>
      <Link href="/practice" className={buttonVariants({ className: "w-fit" })}>
        Atur sesi baru
      </Link>
    </PlaceholderPage>
  );
}

export default async function UploadPage(props: PageProps<"/upload">) {
  const { session: id } = await props.searchParams;
  if (!isUuid(id)) {
    return <Start description="Atur sesi dengan mode Unggah dulu, lalu unggah satu video jawaban untuk setiap pertanyaan." />;
  }

  const supabase = await createClient();
  const opened = await openSession(supabase, id, "upload");
  if ("problem" in opened) return <Start description={opened.problem!} />;
  const { questions, answers } = opened;

  // Videos still being analysed, so a reload goes back to following them.
  const { data: running } = answers.length
    ? await supabase
        .from("uploads")
        .select("id, answer_id")
        .eq("status", "processing")
        .in(
          "answer_id",
          answers.map((a) => a.id),
        )
    : { data: [] };

  const items = questions.map((question): UploadItem => {
    const answer = answers.find((a) => a.session_question_id === question.id);
    const base = { id: question.id, question: question.question_text };
    if (answer?.status === "analyzed") return { ...base, state: "done" };
    if (answer?.status === "skipped") return { ...base, state: "skipped" };
    const upload = running?.find((u) => u.answer_id === answer?.id);
    return upload ? { ...base, state: "processing", uploadId: upload.id } : { ...base, state: "waiting" };
  });

  return <UploadSession sessionId={opened.sessionId} initial={items} />;
}
