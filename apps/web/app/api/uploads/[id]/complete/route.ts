import { after } from "next/server";
import type { Language } from "@/lib/db/sessions";
import { analyzeAnswer, analyzeVideo, SpeechServiceError } from "@/lib/db/speech";
import {
  AUDIO_BUCKET,
  isUuid,
  parseVisualMetrics,
  SIGNED_AUDIO_LINK_SECONDS,
  SIGNED_VIDEO_LINK_SECONDS,
  VIDEO_BUCKET,
} from "@/lib/db/uploads";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Upload = { id: string; answer_id: string; storage_path: string; status: string; kind: "audio" | "video" };

const CLAIMABLE = ["pending", "uploaded", "failed"];

async function analyseVideoInBackground(
  supabase: Supabase,
  upload: Upload,
  answerId: string,
  videoUrl: string,
  language: Language,
  answerIndex: number,
) {
  const markUpload = (status: string) => supabase.from("uploads").update({ status }).eq("id", upload.id);
  try {
    const result = await analyzeVideo({ videoUrl }, language, answerIndex);
    const visual = parseVisualMetrics(result.visual, answerIndex);
    if (!visual.ok) throw new SpeechServiceError(visual.error, null, false);
    const { error } = await supabase
      .from("answers")
      .update({
        status: "analyzed",
        speech_metrics: result.speech,
        transcript: result.speech.transcript,
        visual_metrics: visual.value,
      })
      .eq("id", answerId);
    await markUpload(error ? "failed" : "processed");
    if (error) await supabase.from("answers").update({ status: "failed" }).eq("id", answerId);
  } catch {
    await markUpload("failed");
    await supabase.from("answers").update({ status: "failed" }).eq("id", answerId);
  } finally {
    const { error } = await supabase.storage.from(VIDEO_BUCKET).remove([upload.storage_path]);
    if (!error) await supabase.from("uploads").update({ deleted_at: new Date().toISOString() }).eq("id", upload.id);
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[id]/complete">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Upload not found." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> | null;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { data: upload } = (await supabase
    .from("uploads")
    .select("id, answer_id, storage_path, status, kind")
    .eq("id", id)
    .maybeSingle()) as { data: Upload | null };
  if (!upload) return Response.json({ error: "Upload not found." }, { status: 404 });
  if (!CLAIMABLE.includes(upload.status)) {
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

  const isVideo = upload.kind === "video";
  const visual = isVideo ? { ok: true as const, value: null } : parseVisualMetrics(body?.visual_metrics, question.position);
  if (!visual.ok) return Response.json({ error: visual.error }, { status: 400 });

  const { data: link } = await supabase.storage
    .from(isVideo ? VIDEO_BUCKET : AUDIO_BUCKET)
    .createSignedUrl(upload.storage_path, isVideo ? SIGNED_VIDEO_LINK_SECONDS : SIGNED_AUDIO_LINK_SECONDS);
  if (!link) {
    return Response.json({ error: `The ${isVideo ? "video" : "audio"} has not been uploaded yet.` }, { status: 409 });
  }

  const { data: claimed } = await supabase
    .from("uploads")
    .update({ status: "processing" })
    .eq("id", upload.id)
    .in("status", CLAIMABLE)
    .select("id")
    .maybeSingle();
  if (!claimed) return Response.json({ error: "This upload is already being analysed or done." }, { status: 409 });

  if (isVideo) {
    after(() =>
      analyseVideoInBackground(supabase, upload, answer.id, link.signedUrl, session.language, question.position),
    );
    return Response.json({ upload_id: upload.id, answer_id: answer.id, status: "processing" }, { status: 202 });
  }

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
