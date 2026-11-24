import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let user: { id: string } | null;
let removed: string[];

function table(name: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "update" | "upsert" = "select";
  let payload: Row = {};
  const rows = () => (db[name] ??= []);
  const run = () => {
    if (op === "upsert") {
      const existing = rows().find((row) => row.session_id === payload.session_id);
      if (existing) Object.assign(existing, payload);
      else rows().push({ ...payload });
      return [];
    }
    const matched = rows().filter((row) => filters.every((f) => f(row)));
    if (op === "update") matched.forEach((row) => Object.assign(row, payload));
    return matched;
  };
  const query = {
    select: () => query,
    update: (value: Row) => ((op = "update"), (payload = value), query),
    upsert: (value: Row) => ((op = "upsert"), (payload = value), query),
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), query),
    neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), query),
    in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), query),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: run(), error: null }),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: table,
    storage: { from: () => ({ remove: async (paths: string[]) => (removed.push(...paths), { data: [], error: null }) }) },
  }),
}));

vi.mock("@/lib/llm/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/gemini")>()),
  scoreContent: vi.fn(),
}));

const { scoreContent } = await import("@/lib/llm/gemini");
const { GET, POST } = await import("@/app/api/reports/route");
const llm = vi.mocked(scoreContent);

const words = ["I", "built", "the", "payments", "API"].map((text, i) => ({ text, startMs: i * 300, endMs: i * 300 + 250, language: "en" }));
const speech = {
  answerIndex: 0,
  language: "en",
  durationMs: 60000,
  speechMs: 50000,
  transcript: "I built the payments API",
  words,
  fillers: [{ token: "uh", startMs: 1000, endMs: 1200, kind: "vocal" }],
  pauses: [],
  speakingRateWps: 2.4,
  syllablesPerSecond: 3.67,
  prosody: { pitchMeanHz: 180, pitchStdHz: 30, volumeMeanDb: -20 },
};
const visual = { answerIndex: 0, durationMs: 60000, eyeContactPct: 80, smilePct: 30, events: [] };
const band = (dimension: string, metric: string, low: number, high: number, zeroLow: number, zeroHigh: number, language = "any") => ({
  dimension, language, metric, ideal_low: String(low), ideal_high: String(high), zero_low: String(zeroLow), zero_high: String(zeroHigh), version: "0.1.0",
});

const post = (body: unknown) => POST(new Request("http://app.test/api/reports", { method: "POST", body: JSON.stringify(body) }));
const get = (sessionId: string) => GET(new Request(`http://app.test/api/reports?session_id=${sessionId}`));

beforeEach(() => {
  user = { id: USER };
  removed = [];
  llm.mockReset();
  llm.mockResolvedValue({ star: 60, relevance: 90, clarity: 90, strength: "Clear result.", improvement: "Describe the situation first." });
  db = {
    practice_sessions: [{ id: SESSION, status: "finished", language: "en" }],
    session_questions: [
      { id: "q0", session_id: SESSION, position: 0, question_text: "Tell me about yourself" },
      { id: "q1", session_id: SESSION, position: 1, question_text: "Describe a challenge" },
    ],
    answers: [
      { id: "a0", session_question_id: "q0", status: "analyzed", speech_metrics: speech, visual_metrics: visual, scores: null, content_status: "pending", transcript: speech.transcript },
      { id: "a1", session_question_id: "q1", status: "failed", speech_metrics: null, visual_metrics: null, scores: null, content_status: "pending" },
    ],
    uploads: [
      { id: "u0", answer_id: "a0", bucket: "answer-audio", storage_path: `${USER}/${SESSION}/a0/x.webm`, status: "processed" },
      { id: "u1", answer_id: "a0", bucket: "answer-audio", storage_path: `${USER}/${SESSION}/a0/old.webm`, status: "deleted" },
    ],
    consents: [{ user_id: USER, analysis: true, model_training: false, hr_rater_sharing: false }],
    scoring_bands: [
      band("eye_contact", "eye_contact_pct", 60, 100, 10, 100),
      band("smile", "smile_pct", 10, 100, 0, 100),
      band("fillers", "fillers_per_minute", 0, 3, 0, 12),
      band("pace", "pace_deviation", 0, 0, 0, 0.35),
      band("voice", "pitch_variation", 0.15, 10, 0.05, 10),
    ],
    reports: [],
  };
});

