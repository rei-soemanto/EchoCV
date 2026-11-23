import { analyzeAnswer, SpeechServiceError } from "@/lib/db/speech";
import { AUDIO_BUCKET, isUuid, parseVisualMetrics, SIGNED_AUDIO_LINK_SECONDS } from "@/lib/db/uploads";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[id]/complete">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Upload not found." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> | null;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { data: upload } = await supabase
    .from("uploads")
    .select("id, answer_id, storage_path, status")
    .eq("id", id)
    .maybeSingle();
  if (!upload) return Response.json({ error: "Upload not found." }, { status: 404 });
  if (!["pending", "uploaded", "failed"].includes(upload.status)) {
    return Response.json({ error: "This upload is already being analysed or done." }, { status: 409 });
  }

  const { data: answer } = await supabase
    .from("answers")
    .select("id, session_question_id")
    .eq("id", upload.answer_id)
    .maybeSingle();
  const { data: question } = answer
    ? await supabase.from("session_questions").select("position, session_id").eq("id", answer.session_question_id).maybeSingle()
    : { data: null };
  const { data: session } = question
    ? await supabase.from("practice_sessions").select("language, status").eq("id", question.session_id).maybeSingle()
    : { data: null };
  if (!answer || !question || !session) return Response.json({ error: "Upload not found." }, { status: 404 });
  if (session.status !== "in_progress") {
    return Response.json({ error: "The session is not in progress." }, { status: 409 });
  }

  const visual = parseVisualMetrics(body?.visual_metrics, question.position);
  if (!visual.ok) return Response.json({ error: visual.error }, { status: 400 });

  const { data: link } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(upload.storage_path, SIGNED_AUDIO_LINK_SECONDS);
  if (!link) return Response.json({ error: "The audio has not been uploaded yet." }, { status: 409 });

  const { data: claimed } = await supabase
    .from("uploads")
    .update({ status: "processing" })
    .eq("id", upload.id)
    .in("status", ["pending", "uploaded", "failed"])
    .select("id")
    .maybeSingle();
  if (!claimed) return Response.json({ error: "This upload is already being analysed or done." }, { status: 409 });
  const markUpload = (status: string) => supabase.from("uploads").update({ status }).eq("id", upload.id);

  try {
    const metrics = await analyzeAnswer({ audioUrl: link.signedUrl }, session.language, question.position);
    const { error } = await supabase
      .from("answers")
      .update({
        status: "analyzed",
        speech_metrics: metrics,
        transcript: metrics.transcript,
        ...(visual.value ? { visual_metrics: visual.value } : {}),
      })
      .eq("id", answer.id);
    if (error) {
      await markUpload("uploaded");
      return Response.json({ error: "Could not save the analysis." }, { status: 500 });
    }
    await markUpload("processed");
    return Response.json({ answer_id: answer.id, speech_metrics: metrics });
  } catch (error) {
    const retryable = !(error instanceof SpeechServiceError) || error.retryable;
    await markUpload(retryable ? "uploaded" : "failed");
    if (!retryable) await supabase.from("answers").update({ status: "failed" }).eq("id", answer.id);
    return Response.json(
      {
        error: retryable
          ? "The speech service is busy. Try again in a moment."
          : "The recording could not be analysed. Record the answer again.",
        retryable,
      },
      { status: retryable ? 503 : 422 },
    );
  }
}
