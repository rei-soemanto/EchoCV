import type { SpeechMetrics } from "@/lib/db/speech";
import type { VisualMetrics } from "@/lib/db/uploads";
import type { FeedbackItem, Report } from "@/lib/scoring/report";

/** GET /api/reports: the saved report plus each question of the session. */
export type ReportView = Report & {
  answers: {
    answerIndex: number;
    question: string;
    status: string;
    speechMetrics: SpeechMetrics | null;
    visualMetrics: VisualMetrics | null;
    scores: { content_feedback?: { strength: string; improvement: string } | null } | null;
  }[];
};

export type LoadResult = { ok: true; report: ReportView } | { ok: false; status: number | null; message: string };

async function readError(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false as const, status: res.status, message: body?.error ?? "Laporan belum bisa dimuat." };
}

/** Reads the saved report, building it first when the session has none yet. */
export async function loadReport(sessionId: string, fetcher: typeof fetch = fetch): Promise<LoadResult> {
  const offline = { ok: false as const, status: null, message: "Periksa koneksi internet, lalu coba lagi." };
  const get = () => fetcher(`/api/reports?session_id=${sessionId}`).catch(() => null);

  let res = await get();
  if (!res) return offline;
  if (res.status === 404) {
    const built = await fetcher("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => null);
    if (!built) return offline;
    if (!built.ok) return readError(built);
    res = await get();
    if (!res) return offline;
  }
  if (!res.ok) return readError(res);
  return { ok: true, report: (await res.json()) as ReportView };
}

/** mm:ss of a moment in an answer. */
export function timecode(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Indonesian decimal comma, one place. */
export function decimal(value: number) {
  return (Math.round(value * 10) / 10).toString().replace(".", ",");
}

export type TranscriptLine = { atMs: number; parts: { text: string; filler: boolean }[] };

/** Splits the words into sentences, marking words that overlap a detected filler. */
export function transcriptLines(speech: SpeechMetrics): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  let line: TranscriptLine | null = null;
  for (const word of speech.words) {
    if (!line) lines.push((line = { atMs: word.startMs, parts: [] }));
    const filler = speech.fillers.some((f) => word.startMs < f.endMs && f.startMs < word.endMs);
    line.parts.push({ text: word.text, filler });
    if (/[.?!]$/.test(word.text)) line = null;
  }
  return lines;
}

/** Session totals for the stat row, over the analysed answers. */
export function sessionStats(answers: ReportView["answers"]) {
  const speech = answers.map((a) => a.speechMetrics).filter((s): s is SpeechMetrics => !!s);
  const minutes = speech.reduce((sum, s) => sum + s.durationMs, 0) / 60_000;
  const speechMinutes = speech.reduce((sum, s) => sum + s.speechMs, 0) / 60_000;
  const fillers = speech.reduce((sum, s) => sum + s.fillers.length, 0);
  const words = speech.reduce((sum, s) => sum + s.words.length, 0);
  return {
    fillersPerMinute: minutes > 0 ? fillers / minutes : null,
    longPauses: speech.reduce((sum, s) => sum + s.pauses.filter((p) => p.long).length, 0),
    wordsPerMinute: speechMinutes > 0 ? Math.round(words / speechMinutes) : null,
  };
}

export function feedbackFor(report: Report, answerIndex: number): FeedbackItem[] {
  return report.feedback.filter((f) => f.answerIndex === answerIndex);
}
