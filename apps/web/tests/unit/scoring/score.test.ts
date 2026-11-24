import rubric from "@echocv/shared/rubric.json";
import thresholds from "@echocv/shared/thresholds.json";
import { describe, expect, it } from "vitest";
import type { SpeechMetrics } from "@/lib/db/speech";
import type { VisualMetrics } from "@/lib/db/uploads";
import { answerFeedback, buildReport } from "@/lib/scoring/report";
import {
  answerMetrics,
  bandScore,
  contentScore,
  deliveryScores,
  overallScore,
  sessionScores,
  type Band,
} from "@/lib/scoring/score";

const band = (dimension: string, metric: string, low: number, high: number, zeroLow: number, zeroHigh: number, language: Band["language"] = "any"): Band => ({
  dimension,
  language,
  metric,
  ideal_low: low,
  ideal_high: high,
  zero_low: zeroLow,
  zero_high: zeroHigh,
  version: "0.1.0",
});

const bands: Band[] = [
  band("eye_contact", "eye_contact_pct", 60, 100, 10, 100),
  band("smile", "smile_pct", 10, 100, 0, 100),
  band("posture", "behaviour_pct", 0, 5, 0, 50),
  band("fillers", "fillers_per_minute", 0, 3, 0, 12),
  band("pace", "pace_deviation", 0, 0, 0, 0.35),
  band("pauses", "long_pauses_per_minute", 0, 1, 0, 6),
  band("voice", "pitch_variation", 0.15, 10, 0.05, 10),
  band("clarity_mixing", "mixed_word_pct", 0, 5, 0, 40, "en"),
];

function speech(overrides: Partial<SpeechMetrics> = {}): SpeechMetrics {
  return {
    answerIndex: 0,
    language: "en",
    durationMs: 60_000,
    speechMs: 50_000,
    transcript: "I led the API migration",
    words: [
      { text: "I", startMs: 0, endMs: 100, language: "en" },
      { text: "led", startMs: 100, endMs: 300, language: "en" },
      { text: "jadi", startMs: 300, endMs: 500, language: "id" },
      { text: "API", startMs: 500, endMs: 800, language: "en" },
    ],
    fillers: [
      { token: "uh", startMs: 2000, endMs: 2300, kind: "vocal" },
      { token: "um", startMs: 9000, endMs: 9300, kind: "vocal" },
    ],
    pauses: [
      { startMs: 4000, endMs: 4600, long: false },
      { startMs: 20000, endMs: 23000, long: true },
    ],
    speakingRateWps: 2.5,
    syllablesPerSecond: thresholds.pace.en.syllablesPerSecond.median,
    prosody: { pitchMeanHz: 180, pitchStdHz: 30, volumeMeanDb: -20 },
    ...overrides,
  };
}

const visual: VisualMetrics = {
  answerIndex: 0,
  durationMs: 60_000,
  eyeContactPct: 35,
  smilePct: 20,
  events: [
    { type: "touching_face", startMs: 10_000, endMs: 13_000 },
    { type: "arms_crossed", startMs: 12_000, endMs: 15_000 },
  ],
};

describe("bandScore", () => {
  const fillers = bands[3];
  it.each([
    [0, 100],
    [3, 100],
    [7.5, 50],
    [12, 0],
    [30, 0],
  ])("scores %f fillers per minute as %f", (value, score) => {
    expect(bandScore(value, fillers)).toBe(score);
  });

  it("falls on both sides of a two-sided band", () => {
    const twoSided = band("voice", "pitch_variation", 15, 60, 5, 120);
    expect(bandScore(10, twoSided)).toBe(50);
    expect(bandScore(30, twoSided)).toBe(100);
    expect(bandScore(90, twoSided)).toBe(50);
    expect(bandScore(2, twoSided)).toBe(0);
  });

  it("scores pitch variation relative to the voice and never penalises more of it", () => {
    const voice = bands[6];
    expect(bandScore(0.1, voice)).toBe(50);
    expect(bandScore(0.6, voice)).toBe(100);
    expect(bandScore(0.02, voice)).toBe(0);
    const low = answerMetrics(speech({ prosody: { pitchMeanHz: 100, pitchStdHz: 20, volumeMeanDb: -20 } }), null, "en");
    const high = answerMetrics(speech({ prosody: { pitchMeanHz: 220, pitchStdHz: 44, volumeMeanDb: -20 } }), null, "en");
    expect(low.pitch_variation).toBeCloseTo(high.pitch_variation!);
  });
});

