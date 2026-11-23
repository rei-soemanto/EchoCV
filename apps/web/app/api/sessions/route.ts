import { parseSessionRequest, pickQuestions } from "@/lib/db/sessions";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseSessionRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const questions = pickQuestions(parsed.value);
  if (questions.length === 0) {
    return Response.json({ error: "No questions match this role, level and question set." }, { status: 422 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { job_field, role, level, language, question_set, mode } = parsed.value;
  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .insert({ job_field, role, level, language, question_set, mode, user_id: auth.user.id })
    .select("id, job_field, role, level, language, question_set, mode, status, created_at")
    .single();
  if (sessionError || !session) {
    return Response.json({ error: "Could not create the session." }, { status: 500 });
  }

  const { error: questionsError } = await supabase.from("session_questions").insert(
    questions.map((question, position) => ({
      ...question,
      position,
      session_id: session.id,
      user_id: auth.user.id,
    })),
  );
  if (questionsError) {
    await supabase.from("practice_sessions").delete().eq("id", session.id);
    return Response.json({ error: "Could not create the session." }, { status: 500 });
  }

  return Response.json(
    { ...session, questions: questions.map((question, position) => ({ ...question, position })) },
    { status: 201 },
  );
}
