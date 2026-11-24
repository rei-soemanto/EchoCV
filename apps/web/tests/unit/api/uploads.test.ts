import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseUploadRequest, parseVisualMetrics } from "@/lib/db/uploads";

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const QUESTION = "33333333-3333-4333-8333-333333333333";
const UPLOAD = "44444444-4444-4444-8444-444444444444";
const ANSWER = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let user: { id: string } | null;
let storedObjects: Set<string>;
let failSignUpload: boolean;

function table(name: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row = {};
  const rows = () => (db[name] ??= []);
  const run = () => {
    if (op === "insert") {
      const row = { id: crypto.randomUUID(), status: "pending", ...payload };
      rows().push(row);
      return [row];
    }
    const matched = rows().filter((row) => filters.every((f) => f(row)));
    if (op === "update") matched.forEach((row) => Object.assign(row, payload));
    if (op === "delete") db[name] = rows().filter((row) => !matched.includes(row));
    return matched;
  };
  const query = {
    select: () => query,
    insert: (value: Row) => ((op = "insert"), (payload = value), query),
    update: (value: Row) => ((op = "update"), (payload = value), query),
    delete: () => ((op = "delete"), query),
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), query),
    in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), query),
    single: async () => ({ data: run()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: run(), error: null }),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: table,
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) =>
          failSignUpload
            ? { data: null, error: { message: "failed" } }
            : { data: { signedUrl: `https://storage.test/upload/${bucket}/${path}`, token: "upload-token", path }, error: null },
        createSignedUrl: async (path: string, seconds: number) =>
          storedObjects.has(path)
            ? { data: { signedUrl: `https://storage.test/sign/${bucket}/${path}?expires=${seconds}` }, error: null }
            : { data: null, error: { message: "Object not found" } },
      }),
    },
  }),
}));

vi.mock("@/lib/db/speech", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/speech")>()),
  analyzeAnswer: vi.fn(),
}));

const { analyzeAnswer, SpeechServiceError } = await import("@/lib/db/speech");
const { POST: startUpload } = await import("@/app/api/uploads/route");
const { POST: completeUpload } = await import("@/app/api/uploads/[id]/complete/route");
const analyze = vi.mocked(analyzeAnswer);

const metrics = { answerIndex: 1, language: "en", transcript: "I built an API", words: [], fillers: [], pauses: [] };
const visual = { answerIndex: 1, durationMs: 60000, eyeContactPct: 72.5, smilePct: 10, events: [{ type: "touching_face", startMs: 1000, endMs: 2500 }] };

const start = (body: unknown) =>
  startUpload(new Request("http://app.test/api/uploads", { method: "POST", body: JSON.stringify(body) }));
