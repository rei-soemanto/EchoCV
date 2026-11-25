import type { Language } from "@/lib/db/sessions";
import type { SpeechMetrics } from "@/lib/db/speech";
import type { VisualMetrics } from "@/lib/db/uploads";
import { overallScore, sessionScores, type Scores } from "./score";

export type FeedbackItem = { answerIndex: number; atMs?: number; dimension: string; message: string };

export type Report = {
  sessionId: string;
  createdAt: string;
  overallScore: number;
  dimensionScores: { id: string; score: number }[];
  feedback: FeedbackItem[];
  contentStatus: "scored" | "pending";
};

export type ScoredAnswer = {
  answerIndex: number;
  scores: Scores;
  speech: SpeechMetrics | null;
  visual: VisualMetrics | null;
  content: { strength: string; improvement: string } | null;
};

const MAX_FILLER_NOTES = 3;

/** Vocal fillers arrive as labels such as "[EEE]"; people read "eee". */
export function fillerText(token: string): string {
  return token.replace(/[[\]]/g, "").toLowerCase();
}

const MESSAGES = {
  en: {
    longPause: (seconds: number) => `A ${seconds}-second pause here. A short breath is fine; try to keep pauses under two seconds.`,
    filler: (token: string) => `Filler "${token}" here. Pausing silently sounds more confident than a filler.`,
    touching_face: "Your hand went to your face here. Try resting your hands on the desk.",
    arms_crossed: "Arms crossed here. Open arms come across as more relaxed.",
    slouching: "Slouching here. Sitting up straight helps your voice too.",
    reading_notes: "Looking down at notes here. Try glancing at the camera between points.",
    eyeContact: (pct: number) => `Eye contact was ${pct}% of this answer. Looking at the camera more often helps you connect.`,
  },
  id: {
    longPause: (seconds: number) => `Jeda ${seconds} detik di sini. Tarik napas sebentar boleh, usahakan jeda di bawah dua detik.`,
    filler: (token: string) => `Kata pengisi "${token}" di sini. Diam sejenak terdengar lebih yakin daripada kata pengisi.`,
    touching_face: "Tangan menyentuh wajah di sini. Coba letakkan tangan di meja.",
    arms_crossed: "Tangan bersilang di sini. Tangan terbuka terlihat lebih santai.",
    slouching: "Posisi duduk membungkuk di sini. Duduk tegak juga membantu suara.",
    reading_notes: "Melihat catatan di sini. Coba sesekali lihat kamera di antara poin.",
    eyeContact: (pct: number) => `Kontak mata ${pct}% dari jawaban ini. Lebih sering melihat kamera membantu kamu terhubung.`,
  },
} as const;

export function answerFeedback(answer: ScoredAnswer, language: Language, eyeContactIdealPct: number | null): FeedbackItem[] {
  const text = MESSAGES[language];
  const items: FeedbackItem[] = [];
  const at = (atMs: number, dimension: string, message: string) =>
    items.push({ answerIndex: answer.answerIndex, atMs, dimension, message });

  for (const pause of answer.speech?.pauses ?? []) {
    if (pause.long) at(pause.startMs, "pauses", text.longPause(Math.round((pause.endMs - pause.startMs) / 1000)));
  }
  for (const filler of (answer.speech?.fillers ?? []).slice(0, MAX_FILLER_NOTES)) {
    at(filler.startMs, "fillers", text.filler(fillerText(filler.token)));
  }
  for (const event of answer.visual?.events ?? []) {
    at(event.startMs, "posture", text[event.type as keyof typeof text] as string);
  }
  if (answer.visual && eyeContactIdealPct !== null && answer.visual.eyeContactPct < eyeContactIdealPct) {
    items.push({ answerIndex: answer.answerIndex, dimension: "eye_contact", message: text.eyeContact(Math.round(answer.visual.eyeContactPct)) });
  }
  if (answer.content) {
    items.push({ answerIndex: answer.answerIndex, dimension: "content", message: answer.content.strength });
    items.push({ answerIndex: answer.answerIndex, dimension: "content", message: answer.content.improvement });
  }
  return items.sort((a, b) => (a.atMs ?? Infinity) - (b.atMs ?? Infinity));
}

export function buildReport(
  sessionId: string,
  answers: ScoredAnswer[],
  language: Language,
  eyeContactIdealPct: number | null,
  createdAt: Date = new Date(),
): Report | null {
  const scores = sessionScores(answers.map((answer) => answer.scores));
  const overall = overallScore(scores);
  if (overall === null) return null;
  return {
    sessionId,
    createdAt: createdAt.toISOString(),
    overallScore: overall,
    dimensionScores: Object.entries(scores).map(([id, score]) => ({ id, score: score as number })),
    feedback: answers.flatMap((answer) => answerFeedback(answer, language, eyeContactIdealPct)),
    contentStatus: answers.every((answer) => answer.scores.content !== undefined) ? "scored" : "pending",
  };
}
