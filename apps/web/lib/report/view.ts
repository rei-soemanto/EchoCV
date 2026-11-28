import rubric from "@echocv/shared/rubric.json";

import type { Language } from "@/lib/db/sessions";
import type { SpeechMetrics } from "@/lib/db/speech";
import type { VisualMetrics } from "@/lib/db/uploads";
import { fillerText, type FeedbackItem, type Report } from "@/lib/scoring/report";
import { findBand, type Band } from "@/lib/scoring/score";

export type ReportView = Report & {
  answers: {
    answerIndex: number;
    question: string;
    status: string;
    speechMetrics: SpeechMetrics | null;
    visualMetrics: VisualMetrics | null;
    scores: { content?: number; content_feedback?: { strength: string; improvement: string } | null } | null;
  }[];
};

export type LoadResult = { ok: true; report: ReportView } | { ok: false; status: number | null; message: string };

const OFFLINE = { ok: false as const, status: null, message: "Periksa koneksi internet, lalu coba lagi." };

const ERRORS: Record<number, string> = {
  401: "Masuk dulu untuk membuka laporan ini.",
  404: "Sesi ini tidak ditemukan.",
  409: "Belum ada jawaban yang selesai dianalisis di sesi ini.",
  422: "Data sesi ini belum cukup untuk dinilai.",
};

function failed(status: number): LoadResult {
  return { ok: false, status, message: ERRORS[status] ?? "Laporan belum bisa dimuat. Coba lagi sebentar lagi." };
}

async function fetchReport(sessionId: string, rebuild: boolean, fetcher: typeof fetch): Promise<LoadResult> {
  const get = () => fetcher(`/api/reports?session_id=${sessionId}`).catch(() => null);

  let res = rebuild ? null : await get();
  if (rebuild || res?.status === 404) {
    const built = await fetcher("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => null);
    if (!built) return OFFLINE;
    if (!built.ok) return failed(built.status);
    res = await get();
  }
  if (!res) return OFFLINE;
  if (!res.ok) return failed(res.status);
  const report = (await res.json().catch(() => null)) as ReportView | null;
  return report ? { ok: true, report } : failed(500);
}

const inFlight = new Map<string, Promise<LoadResult>>();

export function loadReport(sessionId: string, rebuild = false, fetcher: typeof fetch = fetch): Promise<LoadResult> {
  const running = inFlight.get(sessionId);
  if (running) return running;
  const request = fetchReport(sessionId, rebuild, fetcher).finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, request);
  return request;
}

export function timecode(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function decimal(value: number) {
  return (Math.round(value * 10) / 10).toString().replace(".", ",");
}

export function fillerTarget(bands: Band[], language: Language): number | null {
  const band = findBand(bands, "fillers", language);
  return band ? Number(band.ideal_high) : null;
}

export type TranscriptLine = { atMs: number; parts: { text: string; filler: boolean }[] };

export function transcriptLines(speech: SpeechMetrics): TranscriptLine[] {
  const lexical = new Set(speech.fillers.filter((f) => f.kind === "lexical").map((f) => f.startMs));
  const parts = [
    ...speech.words.map((w) => ({ startMs: w.startMs, text: w.text, filler: lexical.has(w.startMs) })),
    ...speech.fillers
      .filter((f) => f.kind === "vocal")
      .map((f) => ({ startMs: f.startMs, text: fillerText(f.token), filler: true })),
  ].sort((a, b) => a.startMs - b.startMs);

  const lines: TranscriptLine[] = [];
  let line: TranscriptLine | null = null;
  for (const { startMs, text, filler } of parts) {
    if (!line) lines.push((line = { atMs: startMs, parts: [] }));
    line.parts.push({ text, filler });
    if (/[.?!]$/.test(text)) line = null;
  }
  return lines;
}

export function sessionStats(answers: ReportView["answers"]) {
  const speech = answers.map((a) => a.speechMetrics).filter((s): s is SpeechMetrics => !!s);
  const minutes = speech.reduce((sum, s) => sum + s.durationMs, 0) / 60_000;
  const speechMs = speech.reduce((sum, s) => sum + s.speechMs, 0);
  const fillers = speech.reduce((sum, s) => sum + s.fillers.length, 0);
  const words = speech.reduce((sum, s) => sum + (s.speakingRateWps * s.speechMs) / 1000, 0);
  return {
    fillersPerMinute: minutes > 0 ? fillers / minutes : null,
    longPauses: speech.reduce((sum, s) => sum + s.pauses.filter((p) => p.long).length, 0),
    wordsPerMinute: speechMs > 0 ? Math.round((words * 60_000) / speechMs) : null,
  };
}

export function feedbackFor(report: Report, answerIndex: number): FeedbackItem[] {
  return report.feedback.filter((f) => f.answerIndex === answerIndex);
}

export const NEXT_STEPS: Record<string, string> = {
  eye_contact: "Tempelkan catatan kecil di dekat kamera dan lihat ke sana saat menyampaikan poin utama.",
  posture: "Duduk tegak dengan kedua tangan di meja sebelum mulai, lalu pertahankan sampai jawaban selesai.",
  fillers: "Ganti kata pengisi dengan jeda satu napas sebelum kalimat berikutnya.",
  pace: "Ambil jeda singkat di akhir setiap kalimat agar tempo bicara stabil.",
  pauses: "Siapkan poin berikutnya saat masih bicara, dan jaga jeda di bawah dua detik.",
  voice: "Tekankan kata kunci di setiap kalimat agar suara tidak datar.",
  content: "Tutup cerita dengan hasil yang bisa diukur, misalnya waktu yang dihemat.",
};
const WEIGHTS = new Map(rubric.dimensions.map((d) => [d.id, d.weight]));

export function focusAreas(report: Pick<ReportView, "dimensionScores" | "answers">, max = 3) {
  const lost = (d: { id: string; score: number }) => (WEIGHTS.get(d.id) ?? 0) * (100 - d.score);
  const advice = report.answers
    .filter((a) => a.scores?.content !== undefined && a.scores.content_feedback?.improvement)
    .sort((a, b) => a.scores!.content! - b.scores!.content!)[0]?.scores?.content_feedback?.improvement;
  return report.dimensionScores
    .filter((d) => lost(d) > 0)
    .sort((a, b) => lost(b) - lost(a))
    .slice(0, max)
    .map((d) => ({ ...d, nextStep: (d.id === "content" && advice) || NEXT_STEPS[d.id] || "" }));
}

export function strongest(report: Pick<ReportView, "dimensionScores" | "answers">): { id: string; score: number } | null {
  const best = report.dimensionScores
    .filter((d) => (WEIGHTS.get(d.id) ?? 0) > 0)
    .sort((a, b) => b.score - a.score)[0];
  return best && !focusAreas(report).some((area) => area.id === best.id) ? best : null;
}
