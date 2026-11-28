import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from "@/lib/db/uploads";

// Upload mode (KAN-49) on the KAN-47 API: POST /api/uploads for a signed link, PUT the video straight
// to storage, POST /api/uploads/[id]/complete, then poll GET /api/uploads/[id].

const TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

/** The video type the API accepts, from the file's type or, when the browser gives none, its name. */
export function videoType(file: { type: string; name: string }): string | null {
  const type = file.type.split(";")[0].trim().toLowerCase();
  if (Object.values(TYPES).includes(type)) return type;
  return type ? null : (TYPES[file.name.split(".").pop()!.toLowerCase()] ?? null);
}

/** Words for a file that cannot be analysed, or null when it can. */
export function videoProblem(file: { type: string; name: string; size: number }): string | null {
  if (!videoType(file)) return "Berkas ini bukan MP4, MOV atau WEBM.";
  if (file.size === 0) return "Berkas ini kosong.";
  if (file.size > MAX_VIDEO_BYTES) return `Video lebih besar dari ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`;
  return null;
}

export function durationProblem(seconds: number | null): string | null {
  if (seconds === null || !(seconds > 0)) return "Video ini tidak bisa dibaca. Coba simpan ulang sebagai MP4.";
  if (seconds > MAX_VIDEO_SECONDS) return `Video lebih panjang dari ${MAX_VIDEO_SECONDS / 60} menit.`;
  return null;
}

export function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    video.preload = "metadata";
    video.onerror = () => done(null);
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) return done(video.duration);
      // Browser recordings (WebM) carry no length: seeking past the end makes the browser find it.
      video.ondurationchange = () => {
        if (Number.isFinite(video.duration)) done(video.duration);
      };
      video.currentTime = Number.MAX_SAFE_INTEGER;
    };
    video.src = url;
  });
}

/**
 * Puts the file at a signed link and resolves with the HTTP status, 0 when the connection failed.
 * XMLHttpRequest, because fetch cannot report upload progress.
 */
export function putFile(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<number> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(0);
    const xhr = new XMLHttpRequest();
    signal.addEventListener("abort", () => xhr.abort());
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = xhr.onabort = () => resolve(0);
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.send(file);
  });
}

export type UploadStatus = "waiting" | "processing" | "done" | "failed";

/** null when the status could not be read; ask again later. */
export async function uploadStatus(uploadId: string, fetcher: typeof fetch = fetch): Promise<UploadStatus | null> {
  const res = await fetcher(`/api/uploads/${uploadId}`).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as { status: string; answer_status: string } | null;
  if (!body) return null;
  // The answer keeps "failed" from an earlier video until a new one is analysed, so only this
  // upload's own status can say that it failed.
  if (body.status === "processed" || body.answer_status === "analyzed") return "done";
  if (body.status === "failed" || body.status === "deleted") return "failed";
  return body.status === "processing" ? "processing" : "waiting";
}

/** uploadId on a failure: the video is already stored, so pass it back in to skip the upload. */
export type SendResult = { ok: true; uploadId: string } | { ok: false; message: string; uploadId?: string };

// A specific message for each way sending can fail (mid-MVP check).
export const SEND_ERRORS = {
  offline: "Koneksi terputus, jadi video belum terkirim. Periksa internet, lalu coba lagi.",
  server: "Server EchoCV sedang bermasalah. Coba lagi beberapa menit lagi.",
  signedOut: "Sesi masuk Anda berakhir. Masuk lagi, lalu buka halaman ini kembali.",
  rejected: `Server menolak video ini: formatnya harus MP4, MOV atau WEBM, maksimal ${MAX_VIDEO_BYTES / 1024 / 1024} MB dan ${MAX_VIDEO_SECONDS / 60} menit.`,
  closed: "Sesi ini sudah selesai, atau pertanyaan ini sudah dianalisis. Muat ulang halaman untuk melihat statusnya.",
  missing: "Pertanyaan ini tidak ditemukan. Muat ulang halaman.",
  storageFull: "Penyimpanan menolak video karena terlalu besar. Kompres video, lalu coba lagi.",
  linkExpired: "Tautan unggah sudah kedaluwarsa. Coba lagi untuk meminta tautan baru.",
  storage: "Video tidak bisa disimpan. Coba lagi sebentar lagi.",
  busy: "Layanan analisis sedang sibuk. Video Anda sudah tersimpan; coba mulai analisis lagi sebentar lagi.",
  unreadable: "Video ini tidak bisa dianalisis. Pastikan suara dan wajah terlihat, simpan ulang sebagai MP4, lalu unggah lagi.",
} as const;

/** Words for a refused request to the uploads API. */
export function apiError(status: number): string {
  if (status === 401) return SEND_ERRORS.signedOut;
  if (status === 400) return SEND_ERRORS.rejected;
  if (status === 404) return SEND_ERRORS.missing;
  if (status === 409) return SEND_ERRORS.closed;
  return SEND_ERRORS.server;
}

/** Words for a failed upload to storage (0: no connection). */
export function storageError(status: number): string {
  if (status === 0) return SEND_ERRORS.offline;
  if (status === 413) return SEND_ERRORS.storageFull;
  if (status === 400 || status === 401 || status === 403) return SEND_ERRORS.linkExpired;
  return SEND_ERRORS.storage;
}

export async function sendVideo(
  input: { sessionQuestionId: string; contentType: string; sizeBytes: number; seconds: number; uploadId?: string },
  put: (signedUrl: string) => Promise<number>,
  fetcher: typeof fetch = fetch,
): Promise<SendResult> {
  let uploadId = input.uploadId;
  if (!uploadId) {
    const res = await fetcher("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_question_id: input.sessionQuestionId,
        content_type: input.contentType,
        size_bytes: input.sizeBytes,
        duration_seconds: input.seconds,
      }),
    }).catch(() => null);
    if (!res) return { ok: false, message: SEND_ERRORS.offline };
    if (!res.ok) return { ok: false, message: apiError(res.status) };
    const ticket = (await res.json()) as { upload_id: string; signed_url: string };
    const stored = await put(ticket.signed_url);
    if (stored < 200 || stored >= 300) return { ok: false, message: storageError(stored) };
    uploadId = ticket.upload_id;
  }

  const res = await fetcher(`/api/uploads/${uploadId}/complete`, { method: "POST" }).catch(() => null);
  if (res?.ok) return { ok: true, uploadId };
  // The reply may have been lost after the server started, so look before calling it a failure.
  const status = await uploadStatus(uploadId, fetcher);
  if (status === "processing" || status === "done") return { ok: true, uploadId };
  if (!res) return { ok: false, message: SEND_ERRORS.offline, uploadId };
  if (res.status === 503) return { ok: false, message: SEND_ERRORS.busy, uploadId };
  if (res.status === 422 || res.status === 400) return { ok: false, message: SEND_ERRORS.unreadable };
  if (res.status >= 500) return { ok: false, message: SEND_ERRORS.server, uploadId };
  return { ok: false, message: apiError(res.status) };
}
