"use client";

import sessionSettings from "@echocv/shared/session.json";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { useMediaCapture } from "@/hooks/use-media-capture";
import { startAudioRecorder } from "@/lib/media";
import { completeUpload, type SubmitResult, submitAnswer, type UploadTicket } from "@/lib/practice/answer-upload";
import { finishSession } from "@/lib/practice/finish-session";
import { formatClock, hintText, isGuideSeen, markGuideSeen } from "@/lib/practice/room";
import { createClient } from "@/lib/supabase/client";
import { AnswerTracker, type VisualMetrics } from "@/lib/vision/answer-tracker";
import { BehaviourTracker } from "@/lib/vision/behaviour-tracker";
import { loadBaseline } from "@/lib/vision/calibration-store";
import type { Baseline } from "@/lib/vision/eye-contact";
import type { FaceModel } from "@/lib/vision/face";
import type { FaceFeatures } from "@/lib/vision/face-features";
import { startFaceTracking } from "@/lib/vision/face-loop";
import { type PostureModels, startPostureTracking } from "@/lib/vision/pose-loop";
import { loadSessionModels } from "@/lib/vision/session-models";

type Question = { id: string; position: number; question_text: string };
type Phase =
  | "loading"
  | "guide"
  | "prep"
  | "recording"
  | "sending"
  | "skipping"
  | "retry"
  | "rerecord"
  | "finishing"
  | "finish_failed";

const PREP_MS = sessionSettings.prepSeconds * 1000;
const MAX_MS = sessionSettings.maxAnswerSeconds * 1000;


