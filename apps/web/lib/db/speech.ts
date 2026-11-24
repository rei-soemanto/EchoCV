import { requireEnv } from "@/lib/supabase/env";
import type { Language } from "@/lib/db/sessions";
import type { VisualMetrics } from "@/lib/db/uploads";

export type SpeechMetrics = {
  answerIndex: number;
  language: Language;
  durationMs: number;
  speechMs: number;
  transcript: string;
  words: { text: string; startMs: number; endMs: number; language: Language }[];
  fillers: { token: string; startMs: number; endMs: number; kind: "vocal" | "lexical" }[];
  pauses: { startMs: number; endMs: number; long: boolean }[];
  speakingRateWps: number;
  syllablesPerSecond: number;
  prosody: { pitchMeanHz: number; pitchStdHz: number; volumeMeanDb: number };
};

export const SPEECH_METRICS_KEYS = [
  "answerIndex",
  "language",
  "durationMs",
  "speechMs",
  "transcript",
  "words",
  "fillers",
  "pauses",
  "speakingRateWps",
  "syllablesPerSecond",
  "prosody",
] as const satisfies readonly (keyof SpeechMetrics)[];

export class SpeechServiceError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SpeechServiceError";
  }
}

export type AnswerAudio = Blob | { audioUrl: string };

export type VideoAnalysis = { speech: SpeechMetrics; visual: VisualMetrics; baseline: "answer_start" };

export type AnalyzeOptions = {
  baseUrl?: string;
  serviceKey?: string;
  timeoutMs?: number;
  attempts?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
};

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

function looksLikeMetrics(body: unknown, language: Language, answerIndex: number): body is SpeechMetrics {
  if (typeof body !== "object" || body === null) return false;
  const metrics = body as Record<string, unknown>;
  return (
    SPEECH_METRICS_KEYS.every((key) => key in metrics) &&
    metrics.language === language &&
    metrics.answerIndex === answerIndex &&
    typeof metrics.transcript === "string" &&
    Array.isArray(metrics.words) &&
    Array.isArray(metrics.fillers) &&
    Array.isArray(metrics.pauses)
  );
}

async function postOnce<T>(
  path: string,
  form: FormData,
  parse: (body: unknown) => T | null,
  baseUrl: string,
  serviceKey: string | undefined,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(new URL(path, baseUrl), {
      method: "POST",
      body: form,
      headers: serviceKey ? { "X-Speech-Key": serviceKey } : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new SpeechServiceError(
      timedOut ? "The speech service did not answer in time." : "The speech service could not be reached.",
      null,
      true,
    );
  }

  if (!response.ok) {
    throw new SpeechServiceError(
      `The speech service answered ${response.status}.`,
      response.status,
      response.status >= 500 || RETRYABLE_STATUSES.has(response.status),
    );
  }
  const parsed = parse(await response.json().catch(() => null));
  if (parsed === null) {
    throw new SpeechServiceError("The speech service sent metrics in an unexpected shape.", response.status, false);
  }
  return parsed;
}

async function postWithRetry<T>(
  path: string,
  form: FormData,
  parse: (body: unknown) => T | null,
  {
    baseUrl = requireEnv("SPEECH_SERVICE_URL", process.env.SPEECH_SERVICE_URL),
    serviceKey = process.env.SPEECH_SERVICE_KEY || undefined,
    timeoutMs = 120_000,
    attempts = 3,
    backoffMs = 1_000,
    fetchImpl = fetch,
  }: AnalyzeOptions,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await postOnce(path, form, parse, baseUrl, serviceKey, timeoutMs, fetchImpl);
    } catch (error) {
      if (!(error instanceof SpeechServiceError) || !error.retryable || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** (attempt - 1)));
    }
  }
}

function answerForm(language: Language, answerIndex: number): FormData {
  const form = new FormData();
  form.append("language", language);
  form.append("answerIndex", String(answerIndex));
  return form;
}

export async function analyzeAnswer(
  audio: AnswerAudio,
  language: Language,
  answerIndex: number,
  options: AnalyzeOptions = {},
): Promise<SpeechMetrics> {
  const form = answerForm(language, answerIndex);
  if (audio instanceof Blob) form.append("audio", audio, "answer");
  else form.append("audioUrl", audio.audioUrl);
  return postWithRetry(
    "/analyze",
    form,
    (body) => (looksLikeMetrics(body, language, answerIndex) ? body : null),
    options,
  );
}

export async function analyzeVideo(
  video: { videoUrl: string },
  language: Language,
  answerIndex: number,
  options: AnalyzeOptions = {},
): Promise<VideoAnalysis> {
  const form = answerForm(language, answerIndex);
  form.append("videoUrl", video.videoUrl);
  return postWithRetry(
    "/analyze-video",
    form,
    (body) => {
      const result = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
      const visual = result.visual as Record<string, unknown> | undefined;
      return looksLikeMetrics(result.speech, language, answerIndex) &&
        typeof visual === "object" &&
        visual !== null &&
        visual.answerIndex === answerIndex &&
        result.baseline === "answer_start"
        ? (result as VideoAnalysis)
        : null;
    },
    { timeoutMs: 900_000, attempts: 2, ...options },
  );
}
