import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, type FailureReason } from "@/lib/db/uploads";

const TYPES: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

const FAILURE_REASONS: readonly FailureReason[] = [
  "timeout",
  "service_unavailable",
  "unreadable",
  "too_large",
  "server",
];

const DEFAULT_FAILURE_MESSAGE = "Analisis gagal dan tidak dihitung. Unggah video lagi, atau lewati pertanyaan ini.";

const FAILURE_MESSAGES: Record<FailureReason, string> = {
  timeout: "Analisis memakan waktu terlalu lama dan tidak dihitung. Coba unggah video yang lebih singkat, atau lewati pertanyaan ini.",
  service_unavailable:
    "Layanan analisis sedang sibuk atau belum merespons, sehingga jawaban ini tidak dihitung. Coba unggah lagi dalam satu menit.",
  unreadable:
    "Video ini tidak bisa dianalisis dan tidak dihitung. Pastikan suara dan wajah terlihat jelas, simpan ulang sebagai MP4, lalu unggah lagi.",
  too_large:
    "Ukuran video terlalu besar untuk dianalisis dan tidak dihitung. Kirim video yang lebih pendek atau lebih kecil, lalu unggah lagi.",
  server: "Server EchoCV mengalami kendala saat menganalisis video dan jawaban tidak dihitung. Coba unggah lagi sebentar lagi.",
};

export function videoType(file: { type: string; name: string }): string | null {
  const type = file.type.split(";")[0].trim().toLowerCase();
  if (Object.values(TYPES).includes(type)) return type;
  return type ? null : (TYPES[file.name.split(".").pop()!.toLowerCase()] ?? null);
}

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
      video.ondurationchange = () => {
        if (Number.isFinite(video.duration)) done(video.duration);
      };
      video.currentTime = Number.MAX_SAFE_INTEGER;
    };
    video.src = url;
  });
}

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

export type UploadCheck = { status: UploadStatus; failureReason: FailureReason | null };

export type RecentUpload = {
  upload_id: string;
  answer_id: string;
  session_id: string;
  status: string;
  failure_reason: FailureReason | null;
  created_at: string;
};

export type RecentUploadSession = {
  sessionId: string;
  status: "processing" | "failed" | "processed";
  processingCount: number;
  failedCount: number;
  failureReason: FailureReason | null;
  createdAt: string;
};

export function parseFailureReason(value: unknown): FailureReason | null {
  return typeof value === "string" && (FAILURE_REASONS as readonly string[]).includes(value)
    ? (value as FailureReason)
    : null;
}

export function failureReasonMessage(reason: FailureReason | null): string {
  return reason ? FAILURE_MESSAGES[reason] ?? DEFAULT_FAILURE_MESSAGE : DEFAULT_FAILURE_MESSAGE;
}

export async function uploadCheck(uploadId: string, fetcher: typeof fetch = fetch): Promise<UploadCheck | null> {
  const res = await fetcher(`/api/uploads/${uploadId}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    status?: string;
    answer_status?: string;
    failure_reason?: unknown;
  } | null;
  if (!body || typeof body !== "object") return null;
  const status: UploadStatus =
    body.status === "processed" || body.answer_status === "analyzed"
      ? "done"
      : body.status === "failed" || body.status === "deleted"
        ? "failed"
        : body.status === "processing"
          ? "processing"
          : "waiting";
  return { status, failureReason: parseFailureReason(body.failure_reason) };
}

export async function uploadStatus(uploadId: string, fetcher: typeof fetch = fetch): Promise<UploadStatus | null> {
  const check = await uploadCheck(uploadId, fetcher);
  return check?.status ?? null;
}

export async function fetchRecentUploads(fetcher: typeof fetch = fetch): Promise<RecentUpload[]> {
  const res = await fetcher("/api/uploads", { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return [];
  const body = (await res.json().catch(() => null)) as { uploads?: unknown } | null;
  if (!body || !Array.isArray(body.uploads)) return [];
  const result: RecentUpload[] = [];
  for (const item of body.uploads) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.upload_id !== "string" || !raw.upload_id.trim()) continue;
    if (typeof raw.session_id !== "string" || !raw.session_id.trim()) continue;
    result.push({
      upload_id: raw.upload_id,
      answer_id: typeof raw.answer_id === "string" ? raw.answer_id : "",
      session_id: raw.session_id,
      status: typeof raw.status === "string" ? raw.status : "",
      failure_reason: parseFailureReason(raw.failure_reason),
      created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    });
  }
  return result;
}

export function summarizeRecentUploads(uploads: RecentUpload[]): RecentUploadSession[] {
  const ordered = [...uploads].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const groups = new Map<string, RecentUpload[]>();
  for (const upload of ordered) {
    if (!upload.session_id) continue;
    const list = groups.get(upload.session_id);
    if (list) list.push(upload);
    else groups.set(upload.session_id, [upload]);
  }
  const sessions: RecentUploadSession[] = [];
  for (const [sessionId, items] of groups) {
    let processingCount = 0;
    let failedCount = 0;
    const failedItems: RecentUpload[] = [];
    for (const item of items) {
      if (item.status === "processing") processingCount += 1;
      else if (item.status === "failed") {
        failedCount += 1;
        failedItems.push(item);
      }
    }
    const status: RecentUploadSession["status"] =
      processingCount > 0 ? "processing" : failedCount > 0 ? "failed" : "processed";
    const failureReason =
      status === "failed" ? (failedItems.find((item) => item.failure_reason !== null)?.failure_reason ?? null) : null;
    sessions.push({
      sessionId,
      status,
      processingCount,
      failedCount,
      failureReason,
      createdAt: items[0].created_at,
    });
  }
  return sessions;
}

export type SendResult = { ok: true; uploadId: string } | { ok: false; message: string; uploadId?: string };

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

export function apiError(status: number): string {
  if (status === 401) return SEND_ERRORS.signedOut;
  if (status === 400) return SEND_ERRORS.rejected;
  if (status === 404) return SEND_ERRORS.missing;
  if (status === 409) return SEND_ERRORS.closed;
  return SEND_ERRORS.server;
}

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
  const status = await uploadStatus(uploadId, fetcher);
  if (status === "processing" || status === "done") return { ok: true, uploadId };
  if (!res) return { ok: false, message: SEND_ERRORS.offline, uploadId };
  if (res.status === 503) return { ok: false, message: SEND_ERRORS.busy, uploadId };
  if (res.status === 422 || res.status === 400) return { ok: false, message: SEND_ERRORS.unreadable };
  if (res.status >= 500) return { ok: false, message: SEND_ERRORS.server, uploadId };
  return { ok: false, message: apiError(res.status) };
}
