import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, parseUploadRequest, parseVisualMetrics } from "@/lib/db/uploads";

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
let removed: string[];
let pendingAfter: (() => Promise<unknown>)[];

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => Promise<unknown>) => {
    pendingAfter.push(callback);
  },
}));

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
    neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), query),
    order: () => query,
    limit: () => query,
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
        remove: async (paths: string[]) => (removed.push(...paths), { data: [], error: null }),
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
  analyzeVideo: vi.fn(),
}));

const { analyzeAnswer, analyzeVideo, SpeechServiceError } = await import("@/lib/db/speech");
const { POST: startUpload, GET: listUploads } = await import("@/app/api/uploads/route");
const { POST: completeUpload } = await import("@/app/api/uploads/[id]/complete/route");
const { GET: uploadStatus } = await import("@/app/api/uploads/[id]/route");
const analyze = vi.mocked(analyzeAnswer);
const analyzeVid = vi.mocked(analyzeVideo);

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
  removed = [];
  pendingAfter = [];
  storedObjects = new Set();
  db = {
    practice_sessions: [{ id: SESSION, status: "in_progress", mode: "live", language: "en" }],
    session_questions: [{ id: QUESTION, session_id: SESSION, position: 1 }],
    answers: [],
    uploads: [],
  };
  analyze.mockReset();
  analyzeVid.mockReset();
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

const status = (id: string) =>
  uploadStatus(new Request(`http://app.test/api/uploads/${id}`), { params: Promise.resolve({ id }) });
const video = { session_question_id: QUESTION, content_type: "video/mp4", size_bytes: 40_000_000, duration_seconds: 95 };
const runAfter = async () => {
  for (const callback of pendingAfter.splice(0)) await callback();
};

