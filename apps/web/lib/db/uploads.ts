import speech from "@echocv/shared/speech.json";

export const AUDIO_BUCKET = "answer-audio";
export const VIDEO_BUCKET = "answer-videos";
export const SIGNED_AUDIO_LINK_SECONDS = 600;
export const SIGNED_VIDEO_LINK_SECONDS = 1800;
export const MAX_VIDEO_BYTES = speech.video.maxMb * 1024 * 1024;
export const MAX_VIDEO_SECONDS = speech.video.maxSeconds;

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

const VIDEO_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BEHAVIOURS = ["touching_face", "arms_crossed", "reading_notes", "slouching"];

export type VisualMetrics = {
  answerIndex: number;
  durationMs: number;
  eyeContactPct: number;
  smilePct: number;
  events: { type: string; startMs: number; endMs: number }[];
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export type UploadRequest = {
  sessionQuestionId: string;
  contentType: string;
  extension: string;
  kind: "audio" | "video";
};

export function parseUploadRequest(body: unknown): Result<UploadRequest> {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (!isUuid(input.session_question_id)) return { ok: false, error: "session_question_id must be a uuid." };
  const contentType = typeof input.content_type === "string" ? input.content_type.split(";")[0].trim().toLowerCase() : "";
  const audioExtension = AUDIO_EXTENSIONS[contentType];
  const videoExtension = VIDEO_EXTENSIONS[contentType];
  if (!audioExtension && !videoExtension) {
    const allowed = [...Object.keys(AUDIO_EXTENSIONS), ...Object.keys(VIDEO_EXTENSIONS)];
    return { ok: false, error: `content_type must be one of: ${allowed.join(", ")}.` };
  }
  if (videoExtension) {
    const size = input.size_bytes;
    const seconds = input.duration_seconds;
    if (!Number.isInteger(size) || (size as number) <= 0) return { ok: false, error: "size_bytes must be a positive whole number." };
    if ((size as number) > MAX_VIDEO_BYTES) {
      return { ok: false, error: `The video is larger than ${speech.video.maxMb} MB.` };
    }
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
      return { ok: false, error: "duration_seconds must be a positive number." };
    }
    if (seconds > MAX_VIDEO_SECONDS) {
      return { ok: false, error: `The video is longer than ${MAX_VIDEO_SECONDS / 60} minutes.` };
    }
  }
  return {
    ok: true,
    value: {
      sessionQuestionId: input.session_question_id,
      contentType,
      extension: audioExtension ?? videoExtension,
      kind: audioExtension ? "audio" : "video",
    },
  };
}

const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const isPercent = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

export function parseVisualMetrics(value: unknown, answerIndex: number): Result<VisualMetrics | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  const invalid = { ok: false as const, error: "visual_metrics does not match the visual metrics schema." };
  if (typeof value !== "object" || Array.isArray(value)) return invalid;
  const metrics = value as Record<string, unknown>;
  const allowed = ["answerIndex", "durationMs", "eyeContactPct", "smilePct", "events"];
  if (Object.keys(metrics).some((key) => !allowed.includes(key))) return invalid;
  if (metrics.answerIndex !== answerIndex) {
    return { ok: false, error: "visual_metrics.answerIndex does not match this question." };
  }
  if (!isCount(metrics.durationMs) || !isPercent(metrics.eyeContactPct) || !isPercent(metrics.smilePct)) return invalid;
  if (!Array.isArray(metrics.events)) return invalid;
  for (const event of metrics.events as unknown[]) {
    const e = (typeof event === "object" && event !== null ? event : {}) as Record<string, unknown>;
    const keysOk = Object.keys(e).every((key) => ["type", "startMs", "endMs"].includes(key));
    if (!keysOk || !BEHAVIOURS.includes(e.type as string) || !isCount(e.startMs) || !isCount(e.endMs)) return invalid;
    if ((e.endMs as number) < (e.startMs as number)) return invalid;
  }
  return { ok: true, value: metrics as VisualMetrics };
}

export type FailureReason = "timeout" | "service_unavailable" | "unreadable" | "too_large" | "server";

export const VIDEO_ANALYSIS_BUDGET_MS = 270_000;
export const STALE_PROCESSING_MS = 360_000;

type ServiceFailure = { status: number | null; retryable: boolean; message: string };

function isServiceFailure(error: unknown): error is ServiceFailure {
  return error instanceof Error && "status" in error && "retryable" in error;
}

export function failureReason(error: unknown): FailureReason {
  if (!isServiceFailure(error)) return "server";
  if (error.status === null) {
    if (!error.retryable) return "server";
    return error.message.includes("in time") ? "timeout" : "service_unavailable";
  }
  if (error.status === 413) return "too_large";
  if (error.status === 400 || error.status === 422) return "unreadable";
  if (error.retryable) return "service_unavailable";
  return "server";
}

export function isStaleProcessing(status: string, updatedAt: string, now: Date): boolean {
  return status === "processing" && now.getTime() - new Date(updatedAt).getTime() > STALE_PROCESSING_MS;
}
