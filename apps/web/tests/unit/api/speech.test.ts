import schema from "../../../../../shared/schemas/speech-metrics.schema.json";
import { describe, expect, it, vi } from "vitest";
import { analyzeAnswer, analyzeVideo, SPEECH_METRICS_KEYS, SpeechServiceError, type SpeechMetrics } from "@/lib/db/speech";

const metrics: SpeechMetrics = {
  answerIndex: 1,
  language: "id",
  durationMs: 4000,
  speechMs: 3000,
  transcript: "eee saya backend developer",
  words: [{ text: "saya", startMs: 600, endMs: 900, language: "id" }],
  fillers: [{ token: "eee", startMs: 0, endMs: 500, kind: "vocal" }],
  pauses: [{ startMs: 900, endMs: 1600, long: false }],
  speakingRateWps: 1.2,
  syllablesPerSecond: 3.1,
  prosody: { pitchMeanHz: 180, pitchStdHz: 20, volumeMeanDb: -22 },
};

const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
const options = { baseUrl: "http://speech.test", backoffMs: 0 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeFetch(...replies: (Response | Error)[]) {
  return vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("no more replies");
    if (reply instanceof Error) throw reply;
    return reply;
  });
}

describe("speech metrics contract", () => {
  it("matches the required fields of the shared schema", () => {
    expect([...SPEECH_METRICS_KEYS].sort()).toEqual([...schema.required].sort());
    expect(Object.keys(metrics).sort()).toEqual(Object.keys(schema.properties).sort());
  });
});

describe("analyzeAnswer", () => {
  it("posts the audio, language and answer index as a form and returns the metrics", async () => {
    const fetchImpl = fakeFetch(json(metrics));
    await expect(analyzeAnswer(audio, "id", 1, { ...options, fetchImpl })).resolves.toEqual(metrics);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("http://speech.test/analyze");
    const form = init?.body as FormData;
    expect(form.get("language")).toBe("id");
    expect(form.get("answerIndex")).toBe("1");
    expect(form.get("audio")).toBeInstanceOf(Blob);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends a signed storage link instead of the file", async () => {
    const fetchImpl = fakeFetch(json(metrics));
    await analyzeAnswer({ audioUrl: "https://project.supabase.co/a.webm" }, "id", 1, { ...options, fetchImpl });
    const form = fetchImpl.mock.calls[0][1]?.body as FormData;
    expect(form.get("audioUrl")).toBe("https://project.supabase.co/a.webm");
    expect(form.has("audio")).toBe(false);
  });

  it("sends the service key only when one is set", async () => {
    const fetchImpl = fakeFetch(json(metrics), json(metrics));
    await analyzeAnswer(audio, "id", 1, { ...options, serviceKey: "secret", fetchImpl });
    await analyzeAnswer(audio, "id", 1, { ...options, serviceKey: undefined, fetchImpl });
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("X-Speech-Key")).toBe("secret");
    expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).has("X-Speech-Key")).toBe(false);
  });

  it("does not retry a wrong service key", async () => {
    const fetchImpl = fakeFetch(json({ detail: "The service key is missing or wrong" }, 401));
    await expect(analyzeAnswer(audio, "id", 1, { ...options, fetchImpl })).rejects.toMatchObject({ status: 401, retryable: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries when the service is busy or unreachable, then succeeds", async () => {
    const fetchImpl = fakeFetch(new TypeError("fetch failed"), json({ detail: "busy" }, 503), json(metrics));
    await expect(analyzeAnswer(audio, "id", 1, { ...options, fetchImpl })).resolves.toEqual(metrics);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last attempt", async () => {
    const fetchImpl = fakeFetch(json({}, 500), json({}, 502), json({}, 504));
    await expect(analyzeAnswer(audio, "id", 1, { ...options, fetchImpl })).rejects.toMatchObject({
      status: 504,
      retryable: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it.each([413, 422])("does not retry a %i from the service", async (status) => {
    const fetchImpl = fakeFetch(json({ detail: "bad audio" }, status));
    await expect(analyzeAnswer(audio, "id", 1, { ...options, fetchImpl })).rejects.toMatchObject({
      status,
      retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats a timeout as retryable", async () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    const fetchImpl = fakeFetch(timeout, timeout);
    const error = await analyzeAnswer(audio, "id", 1, { ...options, attempts: 2, fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(SpeechServiceError);
    expect(error.message).toMatch(/in time/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("aborts a request that runs past the timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    );
    await expect(
      analyzeAnswer(audio, "id", 1, { ...options, attempts: 1, timeoutMs: 10, fetchImpl }),
    ).rejects.toThrow(/in time/);
  });

  it.each([
    ["a missing field", { ...metrics, prosody: undefined }],
    ["another answer's metrics", { ...metrics, answerIndex: 2 }],
    ["the wrong language", { ...metrics, language: "en" }],
    ["not an object", "ok"],
  ])("rejects %s without retrying", async (_name, body) => {
    const fetchImpl = fakeFetch(json(JSON.parse(JSON.stringify(body))));
    await expect(analyzeAnswer(audio, "id", 1, { ...options, fetchImpl })).rejects.toMatchObject({ retryable: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("needs SPEECH_SERVICE_URL when no base URL is given", async () => {
    vi.stubEnv("SPEECH_SERVICE_URL", "");
    await expect(analyzeAnswer(audio, "id", 1, { fetchImpl: fakeFetch() })).rejects.toThrow(/SPEECH_SERVICE_URL/);
    vi.unstubAllEnvs();
  });
});

describe("analyzeVideo", () => {
  const visual = { answerIndex: 1, durationMs: 4000, eyeContactPct: 50, smilePct: 0, events: [] };

  it("posts the signed video link to /analyze-video and returns speech and visual metrics", async () => {
    const fetchImpl = fakeFetch(json({ speech: metrics, visual, baseline: "answer_start" }));
    const result = await analyzeVideo({ videoUrl: "https://project.supabase.co/v.mp4" }, "id", 1, { ...options, fetchImpl });
    expect(result).toEqual({ speech: metrics, visual, baseline: "answer_start" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("http://speech.test/analyze-video");
    const form = init?.body as FormData;
    expect(form.get("videoUrl")).toBe("https://project.supabase.co/v.mp4");
    expect(form.has("audioUrl")).toBe(false);
  });

  it.each([
    ["visual metrics for another answer", { speech: metrics, visual: { ...visual, answerIndex: 0 }, baseline: "answer_start" }],
    ["no visual metrics", { speech: metrics, baseline: "answer_start" }],
    ["another baseline", { speech: metrics, visual, baseline: "calibration" }],
  ])("rejects %s", async (_name, body) => {
    const fetchImpl = fakeFetch(json(body));
    await expect(analyzeVideo({ videoUrl: "https://x/v.mp4" }, "id", 1, { ...options, fetchImpl })).rejects.toMatchObject({ retryable: false });
  });

  it("tries at most twice by default because a video can take as long as it plays", async () => {
    const fetchImpl = fakeFetch(json({}, 503), json({}, 503), json({}, 503));
    await expect(analyzeVideo({ videoUrl: "https://x/v.mp4" }, "id", 1, { ...options, fetchImpl })).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