describe("video uploads (upload mode)", () => {
  beforeEach(() => {
    db.practice_sessions[0].mode = "upload";
  });

  function seedVideo() {
    db.answers.push({ id: ANSWER, session_question_id: QUESTION, user_id: USER, status: "pending" });
    db.uploads = [{ id: UPLOAD, answer_id: ANSWER, kind: "video", storage_path: `${USER}/${SESSION}/${ANSWER}/v.mp4`, status: "pending", deleted_at: null }];
    storedObjects.add(`${USER}/${SESSION}/${ANSWER}/v.mp4`);
  }

  it.each([
    ["video/mp4", "mp4"],
    ["video/quicktime", "mov"],
    ["video/webm", "webm"],
  ])("accepts %s within the limits", (contentType, extension) => {
    expect(parseUploadRequest({ ...video, content_type: contentType })).toMatchObject({ ok: true, value: { kind: "video", extension } });
  });

  it.each([
    ["a missing size", { size_bytes: undefined }],
    ["a size over the limit", { size_bytes: MAX_VIDEO_BYTES + 1 }],
    ["a missing duration", { duration_seconds: undefined }],
    ["a video over the length limit", { duration_seconds: MAX_VIDEO_SECONDS + 1 }],
    ["a negative duration", { duration_seconds: -3 }],
  ])("rejects %s", (_name, change) => {
    expect(parseUploadRequest({ ...video, ...change }).ok).toBe(false);
  });

  it("gives a signed upload URL into the private video bucket", async () => {
    const response = await start(video);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ bucket: "answer-videos", kind: "video" });
    expect(body.path).toMatch(/\.mp4$/);
    expect(db.uploads[0]).toMatchObject({ kind: "video", bucket: "answer-videos" });
  });

  it("refuses a video in a live session and audio in an upload session (BR-25)", async () => {
    expect((await start({ session_question_id: QUESTION, content_type: "audio/webm" })).status).toBe(409);
    db.practice_sessions[0].mode = "live";
    expect((await start(video)).status).toBe(409);
  });

  it("answers 202 at once, analyses in the background, saves both metrics and deletes the video (BR-05)", async () => {
    seedVideo();
    const visual = { answerIndex: 1, durationMs: 90000, eyeContactPct: 55, smilePct: 5, events: [] };
    analyzeVid.mockResolvedValue({ speech: { transcript: "hello there" }, visual, baseline: "answer_start" } as never);

    const response = await complete(UPLOAD);
    expect(response.status).toBe(202);
    expect(await (await status(UPLOAD)).json()).toMatchObject({ status: "processing", counted: false, file_deleted: false });
    expect(analyzeVid).not.toHaveBeenCalled();

    await runAfter();
    expect(analyzeVid).toHaveBeenCalledWith(
      { videoUrl: `https://storage.test/sign/answer-videos/${USER}/${SESSION}/${ANSWER}/v.mp4?expires=1800` },
      "en",
      1,
      { timeoutMs: 270_000, attempts: 1 },
    );
    expect(db.answers[0]).toMatchObject({ status: "analyzed", transcript: "hello there", visual_metrics: visual });
    expect(db.uploads[0].failure_reason).toBeNull();
    expect(removed).toEqual([`${USER}/${SESSION}/${ANSWER}/v.mp4`]);
    expect(await (await status(UPLOAD)).json()).toMatchObject({ status: "processed", answer_status: "analyzed", counted: true, file_deleted: true });
  });

  it("marks a failed analysis as not counted and still deletes the video (UC-05)", async () => {
    seedVideo();
    analyzeVid.mockRejectedValue(new SpeechServiceError("too long", 413, false));
    await complete(UPLOAD);
    await runAfter();
    expect(await (await status(UPLOAD)).json()).toMatchObject({ status: "failed", answer_status: "failed", counted: false, file_deleted: true });
    expect(removed).toHaveLength(1);
  });

  it.each([
    ["too_large", new SpeechServiceError("too big", 413, false)],
    ["unreadable", new SpeechServiceError("no speech", 422, false)],
    ["timeout", new SpeechServiceError("The speech service did not answer in time.", null, true)],
    ["service_unavailable", new SpeechServiceError("The speech service could not be reached.", null, true)],
    ["service_unavailable", new SpeechServiceError("busy", 503, true)],
    ["server", new Error("boom")],
  ])("tells the page why the analysis failed: %s", async (reason, error) => {
    seedVideo();
    analyzeVid.mockRejectedValue(error);
    await complete(UPLOAD);
    await runAfter();
    expect(await (await status(UPLOAD)).json()).toMatchObject({ status: "failed", failure_reason: reason });
  });

  it("clears an old failure reason when the analysis is tried again", async () => {
    seedVideo();
    db.uploads[0].status = "failed";
    db.uploads[0].failure_reason = "service_unavailable";
    expect((await complete(UPLOAD)).status).toBe(202);
    expect(db.uploads[0]).toMatchObject({ status: "processing", failure_reason: null });
  });

  it("stops an analysis that has been processing too long, so the page is not stuck (UC-05)", async () => {
    seedVideo();
    db.uploads[0].status = "processing";
    db.uploads[0].updated_at = new Date(Date.now() - 7 * 60_000).toISOString();
    expect(await (await status(UPLOAD)).json()).toMatchObject({ status: "failed", failure_reason: "timeout", answer_status: "failed", counted: false });
  });

  it("leaves a recent analysis running", async () => {
    seedVideo();
    db.uploads[0].status = "processing";
    db.uploads[0].updated_at = new Date(Date.now() - 60_000).toISOString();
    expect(await (await status(UPLOAD)).json()).toMatchObject({ status: "processing", answer_status: "pending" });
  });

  it("rejects visual metrics from the service that belong to another answer", async () => {
    seedVideo();
    analyzeVid.mockResolvedValue({ speech: { transcript: "x" }, visual: { answerIndex: 0, durationMs: 1, eyeContactPct: 1, smilePct: 1, events: [] }, baseline: "answer_start" } as never);
    await complete(UPLOAD);
    await runAfter();
    expect(db.answers[0].status).toBe("failed");
  });

  it("refuses to start a second analysis while one is running", async () => {
    seedVideo();
    analyzeVid.mockResolvedValue({ speech: { transcript: "x" }, visual: { answerIndex: 1, durationMs: 1, eyeContactPct: 1, smilePct: 1, events: [] }, baseline: "answer_start" } as never);
    expect((await complete(UPLOAD)).status).toBe(202);
    expect((await complete(UPLOAD)).status).toBe(409);
  });
});

describe("GET /api/uploads/[id]", () => {
  it("answers 404 for unknown ids and 401 when signed out", async () => {
    expect((await status("bad")).status).toBe(404);
    expect((await status(UPLOAD)).status).toBe(404);
    user = null;
    expect((await status(UPLOAD)).status).toBe(401);
  });
});

describe("GET /api/uploads", () => {
  it("lists the user's sent videos with their session so the page can pick them up again", async () => {
    db.uploads = [
      { id: UPLOAD, answer_id: ANSWER, kind: "video", storage_path: `${USER}/${SESSION}/${ANSWER}/v.mp4`, status: "processing", failure_reason: null, created_at: "2026-11-28T01:00:00Z" },
      { id: "x", answer_id: ANSWER, kind: "video", storage_path: `${USER}/${SESSION}/${ANSWER}/w.mp4`, status: "pending", failure_reason: null, created_at: "2026-11-28T00:00:00Z" },
      { id: "y", answer_id: ANSWER, kind: "audio", storage_path: `${USER}/${SESSION}/${ANSWER}/a.webm`, status: "processed", failure_reason: null, created_at: "2026-11-28T00:00:00Z" },
    ];
    const response = await listUploads();
    expect(await response.json()).toEqual({
      uploads: [{ upload_id: UPLOAD, answer_id: ANSWER, session_id: SESSION, status: "processing", failure_reason: null, created_at: "2026-11-28T01:00:00Z" }],
    });
  });

  it("rejects a signed-out visitor", async () => {
    user = null;
    expect((await listUploads()).status).toBe(401);
  });
});
