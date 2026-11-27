import { describe, expect, it, vi } from "vitest";

import rubric from "@echocv/shared/rubric.json";
import type { SpeechMetrics } from "@/lib/db/speech";
import { fillerText } from "@/lib/scoring/report";
import type { Band } from "@/lib/scoring/score";
import { estimate } from "@/components/ui/progress-bar";
import { decimal, fillerTarget, focusAreas, loadReport, sessionStats, strongest, timecode, transcriptLines, type ReportView } from "@/lib/report/view";

const ID = "11111111-1111-4111-8111-111111111111";

function reply(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; method: string }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    const next = responses.shift();
    if (!next || next instanceof Error) throw next ?? new Error("no more responses");
    return next;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const speech = (over: Partial<SpeechMetrics> = {}): SpeechMetrics => ({
  answerIndex: 0,
  language: "id",
  durationMs: 60_000,
  speechMs: 30_000,
  transcript: "",
  words: [],
  fillers: [],
  pauses: [],
  speakingRateWps: 2,
  syllablesPerSecond: 4,
  prosody: { pitchMeanHz: 0, pitchStdHz: 0, volumeMeanDb: 0 },
  ...over,
});

const word = (text: string, startMs: number) => ({ text, startMs, endMs: startMs + 300, language: "id" as const });

describe("loadReport", () => {
  it("returns the saved report", async () => {
    const f = fakeFetch(reply(200, { overallScore: 70, answers: [] }));
    const result = await loadReport(ID, false, f.fetch);
    expect(result).toMatchObject({ ok: true, report: { overallScore: 70 } });
    expect(f.calls).toEqual([{ url: `/api/reports?session_id=${ID}`, method: "GET" }]);
  });

  it("builds the report first when none is saved yet", async () => {
    const f = fakeFetch(reply(404), reply(201), reply(200, { overallScore: 70, answers: [] }));
    const result = await loadReport(ID, false, f.fetch);
    expect(result.ok).toBe(true);
    expect(f.calls.map((c) => c.method)).toEqual(["GET", "POST", "GET"]);
  });

  it("scores again without reading first when asked to rebuild", async () => {
    const f = fakeFetch(reply(201), reply(200, { overallScore: 70, answers: [] }));
    expect((await loadReport(ID, true, f.fetch)).ok).toBe(true);
    expect(f.calls.map((c) => c.method)).toEqual(["POST", "GET"]);
  });

  it("shares one request between simultaneous calls", async () => {
    const f = fakeFetch(reply(404), reply(201), reply(200, { overallScore: 70, answers: [] }));
    const [a, b] = await Promise.all([loadReport(ID, false, f.fetch), loadReport(ID, false, f.fetch)]);
    expect(a).toBe(b);
    expect(f.calls).toHaveLength(3);
  });

  it("explains in Indonesian why the report cannot be built", async () => {
    const f = fakeFetch(reply(404), reply(409, { error: "No analysed answers in this session yet." }));
    expect(await loadReport(ID, false, f.fetch)).toEqual({
      ok: false,
      status: 409,
      message: "Belum ada jawaban yang selesai dianalisis di sesi ini.",
    });
  });

  it("reports a network failure without a status", async () => {
    expect(await loadReport(ID, false, fakeFetch(new TypeError("offline")).fetch)).toMatchObject({ ok: false, status: null });
  });
});

