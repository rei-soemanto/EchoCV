import { describe, expect, it, vi } from "vitest";

import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, type FailureReason } from "@/lib/db/uploads";
import { finishSession } from "@/lib/practice/finish-session";
import {
  durationProblem,
  failureReasonMessage,
  fetchRecentUploads,
  parseFailureReason,
  sendVideo,
  summarizeRecentUploads,
  uploadCheck,
  uploadStatus,
  videoProblem,
  videoType,
  type RecentUpload,
} from "@/lib/practice/video-upload";

const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; body?: unknown }[] = [];
  const fn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift();
    if (!next || next instanceof Error) throw next ?? new Error("no more responses");
    return next;
  };
  return { fetch: fn as typeof fetch, calls };
}

const ticket = reply.bind(null, 201, { upload_id: "u1", signed_url: "https://storage/x" });
const input = { sessionQuestionId: "q1", contentType: "video/mp4", sizeBytes: 10, seconds: 60 };
const stored = vi.fn(async () => 200);

describe("file checks", () => {
  it("takes the type from the file, or from its name when the browser gives none", () => {
    expect(videoType({ type: "video/webm;codecs=vp9", name: "a" })).toBe("video/webm");
    expect(videoType({ type: "", name: "Jawaban.MOV" })).toBe("video/quicktime");
    expect(videoType({ type: "audio/mpeg", name: "a.mp4" })).toBeNull();
    expect(videoType({ type: "", name: "tanpa-akhiran" })).toBeNull();
  });

  it("allows exactly the size and length limits in shared/speech.json, not more", () => {
    const file = { type: "video/mp4", name: "a.mp4", size: MAX_VIDEO_BYTES };
    expect(videoProblem(file)).toBeNull();
    expect(videoProblem({ ...file, size: file.size + 1 })).toContain(`${MAX_VIDEO_BYTES / 1024 / 1024} MB`);
    expect(videoProblem({ ...file, size: 0 })).toContain("kosong");
    expect(videoProblem({ ...file, type: "image/png" })).toContain("MP4");
    expect(durationProblem(MAX_VIDEO_SECONDS)).toBeNull();
    expect(durationProblem(MAX_VIDEO_SECONDS + 0.1)).toContain(`${MAX_VIDEO_SECONDS / 60} menit`);
    expect(durationProblem(null)).toContain("tidak bisa dibaca");
    expect(durationProblem(0)).toContain("tidak bisa dibaca");
  });
});

describe("sendVideo", () => {
  it("asks for a link, uploads, then starts the analysis", async () => {
    const f = fakeFetch(ticket(), reply(202));
    const put = vi.fn(async () => 200);
    expect(await sendVideo(input, put, f.fetch)).toEqual({ ok: true, uploadId: "u1" });
    expect(f.calls[0]).toEqual({
      url: "/api/uploads",
      body: { session_question_id: "q1", content_type: "video/mp4", size_bytes: 10, duration_seconds: 60 },
    });
    expect(put).toHaveBeenCalledWith("https://storage/x");
    expect(f.calls[1].url).toBe("/api/uploads/u1/complete");
  });

  it("starts over when the upload itself fails", async () => {
    const result = await sendVideo(input, async () => 0, fakeFetch(ticket()).fetch);
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty("uploadId");
  });

  it("keeps the stored video when only starting the analysis failed, and does not upload it twice", async () => {
    const failed = fakeFetch(ticket(), new TypeError("offline"), new TypeError("offline"));
    expect(await sendVideo(input, stored, failed.fetch)).toMatchObject({ ok: false, uploadId: "u1" });

    const put = vi.fn(async () => 200);
    const retry = fakeFetch(reply(202));
    expect(await sendVideo({ ...input, uploadId: "u1" }, put, retry.fetch)).toEqual({ ok: true, uploadId: "u1" });
    expect(put).not.toHaveBeenCalled();
  });

  it("notices the analysis started although the reply was lost", async () => {
    const f = fakeFetch(ticket(), new TypeError("dropped"), reply(200, { status: "processing", answer_status: "pending" }));
    expect(await sendVideo(input, stored, f.fetch)).toEqual({ ok: true, uploadId: "u1" });
  });

  it("does not offer the same video again when the API refuses it", async () => {
    const f = fakeFetch(ticket(), reply(409), reply(200, { status: "pending", answer_status: "pending" }));
    const result = await sendVideo(input, stored, f.fetch);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("sudah selesai") });
    expect(result).not.toHaveProperty("uploadId");
  });
});