const complete = (id: string, body: unknown = {}) =>
  completeUpload(new Request(`http://app.test/api/uploads/${id}/complete`, { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

function seedUploaded(status = "pending") {
  db.answers.push({ id: ANSWER, session_question_id: QUESTION, user_id: USER, status: "pending" });
  db.uploads = [{ id: UPLOAD, answer_id: ANSWER, storage_path: `${USER}/${SESSION}/${ANSWER}/a.webm`, status }];
  storedObjects.add(`${USER}/${SESSION}/${ANSWER}/a.webm`);
}

beforeEach(() => {
  user = { id: USER };
  failSignUpload = false;
  storedObjects = new Set();
  db = {
    practice_sessions: [{ id: SESSION, status: "in_progress", mode: "live", language: "en" }],
    session_questions: [{ id: QUESTION, session_id: SESSION, position: 1 }],
    answers: [],
    uploads: [],
  };
  analyze.mockReset();
});

describe("parseUploadRequest", () => {
  it.each([
    ["audio/webm;codecs=opus", "webm"],
    ["audio/ogg", "ogg"],
    ["AUDIO/MPEG", "mp3"],
    ["audio/wav", "wav"],
    ["audio/mp4", "m4a"],
  ])("accepts %s as .%s", (contentType, extension) => {
    expect(parseUploadRequest({ session_question_id: QUESTION, content_type: contentType })).toMatchObject({
      ok: true,
      value: { extension },
    });
  });

  it.each([
    { session_question_id: QUESTION, content_type: "video/mp4" },
    { session_question_id: QUESTION, content_type: "text/html" },
    { session_question_id: "abc", content_type: "audio/webm" },
    {},
    null,
  ])("rejects %j", (body) => {
    expect(parseUploadRequest(body).ok).toBe(false);
  });
});

describe("parseVisualMetrics", () => {
  it("accepts metrics that match the schema and the question", () => {
    expect(parseVisualMetrics(visual, 1)).toEqual({ ok: true, value: visual });
  });

  it("treats missing metrics as none", () => {
    expect(parseVisualMetrics(undefined, 1)).toEqual({ ok: true, value: null });
  });

  it.each([
    ["another question's metrics", { ...visual, answerIndex: 0 }],
    ["a percentage over 100", { ...visual, eyeContactPct: 101 }],
    ["a negative duration", { ...visual, durationMs: -1 }],
    ["an extra field such as raw video", { ...visual, frames: ["..."] }],
    ["an unknown behaviour", { ...visual, events: [{ type: "smiling", startMs: 0, endMs: 1 }] }],
    ["an event that ends before it starts", { ...visual, events: [{ type: "slouching", startMs: 5, endMs: 1 }] }],
    ["events that are not a list", { ...visual, events: "none" }],
  ])("rejects %s", (_name, value) => {
    expect(parseVisualMetrics(value, 1).ok).toBe(false);
  });
});

describe("POST /api/uploads", () => {
  it("creates the answer and an upload in the user's own folder and returns a signed upload URL", async () => {
    const response = await start({ session_question_id: QUESTION, content_type: "audio/webm;codecs=opus" });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.path).toMatch(new RegExp(`^${USER}/${SESSION}/${body.answer_id}/[0-9a-f-]{36}\\.webm$`));
    expect(body).toMatchObject({ bucket: "answer-audio", token: "upload-token", content_type: "audio/webm" });
    expect(db.answers).toHaveLength(1);
    expect(db.uploads[0]).toMatchObject({ kind: "audio", bucket: "answer-audio", storage_path: body.path, user_id: USER });
  });

  it("reuses the answer when the user records the same question again", async () => {
    await start({ session_question_id: QUESTION, content_type: "audio/webm" });
    const second = await (await start({ session_question_id: QUESTION, content_type: "audio/webm" })).json();
    expect(db.answers).toHaveLength(1);
    expect(db.uploads).toHaveLength(2);
    expect(second.answer_id).toBe(db.answers[0].id);
  });

  it("refuses an answer that is already analysed", async () => {
    db.answers.push({ id: ANSWER, session_question_id: QUESTION, status: "analyzed" });
    expect((await start({ session_question_id: QUESTION, content_type: "audio/webm" })).status).toBe(409);
  });

  it.each([
    ["finished", "live"],
    ["in_progress", "upload"],
  ])("refuses a %s session in %s mode", async (status, mode) => {
    db.practice_sessions[0] = { ...db.practice_sessions[0], status, mode };
    expect((await start({ session_question_id: QUESTION, content_type: "audio/webm" })).status).toBe(409);
    expect(db.uploads).toEqual([]);
  });

  it("answers 404 for a question the user cannot see", async () => {
    db.session_questions = [];
    expect((await start({ session_question_id: QUESTION, content_type: "audio/webm" })).status).toBe(404);
  });

  it("rejects a signed-out visitor and a bad request", async () => {
    expect((await start({ session_question_id: QUESTION, content_type: "video/mp4" })).status).toBe(400);
    user = null;
    expect((await start({ session_question_id: QUESTION, content_type: "audio/webm" })).status).toBe(401);
  });

  it("removes the upload record when storage cannot sign the URL", async () => {
    failSignUpload = true;
    expect((await start({ session_question_id: QUESTION, content_type: "audio/webm" })).status).toBe(500);
    expect(db.uploads).toEqual([]);
  });
});

describe("POST /api/uploads/[id]/complete", () => {
  it("sends a signed link to the speech service and saves speech and visual metrics", async () => {
    seedUploaded();
    analyze.mockResolvedValue(metrics as never);
    const response = await complete(UPLOAD, { visual_metrics: visual });
    expect(response.status).toBe(200);
    expect(analyze).toHaveBeenCalledWith(
      { audioUrl: `https://storage.test/sign/answer-audio/${USER}/${SESSION}/${ANSWER}/a.webm?expires=600` },
      "en",
      1,
    );
    expect(db.answers[0]).toMatchObject({
      status: "analyzed",
      speech_metrics: metrics,
      transcript: "I built an API",
      visual_metrics: visual,
    });
    expect(db.uploads[0].status).toBe("processed");
  });

  it("answers 409 when the file was never uploaded", async () => {
    seedUploaded();
    storedObjects.clear();
    expect((await complete(UPLOAD)).status).toBe(409);
    expect(analyze).not.toHaveBeenCalled();
    expect(db.uploads[0].status).toBe("pending");
  });

  it("keeps the upload ready for a retry when the speech service is busy", async () => {
    seedUploaded();
    analyze.mockRejectedValue(new SpeechServiceError("busy", 503, true));
    const response = await complete(UPLOAD);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ retryable: true });
    expect(db.uploads[0].status).toBe("uploaded");
    expect(db.answers[0].status).toBe("pending");
  });

  it("marks the answer failed when the recording cannot be analysed", async () => {
    seedUploaded();
    analyze.mockRejectedValue(new SpeechServiceError("bad audio", 422, false));
    expect((await complete(UPLOAD)).status).toBe(422);
    expect(db.uploads[0].status).toBe("failed");
    expect(db.answers[0].status).toBe("failed");
  });

  it.each(["processing", "processed", "deleted"])("refuses an upload that is %s", async (status) => {
    seedUploaded(status);
    expect((await complete(UPLOAD)).status).toBe(409);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("rejects visual metrics for another question before calling the speech service", async () => {
    seedUploaded();
    expect((await complete(UPLOAD, { visual_metrics: { ...visual, answerIndex: 0 } })).status).toBe(400);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("refuses when the session has ended", async () => {
    seedUploaded();
    db.practice_sessions[0].status = "cancelled";
    expect((await complete(UPLOAD)).status).toBe(409);
  });

  it("answers 404 for an unknown or malformed id and 401 when signed out", async () => {
    expect((await complete("not-a-uuid")).status).toBe(404);
    expect((await complete(UPLOAD)).status).toBe(404);
    user = null;
    expect((await complete(UPLOAD)).status).toBe(401);
  });
});
