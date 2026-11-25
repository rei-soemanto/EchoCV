"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConsentRow } from "@/components/ui/consent-row";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from "@/lib/db/uploads";
import { finishSession } from "@/lib/practice/finish-session";
import { timecode } from "@/lib/report/view";
import {
  durationProblem,
  putFile,
  readDuration,
  sendVideo,
  uploadStatus,
  videoProblem,
  videoType,
} from "@/lib/practice/video-upload";
import { createClient } from "@/lib/supabase/client";

// Figma 08 Unggah dan proses, 08b Proses analisis. The design has one file per session; the API
// takes one video per question (UC-05), so the status column lists the questions.

export type UploadItem = {
  id: string;
  question: string;
  state: "waiting" | "sending" | "processing" | "done" | "skipped";
  uploadId?: string;
  problem?: string;
};

const POLL_MS = 4000;
// Videos are analysed one at a time, at about playing speed. Past this, let the user try again.
const STUCK_MS = 4 * MAX_VIDEO_SECONDS * 1000;

const STATES: Record<UploadItem["state"], { tone: BadgeTone; label: string }> = {
  waiting: { tone: "neutral", label: "Menunggu" },
  sending: { tone: "accent", label: "Mengunggah" },
  processing: { tone: "accent", label: "Dianalisis" },
  done: { tone: "success", label: "Selesai" },
  skipped: { tone: "neutral", label: "Dilewati" },
};

type Picked = { itemId: string; file: File; seconds: number; contentType: string };