describe("specific send errors", () => {
  it.each([
    [401, "Masuk lagi"],
    [400, "MP4, MOV atau WEBM"],
    [404, "tidak ditemukan"],
    [409, "sudah selesai"],
    [500, "bermasalah"],
  ])("says what the API refused with %i", async (status, text) => {
    const result = await sendVideo(input, stored, fakeFetch(reply(status)).fetch);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining(text) });
  });

  it.each([
    [0, "Koneksi terputus"],
    [413, "terlalu besar"],
    [400, "kedaluwarsa"],
    [403, "kedaluwarsa"],
    [500, "tidak bisa disimpan"],
  ])("says why storage refused the video with %i", async (status, text) => {
    const result = await sendVideo(input, async () => status, fakeFetch(ticket()).fetch);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining(text) });
  });

  it("keeps the stored video when the speech service is busy, and asks for a new video when it is unreadable", async () => {
    const pending = reply.bind(null, 200, { status: "uploaded", answer_status: "pending" });
    const busy = await sendVideo(input, stored, fakeFetch(ticket(), reply(503), pending()).fetch);
    expect(busy).toMatchObject({ ok: false, uploadId: "u1", message: expect.stringContaining("sibuk") });
    const unreadable = await sendVideo(input, stored, fakeFetch(ticket(), reply(422), pending()).fetch);
    expect(unreadable).toMatchObject({ ok: false, message: expect.stringContaining("tidak bisa dianalisis") });
    expect(unreadable).not.toHaveProperty("uploadId");
  });
});

describe("uploadStatus", () => {
  it.each([
    [{ status: "processing", answer_status: "pending" }, "processing"],
    [{ status: "processing", answer_status: "failed" }, "processing"],
    [{ status: "processed", answer_status: "analyzed" }, "done"],
    [{ status: "deleted", answer_status: "analyzed" }, "done"],
    [{ status: "deleted", answer_status: "pending" }, "failed"],
    [{ status: "failed", answer_status: "failed" }, "failed"],
    [{ status: "pending", answer_status: "pending" }, "waiting"],
  ])("reads %j as %s", async (body, expected) => {
    expect(await uploadStatus("u1", fakeFetch(reply(200, body)).fetch)).toBe(expected);
  });

  it("is unknown when it cannot be read", async () => {
    expect(await uploadStatus("u1", fakeFetch(new TypeError("offline")).fetch)).toBeNull();
    expect(await uploadStatus("u1", fakeFetch(reply(500)).fetch)).toBeNull();
  });
});

describe("failure reasons and uploadCheck", () => {
  it.each<FailureReason>(["timeout", "service_unavailable", "unreadable", "too_large", "server"])(
    "parses valid failure reason %s",
    (reason) => {
      expect(parseFailureReason(reason)).toBe(reason);
    },
  );

  it.each([null, undefined, "", "unknown", 123, {}])("rejects invalid failure reason %j", (value) => {
    expect(parseFailureReason(value)).toBeNull();
  });

  it.each<[FailureReason | null, string]>([
    ["timeout", "terlalu lama"],
    ["service_unavailable", "sedang sibuk"],
    ["unreadable", "tidak bisa dianalisis"],
    ["too_large", "terlalu besar"],
    ["server", "Server EchoCV mengalami kendala"],
    [null, "Analisis gagal dan tidak dihitung"],
  ])("formats specific message for %s", (reason, snippet) => {
    const text = failureReasonMessage(reason);
    expect(text).toContain("tidak dihitung");
    expect(text).toContain(snippet);
  });

  it("returns status and failureReason from uploadCheck", async () => {
    expect(
      await uploadCheck(
        "u1",
        fakeFetch(reply(200, { status: "failed", answer_status: "failed", failure_reason: "timeout" })).fetch,
      ),
    ).toEqual({ status: "failed", failureReason: "timeout" });
    expect(
      await uploadCheck(
        "u1",
        fakeFetch(reply(200, { status: "processed", answer_status: "analyzed", failure_reason: "bad" })).fetch,
      ),
    ).toEqual({ status: "done", failureReason: null });
    expect(await uploadCheck("u1", fakeFetch(new Response("not json", { status: 200 })).fetch)).toBeNull();
    expect(await uploadCheck("u1", fakeFetch(reply(500)).fetch)).toBeNull();
  });
});

