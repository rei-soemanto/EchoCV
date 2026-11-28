import { describe, expect, it, vi } from "vitest";

import { completeUpload, submitAnswer, type UploadTicket } from "@/lib/practice/answer-upload";
import { formatClock, hintText, isGuideSeen, markGuideSeen } from "@/lib/practice/room";

const ticketBody = { upload_id: "u1", answer_id: "a1", bucket: "answer-audio", path: "me/s/q.webm", token: "t" };
const ticket: UploadTicket = { uploadId: "u1", bucket: "answer-audio", path: "me/s/q.webm", token: "t" };
const metrics = { answerIndex: 0, durationMs: 1000, eyeContactPct: 80, smilePct: 10, events: [] };
const audio = new Blob(["x"], { type: "audio/webm;codecs=opus" });

function reply(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; body: unknown }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift();
    if (!next || next instanceof Error) throw next ?? new Error("no more responses");
    return next;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const uploadOk = vi.fn(async () => ({ error: null }));

describe("submitAnswer", () => {
  it("asks for a link, uploads the audio, then completes with the metrics", async () => {
    const f = fakeFetch(reply(201, ticketBody), reply(200, { answer_id: "a1" }));
    const upload = vi.fn(async () => ({ error: null }));
    const result = await submitAnswer({ sessionQuestionId: "q1", audio, metrics }, upload, f.fetch);
    expect(result).toEqual({ ok: true });
    expect(f.calls[0]).toEqual({
      url: "/api/uploads",
      body: { session_question_id: "q1", content_type: "audio/webm;codecs=opus" },
    });
    expect(upload).toHaveBeenCalledWith(ticket, audio, "audio/webm;codecs=opus");
    expect(f.calls[1]).toEqual({ url: "/api/uploads/u1/complete", body: { visual_metrics: metrics } });
  });

  it("completes without visual metrics when the face model did not run", async () => {
    const f = fakeFetch(reply(201, ticketBody), reply(200));
    await submitAnswer({ sessionQuestionId: "q1", audio, metrics: null }, uploadOk, f.fetch);
    expect(f.calls[1].body).toEqual({});
  });

  it("offers a resend of the same audio when the network or storage fails", async () => {
    const offline = await submitAnswer({ sessionQuestionId: "q1", audio, metrics }, uploadOk, fakeFetch(new TypeError("offline")).fetch);
    expect(offline).toMatchObject({ ok: false, next: "retry" });
    expect(offline).not.toHaveProperty("ticket");

    const storage = await submitAnswer(
      { sessionQuestionId: "q1", audio, metrics },
      async () => ({ error: new Error("expired") }),
      fakeFetch(reply(201, ticketBody)).fetch,
    );
    expect(storage).toMatchObject({ ok: false, next: "retry" });
    expect(storage).not.toHaveProperty("ticket");
  });

  it("asks to record again when the API refuses the answer, with its message", async () => {
    const f = fakeFetch(reply(409, { error: "This answer is already analysed." }));
    const result = await submitAnswer({ sessionQuestionId: "q1", audio, metrics }, uploadOk, f.fetch);
    expect(result).toEqual({ ok: false, next: "rerecord", message: "This answer is already analysed." });
  });
});

describe("completeUpload", () => {
  it("keeps the ticket so a busy speech service can be retried", async () => {
    const result = await completeUpload(ticket, metrics, fakeFetch(reply(503, { retryable: true })).fetch);
    expect(result).toMatchObject({ ok: false, next: "retry", ticket });
  });

  it("asks to record again when the audio is unusable", async () => {
    const result = await completeUpload(ticket, metrics, fakeFetch(reply(422)).fetch);
    expect(result).toMatchObject({ ok: false, next: "rerecord" });
  });

  it("keeps the ticket when the network drops", async () => {
    const result = await completeUpload(ticket, metrics, fakeFetch(new TypeError("offline")).fetch);
    expect(result).toMatchObject({ ok: false, next: "retry", ticket });
  });
});

describe("room helpers", () => {
  it("formats the clock", () => {
    expect(formatClock(15_000)).toBe("00:15");
    expect(formatClock(14_001)).toBe("00:15");
    expect(formatClock(180_000)).toBe("03:00");
    expect(formatClock(-5)).toBe("00:00");
  });

  it("remembers that the guide was shown, and copes with blocked storage", () => {
    const data = new Map<string, string>();
    const storage = () =>
      ({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) }) as unknown as Storage;
    expect(isGuideSeen(storage)).toBe(false);
    markGuideSeen(storage);
    expect(isGuideSeen(storage)).toBe(true);
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(() => markGuideSeen(blocked)).not.toThrow();
    expect(isGuideSeen(blocked)).toBe(false);
  });

  it("puts the face hint before behaviour hints", () => {
    expect(hintText(null, [])).toEqual([]);
    const text = hintText("look_at_camera", ["slouching"]);
    expect(text).toHaveLength(2);
    expect(text[0]).toContain("lensa");
    expect(text[1]).toContain("tegak");
  });
});
