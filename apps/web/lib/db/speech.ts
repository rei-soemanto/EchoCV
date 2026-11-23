import { requireEnv } from "@/lib/supabase/env";
import type { Language } from "@/lib/db/sessions";

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

export type AnalyzeOptions = {
  baseUrl?: string;
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

async function analyzeOnce(
  audio: Blob,
  language: Language,
  answerIndex: number,
  baseUrl: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<SpeechMetrics> {
  const form = new FormData();
  form.append("audio", audio, "answer");
  form.append("language", language);
  form.append("answerIndex", String(answerIndex));

  let response: Response;
  try {
    response = await fetchImpl(new URL("/analyze", baseUrl), {
      method: "POST",
      body: form,
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
  const body: unknown = await response.json().catch(() => null);
  if (!looksLikeMetrics(body, language, answerIndex)) {
    throw new SpeechServiceError("The speech service sent metrics in an unexpected shape.", response.status, false);
  }
  return body;
}

export async function analyzeAnswer(
  audio: Blob,
  language: Language,
  answerIndex: number,
  {
    baseUrl = requireEnv("SPEECH_SERVICE_URL", process.env.SPEECH_SERVICE_URL),
    timeoutMs = 120_000,
    attempts = 3,
    backoffMs = 1_000,
    fetchImpl = fetch,
  }: AnalyzeOptions = {},
): Promise<SpeechMetrics> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await analyzeOnce(audio, language, answerIndex, baseUrl, timeoutMs, fetchImpl);
    } catch (error) {
      if (!(error instanceof SpeechServiceError) || !error.retryable || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** (attempt - 1)));
    }
  }
}