describe("fetchRecentUploads and summarizeRecentUploads", () => {
  it("normalizes recent uploads and skips invalid entries", async () => {
    const f = fakeFetch(
      reply(200, {
        uploads: [
          {
            upload_id: "u1",
            answer_id: "a1",
            session_id: "s1",
            status: "failed",
            failure_reason: "unreadable",
            created_at: "2026-11-28T03:00:00Z",
          },
          {
            upload_id: "u2",
            answer_id: 99,
            session_id: "s2",
            status: "processing",
            failure_reason: "invalid",
            created_at: "2026-11-28T02:00:00Z",
          },
          { upload_id: "", session_id: "s3", status: "failed" },
          { upload_id: "u4", session_id: "", status: "failed" },
          null,
        ],
      }),
    );
    expect(await fetchRecentUploads(f.fetch)).toEqual([
      {
        upload_id: "u1",
        answer_id: "a1",
        session_id: "s1",
        status: "failed",
        failure_reason: "unreadable",
        created_at: "2026-11-28T03:00:00Z",
      },
      {
        upload_id: "u2",
        answer_id: "",
        session_id: "s2",
        status: "processing",
        failure_reason: null,
        created_at: "2026-11-28T02:00:00Z",
      },
    ]);
  });

  it("returns empty array when recent uploads cannot be fetched or parsed", async () => {
    expect(await fetchRecentUploads(fakeFetch(new TypeError("offline")).fetch)).toEqual([]);
    expect(await fetchRecentUploads(fakeFetch(reply(401)).fetch)).toEqual([]);
    expect(await fetchRecentUploads(fakeFetch(reply(200, { uploads: "bad" })).fetch)).toEqual([]);
    expect(await fetchRecentUploads(fakeFetch(new Response("bad", { status: 200 })).fetch)).toEqual([]);
  });

  it("summarizes sessions newest-first with processing, failed and processed rules", () => {
    const uploads: RecentUpload[] = [
      {
        upload_id: "u-old-fail",
        answer_id: "a1",
        session_id: "s-proc",
        status: "failed",
        failure_reason: "server",
        created_at: "2026-11-28T01:00:00Z",
      },
      {
        upload_id: "u-proc",
        answer_id: "a2",
        session_id: "s-proc",
        status: "processing",
        failure_reason: null,
        created_at: "2026-11-28T04:00:00Z",
      },
      {
        upload_id: "u-fail-null",
        answer_id: "a3",
        session_id: "s-fail",
        status: "failed",
        failure_reason: null,
        created_at: "2026-11-28T03:30:00Z",
      },
      {
        upload_id: "u-fail-reason",
        answer_id: "a4",
        session_id: "s-fail",
        status: "failed",
        failure_reason: "too_large",
        created_at: "2026-11-28T02:30:00Z",
      },
      {
        upload_id: "u-done",
        answer_id: "a5",
        session_id: "s-done",
        status: "processed",
        failure_reason: null,
        created_at: "2026-11-28T02:00:00Z",
      },
    ];

    expect(summarizeRecentUploads(uploads)).toEqual([
      {
        sessionId: "s-proc",
        status: "processing",
        processingCount: 1,
        failedCount: 1,
        failureReason: null,
        createdAt: "2026-11-28T04:00:00Z",
      },
      {
        sessionId: "s-fail",
        status: "failed",
        processingCount: 0,
        failedCount: 2,
        failureReason: "too_large",
        createdAt: "2026-11-28T03:30:00Z",
      },
      {
        sessionId: "s-done",
        status: "processed",
        processingCount: 0,
        failedCount: 0,
        failureReason: null,
        createdAt: "2026-11-28T02:00:00Z",
      },
    ]);
  });
});

it("treats an already finished session as finished", async () => {
  expect(await finishSession("s1", fakeFetch(reply(409)).fetch)).toBe(true);
  expect(await finishSession("s1", fakeFetch(reply(500)).fetch)).toBe(false);
  expect(await finishSession("s1", fakeFetch(new TypeError("offline")).fetch)).toBe(false);
});
