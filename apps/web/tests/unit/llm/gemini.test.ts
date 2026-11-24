import { describe, expect, it, vi } from "vitest";
import { contentPrompt, LlmError, scoreContent } from "@/lib/llm/gemini";

const result = { star: 70, relevance: 85, clarity: 60, strength: "Kamu menyebut hasil yang jelas.", improvement: "Sebutkan tugasmu di awal." };
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof body === "string" ? body : JSON.stringify(body) }] } }] }), { status });
const options = { apiKey: "test-key", model: "gemini-test", backoffMs: 0 };

function fakeFetch(...replies: (Response | Error)[]) {
  return vi.fn<typeof fetch>(async () => {
    const next = replies.shift();
    if (!next) throw new Error("no more replies");
    if (next instanceof Error) throw next;
    return next;
  });
}

describe("contentPrompt", () => {
  it("asks for feedback in the session language and protects mixing (BR-27)", () => {
    const prompt = contentPrompt("Ceritakan tentang dirimu", "saya backend developer", "id");
    expect(prompt).toContain("Write strength and improvement in Indonesian");
    expect(prompt).toContain("Mixing Indonesian and English words never lowers star or relevance");
    expect(prompt).toContain('Answer transcript: """saya backend developer"""');
  });
});

describe("scoreContent", () => {
  it("calls the model with the key in a header and returns the scores", async () => {
    const fetchImpl = fakeFetch(reply(result));
    await expect(scoreContent("Q", "an answer", "id", { ...options, fetchImpl })).resolves.toEqual(result);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    expect(String(url)).not.toContain("test-key");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("test-key");
    const body = JSON.parse(init?.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents[0].parts[0].text).toContain("an answer");
  });

  it("retries once when the model is busy", async () => {
    const fetchImpl = fakeFetch(new Response("{}", { status: 503 }), reply(result));
    await expect(scoreContent("Q", "a", "en", { ...options, fetchImpl })).resolves.toEqual(result);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a rejected key", async () => {
    const fetchImpl = fakeFetch(new Response("{}", { status: 403 }));
    await expect(scoreContent("Q", "a", "en", { ...options, fetchImpl })).rejects.toMatchObject({ retryable: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a score over 100", { ...result, star: 140 }],
    ["a missing improvement", { ...result, improvement: "" }],
    ["text that is not JSON", "Great answer!"],
  ])("rejects %s", async (_name, body) => {
    const fetchImpl = fakeFetch(reply(body), reply(body));
    await expect(scoreContent("Q", "a", "en", { ...options, fetchImpl })).rejects.toBeInstanceOf(LlmError);
  });

  it("treats a network failure as retryable and gives up after the last attempt", async () => {
    const fetchImpl = fakeFetch(new TypeError("fetch failed"), new TypeError("fetch failed"));
    await expect(scoreContent("Q", "a", "en", { ...options, fetchImpl })).rejects.toMatchObject({ retryable: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("needs LLM_API_KEY when no key is given", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    await expect(scoreContent("Q", "a", "en", { fetchImpl: fakeFetch() })).rejects.toThrow(/LLM_API_KEY/);
    vi.unstubAllEnvs();
  });
});
