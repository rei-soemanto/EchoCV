import rubric from "@echocv/shared/rubric.json";
import thresholds from "@echocv/shared/thresholds.json";
import type { Language } from "@/lib/db/sessions";
import type { SpeechMetrics } from "@/lib/db/speech";
import type { VisualMetrics } from "@/lib/db/uploads";

export type Band = {
  dimension: string;
  language: "any" | Language;
  metric: string;
  ideal_low: number;
  ideal_high: number;
  zero_low: number;
  zero_high: number;
  version: string;
};

export type ContentParts = { star: number; relevance: number; clarity: number };

export type AnswerMetrics = {
  fillers_per_minute: number | null;
  long_pauses_per_minute: number | null;
  pace_deviation: number | null;
  pitch_std_hz: number | null;
  mixed_word_pct: number | null;
  eye_contact_pct: number | null;
  smile_pct: number | null;
  behaviour_pct: number | null;
};

export type DimensionId = (typeof rubric.dimensions)[number]["id"];
export type Scores = Partial<Record<DimensionId, number>>;

export const RUBRIC_VERSION = rubric.version;
const DELIVERY_DIMENSIONS = ["eye_contact", "smile", "posture", "fillers", "pace", "pauses", "voice"] as const;

const round = (value: number) => Math.round(value * 10) / 10;

export function bandScore(value: number, band: Band): number {
  if (value < band.ideal_low) {
    if (band.ideal_low === band.zero_low) return 0;
    return round(Math.max(0, (100 * (value - band.zero_low)) / (band.ideal_low - band.zero_low)));
  }
  if (value > band.ideal_high) {
    if (band.ideal_high === band.zero_high) return 0;
    return round(Math.max(0, (100 * (band.zero_high - value)) / (band.zero_high - band.ideal_high)));
  }
  return 100;
}

export function findBand(bands: Band[], dimension: string, language: Language): Band | undefined {
  return (
    bands.find((band) => band.dimension === dimension && band.language === language) ??
    bands.find((band) => band.dimension === dimension && band.language === "any")
  );
}

function coveredMs(intervals: { startMs: number; endMs: number }[]): number {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  let total = 0;
  let end = -Infinity;
  for (const { startMs, endMs } of sorted) {
    const start = Math.max(startMs, end);
    if (endMs > start) total += endMs - start;
    end = Math.max(end, endMs);
  }
  return total;
}

export function answerMetrics(
  speech: SpeechMetrics | null,
  visual: VisualMetrics | null,
  language: Language,
): AnswerMetrics {
  const minutes = speech && speech.durationMs > 0 ? speech.durationMs / 60000 : null;
  const pace = thresholds.pace[language].syllablesPerSecond;
  const sps = speech?.syllablesPerSecond;
  const words = speech?.words ?? [];
  return {
    fillers_per_minute: minutes ? speech!.fillers.length / minutes : null,
    long_pauses_per_minute: minutes ? speech!.pauses.filter((pause) => pause.long).length / minutes : null,
    pace_deviation:
      sps === undefined || !minutes
        ? null
        : sps < pace.low
          ? (pace.low - sps) / pace.median
          : sps > pace.high
            ? (sps - pace.high) / pace.median
            : 0,
    pitch_std_hz: speech && speech.prosody.pitchMeanHz > 0 ? speech.prosody.pitchStdHz : null,
    mixed_word_pct: speech ? (words.length ? (100 * words.filter((w) => w.language !== language).length) / words.length : 0) : null,
    eye_contact_pct: visual?.eyeContactPct ?? null,
    smile_pct: visual?.smilePct ?? null,
    behaviour_pct: visual && visual.durationMs > 0 ? Math.min(100, (100 * coveredMs(visual.events)) / visual.durationMs) : null,
  };
}

export function deliveryScores(metrics: AnswerMetrics, bands: Band[], language: Language): Scores {
  const scores: Scores = {};
  for (const dimension of DELIVERY_DIMENSIONS) {
    const band = findBand(bands, dimension, language);
    const value = band ? metrics[band.metric as keyof AnswerMetrics] : null;
    if (band && value !== null && value !== undefined) scores[dimension] = bandScore(value, band);
  }
  return scores;
}

export function contentScore(parts: ContentParts, metrics: AnswerMetrics, bands: Band[], language: Language): number {
  const mixingBand = language === "en" ? findBand(bands, "clarity_mixing", "en") : undefined;
  const clarity =
    mixingBand && metrics.mixed_word_pct !== null
      ? Math.min(parts.clarity, bandScore(metrics.mixed_word_pct, mixingBand))
      : parts.clarity;
  return round((parts.star + parts.relevance + clarity) / 3);
}

export function sessionScores(answers: Scores[]): Scores {
  const result: Scores = {};
  for (const { id } of rubric.dimensions) {
    const values = answers.map((scores) => scores[id]).filter((value): value is number => value !== undefined);
    if (values.length) result[id] = round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }
  return result;
}

export function overallScore(scores: Scores): number | null {
  let weighted = 0;
  let weights = 0;
  for (const { id, weight } of rubric.dimensions) {
    const score = scores[id];
    if (weight > 0 && score !== undefined) {
      weighted += weight * score;
      weights += weight;
    }
  }
  return weights ? round(weighted / weights) : null;
}
