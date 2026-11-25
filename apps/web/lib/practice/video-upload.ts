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

/** Puts the file at a signed link. XMLHttpRequest, because fetch cannot report upload progress. */
export function putFile(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const xhr = new XMLHttpRequest();
    signal.addEventListener("abort", () => xhr.abort());
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = xhr.onabort = () => resolve(false);
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

const NETWORK = "Video belum terkirim. Periksa koneksi internet, lalu coba lagi.";
const REFUSED = "Video ini tidak bisa diterima. Muat ulang halaman untuk melihat status terbaru.";

export async function sendVideo(
  input: { sessionQuestionId: string; contentType: string; sizeBytes: number; seconds: number; uploadId?: string },
  put: (signedUrl: string) => Promise<boolean>,
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
    if (!res || res.status >= 500) return { ok: false, message: NETWORK };
    if (!res.ok) return { ok: false, message: REFUSED };
    const ticket = (await res.json()) as { upload_id: string; signed_url: string };
    if (!(await put(ticket.signed_url))) return { ok: false, message: NETWORK };
    uploadId = ticket.upload_id;
  }

  const res = await fetcher(`/api/uploads/${uploadId}/complete`, { method: "POST" }).catch(() => null);
  if (res?.ok) return { ok: true, uploadId };
  // The reply may have been lost after the server started, so look before calling it a failure.
  const status = await uploadStatus(uploadId, fetcher);
  if (status === "processing" || status === "done") return { ok: true, uploadId };
  if (res && res.status < 500) return { ok: false, message: REFUSED };
  return { ok: false, message: NETWORK, uploadId };
}
