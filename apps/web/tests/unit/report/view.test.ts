import { describe, expect, it, vi } from "vitest";

import type { SpeechMetrics } from "@/lib/db/speech";
import { decimal, loadReport, sessionStats, timecode, transcriptLines, type ReportView } from "@/lib/report/view";

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
    const result = await loadReport(ID, f.fetch);
    expect(result).toMatchObject({ ok: true, report: { overallScore: 70 } });
    expect(f.calls).toEqual([{ url: `/api/reports?session_id=${ID}`, method: "GET" }]);
  });

  it("builds the report first when none is saved yet", async () => {
    const f = fakeFetch(reply(404), reply(201), reply(200, { overallScore: 70, answers: [] }));
    const result = await loadReport(ID, f.fetch);
    expect(result.ok).toBe(true);
    expect(f.calls.map((c) => c.method)).toEqual(["GET", "POST", "GET"]);
  });

  it("passes on the API's reason when the report cannot be built", async () => {
    const f = fakeFetch(reply(404), reply(409, { error: "No analysed answers in this session yet." }));
    expect(await loadReport(ID, f.fetch)).toEqual({
      ok: false,
      status: 409,
      message: "No analysed answers in this session yet.",
    });
  });

  it("reports a network failure without a status", async () => {
    expect(await loadReport(ID, fakeFetch(new TypeError("offline")).fetch)).toMatchObject({ ok: false, status: null });
  });
});

describe("report helpers", () => {
  it("formats timecodes and decimals", () => {
    expect(timecode(0)).toBe("00:00");
    expect(timecode(72_900)).toBe("01:12");
    expect(timecode(-1)).toBe("00:00");
    expect(decimal(2.44)).toBe("2,4");
    expect(decimal(3)).toBe("3");
  });

  it("splits sentences and marks fillers", () => {
    const lines = transcriptLines(
      speech({
        words: [word("Saya", 0), word("eee", 400), word("senang.", 800), word("Terima", 2000), word("kasih", 2400)],
        fillers: [{ token: "eee", startMs: 450, endMs: 600, kind: "vocal" }],
      }),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0].atMs).toBe(0);
    expect(lines[0].parts.map((p) => p.filler)).toEqual([false, true, false]);
    expect(lines[1]).toMatchObject({ atMs: 2000, parts: [{ text: "Terima" }, { text: "kasih" }] });
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
      { speechMetrics: speech({ fillers: [{ token: "um", startMs: 0, endMs: 1, kind: "vocal" }] }) },
      { speechMetrics: null },
    ] as unknown as ReportView["answers"];
    expect(sessionStats(answers)).toEqual({ fillersPerMinute: 1, longPauses: 1, wordsPerMinute: 60 });
    expect(sessionStats([])).toEqual({ fillersPerMinute: null, longPauses: 0, wordsPerMinute: null });
  });
});
