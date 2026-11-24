import type { Language } from "@/lib/db/sessions";
import type { SpeechMetrics } from "@/lib/db/speech";
import { AUDIO_BUCKET, isUuid, type VisualMetrics } from "@/lib/db/uploads";
import { DEFAULT_LLM_MODEL, scoreContent, type ContentResult } from "@/lib/llm/gemini";
import { buildReport, type ScoredAnswer } from "@/lib/scoring/report";
import {
  answerMetrics,
  contentScore,
  deliveryScores,
  findBand,
  RUBRIC_VERSION,
  type Band,
  type Scores,
} from "@/lib/scoring/score";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const MIN_WORDS_FOR_CONTENT = 3;

type AnswerRow = {
  id: string;
  session_question_id: string;
  status: string;
  speech_metrics: SpeechMetrics | null;
  visual_metrics: VisualMetrics | null;
  scores: { content?: number; content_feedback?: { strength: string; improvement: string } } | null;
  content_status: string;
};

async function deleteAudioUnlessKept(supabase: Supabase, userId: string, answerIds: string[]) {
  const { data: consents } = await supabase
    .from("consents")
    .select("model_training, hr_rater_sharing")
    .eq("user_id", userId)
    .maybeSingle();
  if (consents?.model_training || consents?.hr_rater_sharing) return;

  const { data: uploads } = await supabase
    .from("uploads")
    .select("id, storage_path")
    .eq("bucket", AUDIO_BUCKET)
    .in("answer_id", answerIds)
    .neq("status", "deleted");
  if (!uploads?.length) return;

  const { error } = await supabase.storage.from(AUDIO_BUCKET).remove(uploads.map((upload) => upload.storage_path));
  if (error) return;
  await supabase
    .from("uploads")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .in(
      "id",
      uploads.map((upload) => upload.id),
    );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const sessionId = body?.session_id;
  if (!isUuid(sessionId)) return Response.json({ error: "session_id must be a uuid." }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { data: session } = await supabase
    .from("practice_sessions")
    .select("id, status, language")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return Response.json({ error: "Session not found." }, { status: 404 });
  if (session.status !== "finished") {
    return Response.json({ error: "Finish the session before building its report." }, { status: 409 });
  }
  const language = session.language as Language;

  const { data: questions } = await supabase
    .from("session_questions")
    .select("id, position, question_text")
    .eq("session_id", sessionId);
  const questionById = new Map((questions ?? []).map((question) => [question.id as string, question]));
  const { data: answerRows } = questionById.size
    ? await supabase
        .from("answers")
        .select("id, session_question_id, status, speech_metrics, visual_metrics, scores, content_status")
        .in("session_question_id", [...questionById.keys()])
    : { data: [] };
  const analyzed = ((answerRows ?? []) as AnswerRow[]).filter((answer) => answer.status === "analyzed");
  if (!analyzed.length) return Response.json({ error: "No analysed answers in this session yet." }, { status: 409 });

  const { data: bandRows } = await supabase.from("scoring_bands").select("*");
  const bands = (bandRows ?? []).map((row) => ({
    ...row,
    ideal_low: Number(row.ideal_low),
    ideal_high: Number(row.ideal_high),
    zero_low: Number(row.zero_low),
    zero_high: Number(row.zero_high),
  })) as Band[];
  if (!bands.length) return Response.json({ error: "The scoring bands are not set up." }, { status: 500 });
  const bandsVersion = [...new Set(bands.map((band) => band.version))].sort().join(",");
  const model = process.env.LLM_MODEL || DEFAULT_LLM_MODEL;
  const modelVersions = { llm: model, scoring_bands: bandsVersion };

  const scored: ScoredAnswer[] = [];
  for (const answer of analyzed.sort(
    (a, b) => questionById.get(a.session_question_id)!.position - questionById.get(b.session_question_id)!.position,
  )) {
    const question = questionById.get(answer.session_question_id)!;
    const metrics = answerMetrics(answer.speech_metrics, answer.visual_metrics, language);
    const scores: Scores = deliveryScores(metrics, bands, language);
    let content = answer.content_status === "scored" ? (answer.scores?.content_feedback ?? null) : null;
    let contentStatus = answer.content_status;

    if (answer.content_status === "scored" && answer.scores?.content !== undefined) {
      scores.content = answer.scores.content;
    } else {
      const transcript = answer.speech_metrics?.transcript?.trim() ?? "";
      const wordCount = answer.speech_metrics?.words.length ?? 0;
      let result: ContentResult | null = null;
      if (wordCount < MIN_WORDS_FOR_CONTENT) {
        result = { star: 0, relevance: 0, clarity: 0, strength: "", improvement: "" };
      } else {
        result = await scoreContent(question.question_text, transcript, language).catch(() => null);
      }
      if (result) {
        scores.content = contentScore(result, metrics, bands, language);
        content = result.strength ? { strength: result.strength, improvement: result.improvement } : null;
        contentStatus = "scored";
      } else {
        contentStatus = "pending";
      }
    }

    await supabase
      .from("answers")
      .update({
        scores: { ...scores, content_feedback: content },
        content_status: contentStatus,
        rubric_version: RUBRIC_VERSION,
        model_versions: modelVersions,
      })
      .eq("id", answer.id);
    scored.push({
      answerIndex: question.position as number,
      scores,
      speech: answer.speech_metrics,
      visual: answer.visual_metrics,
      content,
    });
  }

  const eyeContactBand = findBand(bands, "eye_contact", language);
  const report = buildReport(sessionId, scored, language, eyeContactBand?.ideal_low ?? null);
  if (!report) return Response.json({ error: "Not enough data to score this session." }, { status: 422 });

  const { error: saveError } = await supabase.from("reports").upsert(
    {
      session_id: sessionId,
      user_id: auth.user.id,
      overall_score: report.overallScore,
      report,
      rubric_version: RUBRIC_VERSION,
      model_versions: modelVersions,
    },
    { onConflict: "session_id" },
  );
  if (saveError) return Response.json({ error: "Could not save the report." }, { status: 500 });

  await deleteAudioUnlessKept(
    supabase,
    auth.user.id,
    analyzed.map((answer) => answer.id),
  );

  return Response.json(report, { status: 201 });
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!isUuid(sessionId)) return Response.json({ error: "session_id must be a uuid." }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { data: saved } = await supabase
    .from("reports")
    .select("report, rubric_version, model_versions, updated_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!saved) return Response.json({ error: "No report for this session yet." }, { status: 404 });

  const { data: questions } = await supabase
    .from("session_questions")
    .select("id, position, question_text")
    .eq("session_id", sessionId);
  const { data: answers } = questions?.length
    ? await supabase
        .from("answers")
        .select("session_question_id, status, transcript, speech_metrics, visual_metrics, scores, content_status")
        .in(
          "session_question_id",
          questions.map((question) => question.id),
        )
    : { data: [] };

  return Response.json({
    ...saved.report,
    rubricVersion: saved.rubric_version,
    modelVersions: saved.model_versions,
    answers: (questions ?? [])
      .sort((a, b) => a.position - b.position)
      .map((question) => {
        const answer = answers?.find((row) => row.session_question_id === question.id);
        return {
          answerIndex: question.position,
          question: question.question_text,
          status: answer?.status ?? "skipped",
          transcript: answer?.transcript ?? null,
          speechMetrics: answer?.speech_metrics ?? null,
          visualMetrics: answer?.visual_metrics ?? null,
          scores: answer?.scores ?? null,
          contentStatus: answer?.content_status ?? null,
        };
      }),
  });
}
