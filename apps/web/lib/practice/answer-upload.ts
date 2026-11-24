import type { VisualMetrics } from "@/lib/vision/answer-tracker";

// Sends one live answer: POST /api/uploads for a signed link, upload the audio straight to
// storage, then POST /api/uploads/[id]/complete with the visual metrics (KAN-36 contract).
// Only audio and numbers leave the browser (BR-04).

export type UploadTicket = { uploadId: string; bucket: string; path: string; token: string };

export type StorageUpload = (
  ticket: UploadTicket,
  audio: Blob,
  contentType: string,
) => Promise<{ error: unknown }>;

export type SubmitResult =
  | { ok: true }
  /**
   * retry with a ticket: call completeUpload(ticket) again. retry without one: call submitAnswer
   * again with the same audio. rerecord: the take is unusable, record the answer again.
   */
  | { ok: false; next: "retry" | "rerecord"; ticket?: UploadTicket; message: string };

const BUSY = "Layanan analisis sedang sibuk. Coba kirim lagi sebentar lagi.";
const UNUSABLE = "Rekaman ini tidak bisa dianalisis. Silakan rekam ulang jawaban Anda.";
const NETWORK = "Jawaban belum terkirim. Periksa koneksi internet, lalu coba lagi.";

async function errorText(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

export async function completeUpload(
  ticket: UploadTicket,
  metrics: VisualMetrics | null,
  fetcher: typeof fetch = fetch,
): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetcher(`/api/uploads/${ticket.uploadId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metrics ? { visual_metrics: metrics } : {}),
    });
  } catch {
    return { ok: false, next: "retry", ticket, message: NETWORK };
  }
  if (res.ok) return { ok: true };
  if (res.status === 503) return { ok: false, next: "retry", ticket, message: BUSY };
  if (res.status === 422) return { ok: false, next: "rerecord", message: UNUSABLE };
  return { ok: false, next: "rerecord", message: await errorText(res, UNUSABLE) };
}

export async function submitAnswer(
  input: { sessionQuestionId: string; audio: Blob; metrics: VisualMetrics | null },
  upload: StorageUpload,
  fetcher: typeof fetch = fetch,
): Promise<SubmitResult> {
  const contentType = input.audio.type || "audio/webm";
  let res: Response;
  try {
    res = await fetcher("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_question_id: input.sessionQuestionId, content_type: contentType }),
    });
  } catch {
    return { ok: false, next: "retry", message: NETWORK };
  }
  if (res.status >= 500) return { ok: false, next: "retry", message: NETWORK };
  if (!res.ok) return { ok: false, next: "rerecord", message: await errorText(res, NETWORK) };
  const body = (await res.json()) as { upload_id: string; bucket: string; path: string; token: string };
  const ticket: UploadTicket = { uploadId: body.upload_id, bucket: body.bucket, path: body.path, token: body.token };

  const { error } = await upload(ticket, input.audio, contentType);
  // Link expired or network dropped: the take is still in memory, so send it again with a new
  // link (the API reuses the same answer until it is analysed).
  if (error) return { ok: false, next: "retry", message: NETWORK };
  return completeUpload(ticket, input.metrics, fetcher);
}
