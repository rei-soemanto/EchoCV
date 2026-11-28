import "server-only";
import { createClient } from "@/lib/supabase/server";

export type SessionQuestion = { id: string; position: number; question_text: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function openSession(supabase: Supabase, id: string, mode: "live" | "upload") {
  const { data: session } = await supabase
    .from("practice_sessions")
    .select("id, mode, status")
    .eq("id", id)
    .maybeSingle();
  if (!session) return { problem: "Sesi ini tidak ditemukan." };
  if (session.mode !== mode) {
    return {
      problem: mode === "live" ? "Sesi ini memakai mode Unggah, bukan Live." : "Sesi ini memakai mode Live, bukan Unggah.",
    };
  }
  if (session.status !== "in_progress") return { problem: "Sesi ini sudah selesai atau dibatalkan." };

  const { data: questions } = await supabase
    .from("session_questions")
    .select("id, position, question_text")
    .eq("session_id", id)
    .order("position");
  if (!questions?.length) return { problem: "Sesi ini belum punya pertanyaan." };

  const { data: answers } = await supabase
    .from("answers")
    .select("id, session_question_id, status")
    .in(
      "session_question_id",
      questions.map((q) => q.id),
    );
  return {
    sessionId: session.id as string,
    questions: questions as SessionQuestion[],
    answers: (answers ?? []) as { id: string; session_question_id: string; status: string }[],
  };
}
