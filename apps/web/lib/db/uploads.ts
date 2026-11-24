export const AUDIO_BUCKET = "answer-audio";
export const SIGNED_AUDIO_LINK_SECONDS = 600;

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
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

export function parseUploadRequest(body: unknown): Result<{ sessionQuestionId: string; contentType: string; extension: string }> {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (!isUuid(input.session_question_id)) return { ok: false, error: "session_question_id must be a uuid." };
  const contentType = typeof input.content_type === "string" ? input.content_type.split(";")[0].trim().toLowerCase() : "";
  const extension = AUDIO_EXTENSIONS[contentType];
  if (!extension) {
    return { ok: false, error: `content_type must be one of: ${Object.keys(AUDIO_EXTENSIONS).join(", ")}.` };
  }
  return { ok: true, value: { sessionQuestionId: input.session_question_id, contentType, extension } };
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