describe("report helpers", () => {
  it("estimates a wait without ever claiming it is done", () => {
    expect(estimate(0, 10_000)).toBe(0);
    expect(estimate(10_000, 10_000)).toBeCloseTo(0.632, 2);
    expect(estimate(10_000_000, 10_000)).toBe(0.95);
    expect(estimate(-5, 0)).toBe(0);
  });

  it("takes the filler target from the session language's band, else the shared one", () => {
    const band = (language: "any" | "id" | "en", ideal_high: unknown) =>
      ({ dimension: "fillers", language, metric: "fillers_per_minute", ideal_low: 0, ideal_high, zero_low: 0, zero_high: 20, version: "1" }) as Band;
    expect(fillerTarget([band("any", "1.3272")], "id")).toBe(1.3272);
    expect(fillerTarget([band("any", 1.3), band("en", 2)], "en")).toBe(2);
    expect(fillerTarget([band("any", 1.3), band("en", 2)], "id")).toBe(1.3);
    expect(fillerTarget([], "id")).toBeNull();
  });

  it("formats timecodes and decimals", () => {
    expect(timecode(0)).toBe("00:00");
    expect(timecode(72_900)).toBe("01:12");
    expect(timecode(-1)).toBe("00:00");
    expect(decimal(2.44)).toBe("2,4");
    expect(decimal(3)).toBe("3");
  });

  it("puts vocal fillers back and marks only the fillers", () => {
    const lines = transcriptLines(
      speech({
        // As the speech service sends it: no vocal filler in words, the lexical "anu" kept.
        words: [word("Saya", 0), word("anu", 800), word("senang.", 1200), word("Terima", 2000), word("kasih", 2400)],
        fillers: [
          { token: "[EEE]", startMs: 250, endMs: 900, kind: "vocal" },
          { token: "anu", startMs: 800, endMs: 1100, kind: "lexical" },
        ],
      }),
    );
    expect(lines.map((l) => l.atMs)).toEqual([0, 2000]);
    expect(lines[0].parts).toEqual([
      { text: "Saya", filler: false },
      { text: "eee", filler: true },
      { text: "anu", filler: true },
      { text: "senang.", filler: false },
    ]);
    expect(lines[1].parts.some((p) => p.filler)).toBe(false);
  });

  it("leads with the aspects that cost the most points, each with a next step", () => {
    const answers = [
      { scores: { content: 70, content_feedback: { strength: "", improvement: "Jawaban satu." } } },
      { scores: { content: 40, content_feedback: { strength: "", improvement: "Sebutkan hasilnya." } } },
      { scores: null },
    ] as unknown as ReportView["answers"];
    const report = {
      answers,
      dimensionScores: [
        { id: "smile", score: 0 }, // never counts (BR-09)
        { id: "pace", score: 100 },
        { id: "fillers", score: 30 }, // 0.125 * 70 = 8.75
        { id: "content", score: 55 }, // 0.25 * 45 = 11.25
        { id: "pauses", score: 80 },
        { id: "voice", score: 90 },
      ],
    };
    expect(focusAreas(report).map((a) => a.id)).toEqual(["content", "fillers", "pauses"]);
    expect(focusAreas(report)[0].nextStep).toBe("Sebutkan hasilnya."); // from the weakest answer
    expect(focusAreas(report)[1].nextStep).toContain("jeda satu napas");
    expect(strongest(report)).toEqual({ id: "pace", score: 100 });
  });

  it("has nothing to work on at full marks, and no strongest aspect among the weak ones", () => {
    expect(focusAreas({ answers: [], dimensionScores: [{ id: "pace", score: 100 }] })).toEqual([]);
    expect(strongest({ answers: [], dimensionScores: [{ id: "pace", score: 60 }] })).toBeNull();
    expect(strongest({ answers: [], dimensionScores: [] })).toBeNull();
    expect(focusAreas({ answers: [], dimensionScores: [{ id: "content", score: 50 }] })[0].nextStep).toContain("hasil yang bisa diukur");
  });

  it("every weighted aspect has a next step", () => {
    for (const { id, weight } of rubric.dimensions) {
      if (weight > 0) expect(focusAreas({ answers: [], dimensionScores: [{ id, score: 1 }] })[0].nextStep).not.toBe("");
    }
  });

  it("shows vocal fillers in words people read", () => {
    expect(fillerText("[EEE]")).toBe("eee");
    expect(fillerText("anu")).toBe("anu");
  });

  it("totals the session stats over answers with speech", () => {
    const answers = [
      {
        speechMetrics: speech({
          words: Array.from({ length: 60 }, (_, i) => word("a", i * 500)),
          fillers: [{ token: "eee", startMs: 0, endMs: 1, kind: "vocal" }],
          pauses: [
            { startMs: 0, endMs: 3000, long: true },
            { startMs: 5000, endMs: 5500, long: false },
          ],
        }),
      },
      { speechMetrics: speech({ speakingRateWps: 1, fillers: [{ token: "um", startMs: 0, endMs: 1, kind: "vocal" }] }) },
      { speechMetrics: null },
    ] as unknown as ReportView["answers"];
    expect(sessionStats(answers)).toEqual({ fillersPerMinute: 1, longPauses: 1, wordsPerMinute: 90 });
    expect(sessionStats([])).toEqual({ fillersPerMinute: null, longPauses: 0, wordsPerMinute: null });
  });
});