export function UploadSession({ sessionId, initial }: { sessionId: string; initial: UploadItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [own, setOwn] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [finish, setFinish] = useState({ failed: false, attempt: 0 });
  const sending = useRef<AbortController | null>(null);
  /** The latest pick, so a slow read of an earlier file cannot replace it. */
  const pick = useRef(0);

  // Stay on the question being worked on: an earlier one can fail and go back to waiting meanwhile.
  const current =
    items.find((item) => item.state === "sending") ??
    items.find((item) => item.state === "waiting" && item.id === picked?.itemId) ??
    items.find((item) => item.state === "waiting") ??
    null;
  const processing = items.filter((item) => item.state === "processing");
  const processingIds = processing.map((item) => item.uploadId).join(",");
  const settled = items.every((item) => item.state === "done" || item.state === "skipped");

  const change = (id: string, changes: Partial<UploadItem>) =>
    setItems((all) => all.map((item) => (item.id === id ? { ...item, ...changes } : item)));

  useEffect(() => {
    if (!processingIds) return;
    const started = Date.now();
    let live = true;
    let asking = false;
    const timer = setInterval(async () => {
      if (asking) return;
      asking = true;
      for (const uploadId of processingIds.split(",")) {
        const status = await uploadStatus(uploadId);
        if (!live) return;
        const problem =
          status === "failed"
            ? "Analisis gagal dan tidak dihitung. Unggah video lagi, atau lewati pertanyaan ini."
            : Date.now() - started > STUCK_MS
              ? "Analisis memakan waktu terlalu lama. Unggah video lagi, atau lewati pertanyaan ini."
              : null;
        const changes: Partial<UploadItem> | null =
          status === "done"
            ? { state: "done", problem: undefined }
            : problem
              ? { state: "waiting", uploadId: undefined, problem }
              : null;
        if (changes) setItems((all) => all.map((item) => (item.uploadId === uploadId ? { ...item, ...changes } : item)));
      }
      asking = false;
    }, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [processingIds]);

  useEffect(() => {
    if (!settled) return;
    let live = true;
    finishSession(sessionId).then((ok) => {
      if (!live) return;
      if (ok) router.push(`/report/${sessionId}`);
      else setFinish((f) => ({ ...f, failed: true }));
    });
    return () => {
      live = false;
    };
  }, [settled, sessionId, router, finish.attempt]);

  // Leaving during the upload itself would lose it; once it is stored, leaving is fine.
  const uploading = current?.state === "sending";
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);
  useEffect(() => () => sending.current?.abort(), []);

  async function choose(file: File | undefined) {
    if (!file || !current) return;
    const mine = ++pick.current;
    setPicked(null);
    change(current.id, { uploadId: undefined, problem: undefined });
    const problem = videoProblem(file);
    setMessage(problem);
    if (problem) return;
    setReading(true);
    const seconds = await readDuration(file);
    if (mine !== pick.current) return;
    setReading(false);
    const tooLong = durationProblem(seconds);
    setMessage(tooLong);
    if (!tooLong) setPicked({ itemId: current.id, file, seconds: seconds!, contentType: videoType(file)! });
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!current || uploading) return;
    if (picked?.itemId !== current.id) return setMessage("Pilih video dulu.");
    if (!allowed || !own) return setMessage("Setujui kedua pernyataan dulu untuk memulai analisis.");
    setMessage(null);
    setProgress(0);
    change(current.id, { state: "sending", problem: undefined });
    const controller = new AbortController();
    sending.current = controller;
    const { file, seconds, contentType } = picked;
    const result = await sendVideo(
      { sessionQuestionId: current.id, contentType, sizeBytes: file.size, seconds, uploadId: current.uploadId },
      (url) => putFile(url, file, contentType, setProgress, controller.signal),
    );
    sending.current = null;
    if (result.ok) {
      change(current.id, { state: "processing", uploadId: result.uploadId });
      setPicked(null);
      setAllowed(false); // asked again for every file
      setOwn(false);
      return;
    }
    change(current.id, { state: "waiting", uploadId: result.uploadId });
    setMessage(controller.signal.aborted ? "Unggahan dibatalkan." : result.message);
  }

  async function skip() {
    if (!current) return;
    setSkipping(true);
    const { error } = await createClient()
      .from("answers")
      .upsert({ session_question_id: current.id, status: "skipped" }, { onConflict: "session_question_id" });
    setSkipping(false);
    if (error) return setMessage("Pertanyaan belum bisa dilewati. Periksa koneksi internet, lalu coba lagi.");
    pick.current++;
    setReading(false);
    setPicked(null);
    setMessage(null);
    change(current.id, { state: "skipped", problem: undefined });
  }

  const percent = Math.round(progress * 100);
  const doneCount = items.filter((item) => item.state === "done" || item.state === "skipped").length;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-h1">{current ? "Unggah rekaman" : "Analisis latihan"}</h1>
      <div className="flex flex-col gap-16 lg:flex-row">
        {current ? (
          <form onSubmit={send} className="flex min-w-0 flex-1 flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-label text-ink-secondary">
                Pertanyaan {items.indexOf(current) + 1} dari {items.length}
              </p>
              <h2 className="text-h2">{current.question}</h2>
            </div>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!uploading) choose(event.dataTransfer.files[0]);
              }}
              className={`flex flex-col items-center gap-3 border border-dashed border-border-strong px-4 py-12 text-center md:px-8 md:py-16 ${dragging ? "bg-surface-accent-subtle" : ""}`}
            >
              <Image src="/icons/upload.svg" alt="" width={32} height={32} />
              <p className="text-h3 break-words">
                {picked ? picked.file.name : reading ? "Membaca video…" : "Tarik berkas ke sini, atau pilih dari perangkat"}
              </p>
              <p className="text-body-sm text-ink-secondary">
                {picked
                  ? `${Math.max(1, Math.round(picked.file.size / 1024 / 1024))} MB, ${timecode(picked.seconds * 1000)}`
                  : `MP4, MOV, WEBM. Maksimal ${MAX_VIDEO_BYTES / 1024 / 1024} MB dan ${MAX_VIDEO_SECONDS / 60} menit.`}
              </p>
              <label
                className={buttonVariants({
                  variant: "outline",
                  className: `focus-within:ring-3 focus-within:ring-ring/50 ${uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`,
                })}
              >
                {picked ? "Ganti berkas" : "Pilih berkas"}
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                  disabled={uploading}
                  onChange={(event) => {
                    choose(event.target.files?.[0]);
                    event.target.value = ""; // so picking the same file again still counts
                  }}
                  className="sr-only"
                />
              </label>
            </div>
            <ConsentRow
              title="Izinkan analisis berkas ini"
              description="Video dikirim ke server untuk dianalisis, lalu langsung dihapus."
              checked={allowed}
              onChange={setAllowed}
            />
            <label className="text-body-sm flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={own}
                onChange={(event) => setOwn(event.target.checked)}
                className="size-[22px] accent-surface-accent"
              />
              Ini suara dan wajah saya sendiri.
            </label>
            {(message || current.problem) && (
              <p role="alert" className="text-body-sm text-ink-danger">
                {message ?? current.problem}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" disabled={uploading || reading || skipping} className={buttonVariants()}>
                <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
                {uploading ? "Mengunggah…" : current.uploadId ? "Coba kirim lagi" : "Mulai analisis"}
              </button>
              {uploading ? (
                <button
                  type="button"
                  onClick={() => sending.current?.abort()}
                  className={buttonVariants({ variant: "link", size: "text" })}
                >
                  Batalkan unggahan
                </button>
              ) : (
                <button
                  type="button"
                  disabled={skipping}
                  onClick={skip}
                  className={buttonVariants({ variant: "link", size: "text" })}
                >
                  Lewati pertanyaan
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <h2 className="text-h2">{settled ? "Menyusun laporan Anda" : "Sedang menganalisis latihan Anda"}</h2>
            <p className="text-body text-ink-secondary">
              Kami menyusun transkrip, tempo bicara, kata pengisi dan bahasa tubuh. Halaman ini berpindah sendiri ke laporan
              saat selesai.
            </p>
            {finish.failed && (
              <div role="alert" className="flex flex-col gap-4">
                <p className="text-body-sm text-ink-danger">Sesi belum bisa diselesaikan. Periksa koneksi internet.</p>
                <button
                  type="button"
                  onClick={() => setFinish((f) => ({ failed: false, attempt: f.attempt + 1 }))}
                  className={buttonVariants({ variant: "outline", className: "w-fit" })}
                >
                  Coba lagi
                </button>
              </div>
            )}
          </div>
        )}

        <aside className="flex flex-col gap-4 self-start border-t border-ink-primary pt-4 max-lg:w-full lg:w-[380px] lg:shrink-0">
          <h2 className="text-h2">Status analisis</h2>
          <ol className="flex flex-col">
            {items.map((item, i) => (
              <li key={item.id} className="text-body flex items-center justify-between gap-4 border-b border-border-default py-3">
                Pertanyaan {i + 1}
                <Badge tone={item.problem ? "danger" : STATES[item.state].tone}>
                  {item.problem ? "Gagal" : STATES[item.state].label}
                </Badge>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2">
            <div
              role="progressbar"
              aria-label={uploading ? "Kemajuan unggahan" : "Pertanyaan selesai"}
              aria-valuenow={uploading ? percent : Math.round((doneCount / items.length) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 w-full overflow-hidden bg-border-default"
            >
              <div
                className="h-full bg-surface-accent"
                style={{ width: `${uploading ? percent : (doneCount / items.length) * 100}%` }}
              />
            </div>
            <p role="status" className="text-body-sm text-ink-secondary">
              {uploading
                ? `Mengunggah ${Math.floor(percent / 10) * 10}%`
                : processing.length
                  ? `${doneCount} dari ${items.length} selesai, ${processing.length} sedang dianalisis`
                  : doneCount
                    ? `${doneCount} dari ${items.length} selesai`
                    : "Belum dimulai"}
            </p>
          </div>
          <p className="text-body-sm text-ink-secondary">
            {uploading
              ? "Jangan tutup halaman ini sampai unggahan selesai."
              : processing.length
                ? "Analisis berjalan kira-kira selama durasi video. Anda boleh menutup halaman ini, lalu membukanya lagi untuk menyelesaikan sesi."
                : current
                  ? "Pilih berkas dan setujui izin, lalu mulai analisis."
                  : "Semua pertanyaan sudah selesai."}
          </p>
        </aside>
      </div>
    </div>
  );
}