describe("POST /api/reports", () => {
  it("scores the analysed answers, saves the report and versions, and deletes the audio (BR-05)", async () => {
    const response = await post({ session_id: SESSION });
    expect(response.status).toBe(201);
    const report = await response.json();
    expect(report.contentStatus).toBe("scored");
    expect(report.dimensionScores).toContainEqual({ id: "content", score: 80 });
    expect(llm).toHaveBeenCalledWith("Tell me about yourself", "I built the payments API", "en");
    expect(llm).toHaveBeenCalledTimes(1);

    expect(db.reports[0]).toMatchObject({ session_id: SESSION, user_id: USER, overall_score: report.overallScore, rubric_version: "0.2.0" });
    expect(db.reports[0].model_versions).toMatchObject({ scoring_bands: "0.1.0" });
    expect(db.answers[0]).toMatchObject({ content_status: "scored", rubric_version: "0.2.0" });
    expect(db.answers[0].scores).toMatchObject({ content: 80, content_feedback: { improvement: "Describe the situation first." } });

    expect(removed).toEqual([`${USER}/${SESSION}/a0/x.webm`]);
    expect(db.uploads[0]).toMatchObject({ status: "deleted" });
  });

  it.each([["model_training"], ["hr_rater_sharing"]])("keeps the audio when the user opted in to %s", async (consent) => {
    db.consents[0][consent] = true;
    expect((await post({ session_id: SESSION })).status).toBe(201);
    expect(removed).toEqual([]);
    expect(db.uploads[0].status).toBe("processed");
  });

  it("saves delivery scores and marks content pending when the LLM is down (UC-06 E1)", async () => {
    llm.mockRejectedValue(new Error("down"));
    const report = await (await post({ session_id: SESSION })).json();
    expect(report.contentStatus).toBe("pending");
    expect(report.dimensionScores.some((d: { id: string }) => d.id === "content")).toBe(false);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(db.answers[0].content_status).toBe("pending");
  });

  it("retries only the pending content on the next call and reuses scored content", async () => {
    llm.mockRejectedValueOnce(new Error("down"));
    await post({ session_id: SESSION });
    const retried = await (await post({ session_id: SESSION })).json();
    expect(retried.contentStatus).toBe("scored");
    expect(llm).toHaveBeenCalledTimes(2);
    await post({ session_id: SESSION });
    expect(llm).toHaveBeenCalledTimes(2);
    expect(db.reports).toHaveLength(1);
  });

  it("gives a near-silent answer a content score of 0 without calling the LLM", async () => {
    db.answers[0].speech_metrics = { ...speech, words: words.slice(0, 2), transcript: "I built" };
    const report = await (await post({ session_id: SESSION })).json();
    expect(llm).not.toHaveBeenCalled();
    expect(report.dimensionScores).toContainEqual({ id: "content", score: 0 });
  });

  it("refuses a session that is not finished", async () => {
    db.practice_sessions[0].status = "in_progress";
    expect((await post({ session_id: SESSION })).status).toBe(409);
  });

  it("refuses a session without analysed answers", async () => {
    db.answers = db.answers.map((answer) => ({ ...answer, status: "failed" }));
    expect((await post({ session_id: SESSION })).status).toBe(409);
  });

  it("explains when the scoring bands are missing", async () => {
    db.scoring_bands = [];
    expect((await post({ session_id: SESSION })).status).toBe(500);
  });

  it("answers 400, 401 and 404 for bad ids, signed-out visitors and unknown sessions", async () => {
    expect((await post({ session_id: "nope" })).status).toBe(400);
    expect((await post({ session_id: "33333333-3333-4333-8333-333333333333" })).status).toBe(404);
    user = null;
    expect((await post({ session_id: SESSION })).status).toBe(401);
  });
});

describe("GET /api/reports", () => {
  it("returns the saved report with each question's transcript and status", async () => {
    await post({ session_id: SESSION });
    const response = await get(SESSION);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ sessionId: SESSION, rubricVersion: "0.2.0", contentStatus: "scored" });
    expect(body.answers).toEqual([
      expect.objectContaining({ answerIndex: 0, question: "Tell me about yourself", status: "analyzed", transcript: "I built the payments API" }),
      expect.objectContaining({ answerIndex: 1, status: "failed", transcript: null }),
    ]);
  });

  it("answers 404 before the report exists, 400 for a bad id and 401 when signed out", async () => {
    expect((await get(SESSION)).status).toBe(404);
    expect((await get("nope")).status).toBe(400);
    user = null;
    expect((await get(SESSION)).status).toBe(401);
  });
});
