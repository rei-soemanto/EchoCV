
export type CaptureError = "denied" | "missing" | "busy" | "unsupported" | "error";

export const CAPTURE_ERROR_TEXT: Record<CaptureError, string> = {
  denied:
    "Akses kamera atau mikrofon ditolak. Izinkan lewat ikon gembok di bilah alamat, lalu coba lagi.",
  missing: "Kamera atau mikrofon tidak ditemukan. Sambungkan perangkat, lalu coba lagi.",
  busy: "Kamera atau mikrofon sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu coba lagi.",
  unsupported:
    "Browser ini tidak bisa membuka kamera. Gunakan Chrome, Edge atau Firefox terbaru lewat https.",
  error: "Kamera tidak bisa dibuka. Coba lagi.",
};

export function captureError(err: unknown): CaptureError {
  const name = err instanceof Error || err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  if (name === "TypeError") return "unsupported";
  return "error";
}

export const CAPTURE_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: { echoCancellation: true, noiseSuppression: true },
};

export function micLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += ((s - 128) / 128) ** 2;
  return Math.min(1, Math.sqrt(sum / samples.length) * 5);
}

export function meanLuma(rgba: Uint8ClampedArray): number {
  const n = rgba.length / 4;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return sum / n;
}

export const DARK_LUMA = 70;

export function audioMimeType(
  isSupported: (type: string) => boolean = (t) => MediaRecorder.isTypeSupported(t),
): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(isSupported);
}

export function startAudioRecorder(stream: MediaStream): { stop: () => Promise<Blob> } {
  const mimeType = audioMimeType();
  const recorder = new MediaRecorder(
    new MediaStream(stream.getAudioTracks()),
    mimeType ? { mimeType } : undefined,
  );
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(1000);
  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
        recorder.onerror = () => reject(new Error("Recording failed"));
        recorder.stop();
      }),
  };
}