describe("answerMetrics", () => {
  it("turns speech and visual metrics into per-minute and percentage values", () => {
    const metrics = answerMetrics(speech(), visual, "en");
    expect(metrics.fillers_per_minute).toBe(2);
    expect(metrics.long_pauses_per_minute).toBe(1);
    expect(metrics.pace_deviation).toBe(0);
    expect(metrics.mixed_word_pct).toBe(25);
    expect(metrics.eye_contact_pct).toBe(35);
    expect(metrics.behaviour_pct).toBeCloseTo(8.33, 2);
  });

  it("measures pace against the session language's band from shared/thresholds.json", () => {
    const idBand = thresholds.pace.id.syllablesPerSecond;
    const slow = answerMetrics(speech({ syllablesPerSecond: idBand.low - idBand.median * 0.1 }), null, "id");
    expect(slow.pace_deviation).toBeCloseTo(0.1);
    const insideForId = answerMetrics(speech({ syllablesPerSecond: idBand.median }), null, "id");
    expect(insideForId.pace_deviation).toBe(0);
  });

  it("leaves metrics empty when there is no audio or no video data", () => {
    const metrics = answerMetrics(speech({ durationMs: 0 }), null, "en");
    expect(metrics.fillers_per_minute).toBeNull();
    expect(metrics.eye_contact_pct).toBeNull();
    expect(metrics.behaviour_pct).toBeNull();
  });

  it("does not score pitch when no voiced speech was found", () => {
    expect(answerMetrics(speech({ prosody: { pitchMeanHz: 0, pitchStdHz: 0, volumeMeanDb: -60 } }), null, "en").pitch_variation).toBeNull();
  });
});

describe("deliveryScores", () => {
  it("scores each delivery dimension from its band", () => {
    const scores = deliveryScores(answerMetrics(speech(), visual, "en"), bands, "en");
    expect(scores).toEqual({ eye_contact: 50, smile: 100, posture: 92.6, fillers: 100, pace: 100, pauses: 100, voice: 100 });
  });

  it("skips dimensions with no data instead of scoring them 0", () => {
    const scores = deliveryScores(answerMetrics(speech(), null, "en"), bands, "en");
    expect(scores.eye_contact).toBeUndefined();
    expect(scores.posture).toBeUndefined();
  });

  it("never lets language mixing lower a delivery score (BR-27)", () => {
    const mixed = speech({ words: speech().words.map((word) => ({ ...word, language: "id" as const })) });
    expect(deliveryScores(answerMetrics(mixed, visual, "en"), bands, "en")).toEqual(
      deliveryScores(answerMetrics(speech(), visual, "en"), bands, "en"),
    );
  });
});

describe("contentScore", () => {
  const parts = { star: 80, relevance: 90, clarity: 70 };

  it("averages STAR, relevance and clarity", () => {
    expect(contentScore(parts, answerMetrics(speech({ words: [] }), null, "en"), bands, "en")).toBe(80);
  });

  it("lets heavy mixing lower only clarity in an English session (BR-27)", () => {
    const mostlyIndonesian = speech({ words: speech().words.map((word) => ({ ...word, language: "id" as const })) });
    expect(contentScore(parts, answerMetrics(mostlyIndonesian, null, "en"), bands, "en")).toBe(56.7);
  });

  it("never lowers content for mixing in an Indonesian session (BR-28)", () => {
    const mixed = speech({ words: speech().words.map((word) => ({ ...word, language: "en" as const })) });
    expect(contentScore(parts, answerMetrics(mixed, null, "id"), bands, "id")).toBe(80);
  });
});

