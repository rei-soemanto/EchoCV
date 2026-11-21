import { describe, expect, it } from "vitest";

import { audioMimeType, captureError, meanLuma, micLevel } from "../../lib/media";

describe("captureError", () => {
  const err = (name: string) => Object.assign(new Error(name), { name });
  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "missing"],
    ["OverconstrainedError", "missing"],
    ["NotReadableError", "busy"],
    ["TypeError", "unsupported"],
    ["Weird", "error"],
  ])("%s -> %s", (name, kind) => expect(captureError(err(name))).toBe(kind));
  it("handles non-errors", () => expect(captureError("nope")).toBe("error"));
});

describe("micLevel", () => {
  it("is 0 for silence and empty input", () => {
    expect(micLevel(new Uint8Array(512).fill(128))).toBe(0);
    expect(micLevel(new Uint8Array())).toBe(0);
  });
  it("rises with loudness and caps at 1", () => {
    const quiet = Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 133 : 123));
    const loud = Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 255 : 0));
    expect(micLevel(quiet)).toBeGreaterThan(0);
    expect(micLevel(quiet)).toBeLessThan(micLevel(loud));
    expect(micLevel(loud)).toBe(1);
  });
});

describe("meanLuma", () => {
  it("weights channels like Rec. 601", () => {
    expect(meanLuma(new Uint8ClampedArray([255, 255, 255, 255]))).toBeCloseTo(255);
    expect(meanLuma(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]))).toBeCloseTo(127.5);
    expect(meanLuma(new Uint8ClampedArray([0, 255, 0, 255]))).toBeCloseTo(149.685);
  });
});

describe("audioMimeType", () => {
  it("prefers webm/opus, falls back to mp4 for Safari", () => {
    expect(audioMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(audioMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(audioMimeType(() => false)).toBeUndefined();
  });
});

describe("startAudioRecorder", () => {
  it("records only the audio tracks and joins the chunks on stop", async () => {
    const { startAudioRecorder } = await import("../../lib/media");
    const made: { tracks: string[]; options?: MediaRecorderOptions; timeslice?: number }[] = [];
    class FakeStream {
      constructor(public tracks: string[]) {}
      getAudioTracks() {
        return this.tracks.filter((t) => t.startsWith("audio"));
      }
    }
    class FakeRecorder {
      static isTypeSupported = (t: string) => t === "audio/webm;codecs=opus";
      mimeType = "audio/webm;codecs=opus";
      ondataavailable?: (e: { data: Blob }) => void;
      onstop?: () => void;
      constructor(stream: FakeStream, options?: MediaRecorderOptions) {
        made.push({ tracks: stream.tracks, options });
      }
      start(timeslice: number) {
        made[0].timeslice = timeslice;
      }
      stop() {
        this.ondataavailable?.({ data: new Blob(["ab"]) });
        this.ondataavailable?.({ data: new Blob([]) }); // empty chunks are dropped
        this.ondataavailable?.({ data: new Blob(["cd"]) });
        this.onstop?.();
      }
    }
    Object.assign(globalThis, { MediaStream: FakeStream, MediaRecorder: FakeRecorder });

    const rec = startAudioRecorder(new FakeStream(["audio-1", "video-1"]) as unknown as MediaStream);
    const blob = await rec.stop();

    expect(made).toEqual([
      { tracks: ["audio-1"], options: { mimeType: "audio/webm;codecs=opus" }, timeslice: 1000 },
    ]);
    expect(blob.type).toBe("audio/webm;codecs=opus");
    expect(await blob.text()).toBe("abcd");
  });
});