// Figma 07 Ruang wawancara (UC-04): one question at a time, 15 s preparation, up to 3 minutes of
// recording, live hints, restart once, skip. Only audio and numbers leave the browser (BR-04).
export function InterviewRoom({
  sessionId,
  questions,
  startAt,
}: {
  sessionId: string;
  questions: Question[];
  startAt: number;
}) {
  const router = useRouter();
  const { videoRef, stream, status, hasCamera, hasMic } = useMediaCapture();
  const [baseline, setBaseline] = useState<Baseline | null | undefined>(undefined);
  const [index, setIndex] = useState(startAt);
  const [phase, setPhase] = useState<Phase>("loading");
  const [now, setNow] = useState(0);
  const [phaseStartedAt, setPhaseStartedAt] = useState(0); // render copy of phaseStart
  const [hints, setHints] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [restarted, setRestarted] = useState<Set<number>>(new Set());
  const [notices, setNotices] = useState<{ face: boolean; posture: boolean } | null>(null); // null: loading

  const models = useRef<{ face: FaceModel | null; posture: PostureModels | null } | null>(null);
  const phaseStart = useRef(0);
  const take = useRef<{
    recorder: { stop: () => Promise<Blob> };
    answer: AnswerTracker | null;
    behaviour: BehaviourTracker | null;
    stopLoops: () => void;
    startedAt: number;
  } | null>(null);
  const pending = useRef<{ ticket?: UploadTicket; audio: Blob; metrics: VisualMetrics | null } | null>(null);
  const skipping = useRef(false);
  const supabase = useRef<ReturnType<typeof createClient> | null>(null);

  const question = questions[index];
  const sb = () => (supabase.current ??= createClient());

  const go = useCallback((next: Phase) => {
    phaseStart.current = performance.now();
    setPhaseStartedAt(phaseStart.current);
    setNow(phaseStart.current);
    setPhase(next);
  }, []);

  // The baseline comes from the calibration page through this tab's sessionStorage.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is the external system
    setBaseline(loadBaseline());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSessionModels().then((loaded) => {
      if (cancelled) return;
      models.current = loaded;
      setNotices({ face: loaded.face !== null, posture: loaded.posture !== null });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Stop the current take and return its audio and metrics (null audio when discarded). */
  const endTake = useCallback(async (keep: boolean) => {
    const current = take.current;
    take.current = null;
    if (!current) return null;
    current.stopLoops();
    const audio = await current.recorder.stop().catch(() => null);
    if (!keep || !audio) return null;
    const durationMs = performance.now() - current.startedAt;
    const position = questions[index].position;
    const metrics = current.answer
      ? current.answer.metrics(position, Math.round(durationMs), current.behaviour?.events() ?? [])
      : null;
    return { audio, metrics };
  }, [index, questions]);

  const startTake = useCallback(() => {
    const video = videoRef.current;
    // Guard: the 250 ms clock can fire again before React re-renders.
    if (!stream || !video || take.current) return;
    const loaded = models.current;
    const answer = loaded?.face && baseline ? new AnswerTracker(baseline) : null;
    const behaviour = loaded?.posture && baseline ? new BehaviourTracker(baseline) : null;
    let latestFace: FaceFeatures | null = null;
    const stops: (() => void)[] = [];
    if (loaded?.face && answer) {
      stops.push(
        startFaceTracking(video, loaded.face, (features, timeMs) => {
          latestFace = features;
          answer.add(features, timeMs);
        }),
      );
    }
    if (loaded?.posture && behaviour) {
      stops.push(
        startPostureTracking(video, loaded.posture, (d) => behaviour.add({ ...d, face: latestFace }), () => {
          // A failing frame is skipped; the face metrics carry on.
        }),
      );
    }
    let recorder: ReturnType<typeof startAudioRecorder>;
    try {
      recorder = startAudioRecorder(stream);
    } catch {
      stops.forEach((stop) => stop());
      setMessage("Perekaman tidak bisa dimulai. Periksa mikrofon, lalu coba lagi.");
      return go("rerecord");
    }
    setMessage(null);
    take.current = {
      recorder,
      answer,
      behaviour,
      stopLoops: () => stops.forEach((stop) => stop()),
      startedAt: performance.now(),
    };
    setHints([]);
    go("recording");
  }, [baseline, go, stream, videoRef]);

  const finish = useCallback(async () => {
    go("finishing");
    setMessage(null);
    if (await finishSession(sessionId)) return router.push(`/report/${sessionId}`);
    setMessage("Sesi belum bisa diselesaikan. Periksa koneksi internet, lalu coba lagi.");
    go("finish_failed");
  }, [go, router, sessionId]);

  const nextQuestion = useCallback(() => {
    pending.current = null;
    setMessage(null);
    setIndex(index + 1);
    if (index + 1 < questions.length) go("prep");
    else void finish();
  }, [finish, go, index, questions.length]);

  const handle = useCallback((result: SubmitResult) => {
    if (result.ok) return nextQuestion();
    if (pending.current) pending.current.ticket = result.ticket;
    setMessage(result.message);
    go(result.next);
  }, [go, nextQuestion]);

  const finishAnswer = useCallback(async () => {
    if (!take.current) return; // already sent (the limit and a click can land together)
    go("sending");
    const done = await endTake(true);
    if (!done) {
      setMessage("Rekaman tidak tersimpan. Silakan rekam ulang jawaban Anda.");
      return go("rerecord");
    }
    pending.current = { ...done };
    handle(await submitAnswer(
      { sessionQuestionId: question.id, audio: done.audio, metrics: done.metrics },
      async (ticket, audio, contentType) =>
        sb().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, audio, { contentType }),
    ));
  }, [endTake, go, handle, question]);

  const resend = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    go("sending");
    handle(p.ticket
      ? await completeUpload(p.ticket, p.metrics)
      : await submitAnswer(
          { sessionQuestionId: question.id, audio: p.audio, metrics: p.metrics },
          async (ticket, audio, contentType) =>
            sb().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, audio, { contentType }),
        ));
  }, [go, handle, question]);

  const skip = useCallback(async () => {
    if (skipping.current) return; // a double click must not skip the next question too
    skipping.current = true;
    const from = take.current ? "rerecord" : phase; // a take in progress is discarded below
    go("skipping"); // stops the preparation countdown from starting a take meanwhile
    await endTake(false);
    // UC-04: a skipped question is marked so the report can say so. Own rows only (RLS).
    const { error } = await sb()
      .from("answers")
      .upsert({ session_question_id: question.id, status: "skipped" }, { onConflict: "session_question_id" });
    skipping.current = false;
    if (error) {
      setMessage("Pertanyaan belum bisa dilewati. Periksa koneksi internet, lalu coba lagi.");
      return go(from);
    }
    nextQuestion();
  }, [endTake, go, nextQuestion, phase, question]);

  const restart = useCallback(async () => {
    await endTake(false);
    setRestarted((s) => new Set(s).add(index));
    startTake();
  }, [endTake, index, startTake]);

  // Start once the camera, mic and models are ready.
  const ready = status === "ready" && hasCamera && hasMic && notices !== null && baseline !== undefined;
  useEffect(() => {
    if (phase !== "loading" || !ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the timed flow once devices are ready
    if (index >= questions.length) void finish();
    else go(isGuideSeen() ? "prep" : "guide");
  }, [finish, go, index, phase, questions.length, ready]);

  // One clock drives the countdown, the recording limit and the live hints.
  useEffect(() => {
    if (phase !== "prep" && phase !== "recording") return;
    const timer = setInterval(() => {
      const t = performance.now();
      setNow(t);
      const elapsed = t - phaseStart.current;
      if (phase === "prep" && elapsed >= PREP_MS) startTake();
      if (phase === "recording") {
        const current = take.current;
        setHints(hintText(current?.answer?.hint() ?? null, current?.behaviour?.active() ?? []));
        if (elapsed >= MAX_MS) void finishAnswer(); // hard limit: stop and send (UC-04)
      }
    }, 250);
    return () => clearInterval(timer);
  }, [finishAnswer, phase, startTake]);

  // Leaving the page mid-answer: stop the recorder and the vision loops, send nothing.
  useEffect(
    () => () => {
      const current = take.current;
      take.current = null;
      current?.stopLoops();
      void current?.recorder.stop().catch(() => null);
    },
    [],
  );

  if (baseline === null) {
    return (
      <Blocked
        title="Kalibrasi dulu"
        text="Ruang wawancara memakai hasil kalibrasi 5 detik untuk menilai kontak mata. Kalibrasi tidak ditemukan di tab ini."
        href={`/practice/check?session=${sessionId}`}
        cta="Ke kalibrasi"
      />
    );
  }
  if (status !== "requesting" && status !== "ready") {
    return (
      <Blocked
        title="Kamera atau mikrofon belum siap"
        text="Periksa izin kamera dan mikrofon di browser, lalu buka kalibrasi lagi."
        href={`/practice/check?session=${sessionId}`}
        cta="Periksa perangkat"
      />
    );
  }

  const elapsed = Math.max(0, now - phaseStartedAt);
  const clock =
    phase === "prep" ? formatClock(PREP_MS - elapsed) : phase === "recording" ? formatClock(elapsed) : "--:--";
  const total = questions.length;
  const shown = Math.min(index + 1, total);
  const busy = phase === "sending" || phase === "finishing";
  const guide = phase === "guide";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex items-center justify-between gap-4 bg-surface-inverse px-4 py-4 text-ink-inverse md:px-12">
        <p className="text-label flex items-center gap-3">
          {phase === "recording" && <Image src="/icons/record.svg" alt="" width={16} height={16} />}
          {phase === "prep" ? "Persiapan" : phase === "recording" ? "Merekam" : busy ? "Menganalisis" : "Jeda"}
        </p>
        <p className="font-mono text-[13px] leading-[18px]" aria-label={phase === "prep" ? "Sisa waktu persiapan" : "Lama jawaban"}>
          {clock}
        </p>
        <p className="text-body-sm">
          Pertanyaan {shown} dari {total}
        </p>
      </div>

      <div className="flex flex-1 flex-col-reverse gap-10 px-4 pt-10 pb-12 md:px-16 md:pt-16 lg:flex-row lg:gap-16">
        <section aria-labelledby="question" className="flex min-w-0 flex-1 flex-col gap-6">
          <p className="text-label text-ink-secondary">{guide ? "Sebelum mulai" : `Pertanyaan ${shown}`}</p>
          <h1 id="question" className="text-h1">
            {guide ? "Cara kerja ruang wawancara" : (question?.question_text ?? "Semua pertanyaan sudah dijawab.")}
          </h1>
          {guide ? (
            // First visit only. The question stays hidden, so reading this does not use up preparation time.
            <ol className="text-body flex list-decimal flex-col gap-3 pl-6 text-ink-secondary">
              <li>
                Anda punya {sessionSettings.prepSeconds} detik untuk bersiap, lalu perekaman mulai sendiri. Tekan{" "}
                <strong>Mulai menjawab</strong> jika sudah siap lebih cepat.
              </li>
              <li>
                Jawab sampai {sessionSettings.maxAnswerSeconds / 60} menit sambil melihat kamera, lalu tekan{" "}
                <strong>Selesai dan analisis</strong>.
              </li>
              <li>
                <strong>Ulangi jawaban</strong> bisa dipakai sekali per pertanyaan. <strong>Lewati pertanyaan</strong>{" "}
                melanjutkan tanpa jawaban.
              </li>
              <li>Video dianalisis di perangkat ini. Hanya suara dan angka hasil analisis yang dikirim.</li>
            </ol>
          ) : (
            <p className="text-body text-ink-secondary">
              {phase === "prep"
                ? "Tarik napas, lalu jawab dengan urutan: Situasi, Tugas, Aksi, Hasil. Perekaman mulai otomatis saat hitungan selesai."
                : `Jawab dengan tenang. Perekaman berhenti otomatis setelah ${sessionSettings.maxAnswerSeconds / 60} menit.`}
            </p>
          )}
          <div aria-live="polite" className="flex flex-col gap-3 border-t border-border-default pt-4">
            {phase === "loading" && <p className="text-body-sm text-ink-secondary">Menyiapkan kamera dan analisis…</p>}
            {phase === "recording" &&
              (hints.length ? (
                hints.map((h) => (
                  <p key={h} className="text-body-sm flex items-center gap-3 text-ink-secondary">
                    <Badge tone="warning">Perhatikan</Badge>
                    {h}
                  </p>
                ))
              ) : (
                <p className="text-body-sm flex items-center gap-3 text-ink-secondary">
                  <Badge tone="success">Bagus</Badge>
                  Kontak mata dan postur Anda baik.
                </p>
              ))}
            {phase === "sending" && <p className="text-body-sm text-ink-secondary">Mengirim dan menganalisis jawaban…</p>}
            {phase === "skipping" && <p className="text-body-sm text-ink-secondary">Melewati pertanyaan…</p>}
            {phase === "finishing" && <p className="text-body-sm text-ink-secondary">Menyelesaikan sesi…</p>}
            {message && (
              <p role="alert" className="text-body-sm text-ink-danger">
                {message}
              </p>
            )}
            {notices && (!notices.face || !notices.posture) && (
              <p role="status" className="text-caption text-ink-tertiary">
                {!notices.face
                  ? "Analisis wajah tidak berjalan di browser ini, jadi kontak mata tidak dinilai. Jawaban tetap dianalisis dari suara."
                  : "Analisis postur tidak berjalan di browser ini, jadi postur tidak dinilai."}
              </p>
            )}
          </div>
        </section>

        <div className="relative flex aspect-[7/5] w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-sidebar lg:w-[420px] lg:self-start">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Pratinjau kamera"
            className="absolute inset-0 size-full -scale-x-100 object-cover"
          />
          <Image src="/face-guide.png" alt="" width={110} height={150} className="relative opacity-60" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border-default px-4 py-6 md:px-12">
        {guide && (
          <button
            type="button"
            onClick={() => {
              markGuideSeen();
              go("prep");
            }}
            className={buttonVariants()}
          >
            <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
            Saya mengerti, mulai
          </button>
        )}
        {phase === "prep" && (
          <button type="button" onClick={startTake} className={buttonVariants()}>
            <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
            Mulai menjawab
          </button>
        )}
        {(phase === "recording" || busy) && (
          <button type="button" onClick={finishAnswer} disabled={busy} className={buttonVariants()}>
            <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
            {busy ? "Menganalisis…" : "Selesai dan analisis"}
          </button>
        )}
        {phase === "retry" && (
          <button type="button" onClick={resend} className={buttonVariants()}>
            Coba kirim lagi
          </button>
        )}
        {phase === "rerecord" && (
          <button type="button" onClick={startTake} className={buttonVariants()}>
            Rekam ulang
          </button>
        )}
        {phase === "finish_failed" && (
          <button type="button" onClick={finish} className={buttonVariants()}>
            Selesaikan sesi
          </button>
        )}
        {(phase === "prep" || phase === "recording" || phase === "retry" || phase === "rerecord") && (
          <button type="button" onClick={skip} className={buttonVariants({ variant: "outline" })}>
            Lewati pertanyaan
          </button>
        )}
        {phase === "recording" && !restarted.has(index) && (
          <button type="button" onClick={restart} className={buttonVariants({ variant: "link", size: "text" })}>
            Ulangi jawaban
          </button>
        )}
      </div>
    </div>
  );
}

function Blocked({ title, text, href, cta }: { title: string; text: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col gap-6 px-4 pt-10 pb-16 md:px-12 md:pt-12">
      <h1 className="text-h1">{title}</h1>
      <p className="text-body max-w-2xl text-ink-secondary">{text}</p>
      <Link href={href} className={buttonVariants({ className: "w-fit" })}>
        {cta}
      </Link>
    </div>
  );
}