describe("overallScore", () => {
  it("never counts smile (BR-09)", () => {
    const withSmile = overallScore({ eye_contact: 80, smile: 100, content: 60 });
    const withoutSmile = overallScore({ eye_contact: 80, smile: 0, content: 60 });
    expect(withSmile).toBe(withoutSmile);
    expect(rubric.dimensions.find((d) => d.id === "smile")!.weight).toBe(0);
  });

  it("uses the rubric weights", () => {
    const all = Object.fromEntries(rubric.dimensions.map((d) => [d.id, d.id === "content" ? 100 : 0]));
    const contentWeight = rubric.dimensions.find((d) => d.id === "content")!.weight;
    const totalWeight = rubric.dimensions.reduce((sum, d) => sum + d.weight, 0);
    expect(overallScore(all)).toBeCloseTo((100 * contentWeight) / totalWeight, 1);
  });

  it("uses only the dimensions that were scored, for example while content is pending", () => {
    expect(overallScore({ eye_contact: 80, fillers: 60 })).toBe(70);
    expect(overallScore({ smile: 90 })).toBeNull();
  });
});

describe("sessionScores", () => {
  it("averages each dimension over the answers that have it", () => {
    expect(sessionScores([{ fillers: 100, content: 50 }, { fillers: 50 }])).toEqual({ fillers: 75, content: 50 });
  });
});

describe("buildReport", () => {
  const answer = {
    answerIndex: 0,
    scores: { eye_contact: 50, fillers: 100, content: 80 },
    speech: speech(),
    visual,
    content: { strength: "Clear result.", improvement: "Name the task first." },
  };

  it("matches the report schema fields and marks content scored", () => {
    const report = buildReport("session-1", [answer], "en", 60, new Date("2026-11-24T00:00:00Z"))!;
    expect(Object.keys(report).sort()).toEqual(["contentStatus", "createdAt", "dimensionScores", "feedback", "overallScore", "sessionId"]);
    expect(report.contentStatus).toBe("scored");
    expect(report.dimensionScores).toEqual([
      { id: "eye_contact", score: 50 },
      { id: "fillers", score: 100 },
      { id: "content", score: 80 },
    ]);
  });

  it("marks content pending when an answer has no content score yet (UC-06 E1)", () => {
    const pending = { ...answer, scores: { eye_contact: 50, fillers: 100 }, content: null };
    expect(buildReport("session-1", [answer, pending], "en", 60)!.contentStatus).toBe("pending");
  });

  it("returns null when nothing could be scored", () => {
    expect(buildReport("session-1", [{ ...answer, scores: {} }], "en", 60)).toBeNull();
  });
});

describe("answerFeedback", () => {
  const answer = { answerIndex: 1, scores: {}, speech: speech(), visual, content: { strength: "S", improvement: "I" } };

  it("gives time-stamped coaching in the session language, in time order", () => {
    const items = answerFeedback(answer, "id", 60);
    const timed = items.filter((item) => item.atMs !== undefined);
    expect(timed.map((item) => item.atMs)).toEqual([2000, 9000, 10000, 12000, 20000]);
    expect(timed[0].message).toContain("Kata pengisi");
    expect(items.find((item) => item.dimension === "eye_contact")?.message).toContain("35%");
    expect(items.every((item) => item.answerIndex === 1)).toBe(true);
  });

  it("adds no eye-contact note when eye contact meets the band", () => {
    expect(answerFeedback({ ...answer, visual: { ...visual, eyeContactPct: 80 } }, "en", 60).some((i) => i.dimension === "eye_contact")).toBe(false);
  });

  it("limits filler notes to three per answer", () => {
    const many = speech({ fillers: Array.from({ length: 10 }, (_, i) => ({ token: "eee", startMs: i * 1000, endMs: i * 1000 + 200, kind: "vocal" as const })) });
    expect(answerFeedback({ ...answer, speech: many }, "id", 60).filter((i) => i.dimension === "fillers")).toHaveLength(3);
  });
});
