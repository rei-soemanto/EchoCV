import type { InferenceSession } from "onnxruntime-web";
import { describe, expect, it } from "vitest";

import { letterboxFor } from "@/lib/vision/letterbox";
import { runYolo, type YoloModel } from "@/lib/vision/onnx";

function fakeModel(log: string[], failFirst = false): YoloModel {
  let active = 0;
  let calls = 0;
  const session = {
    run: async () => {
      calls += 1;
      active += 1;
      log.push(`start ${active}`);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      if (failFirst && calls === 1) throw new Error("gpu lost");
      return { out: { data: new Float32Array([1, 2]), dims: [1, 2] } };
    },
  } as unknown as InferenceSession;
  return { key: "pose", session, backend: "webgpu", inputName: "images", outputName: "out" };
}

const box = letterboxFor(64, 64, 64, 32);
const input = new Float32Array(3 * 64 * 64);

describe("runYolo", () => {
  it("never runs two sessions at the same time", async () => {
    const log: string[] = [];
    const model = fakeModel(log);
    await Promise.all([runYolo(model, input, box), runYolo(model, input, box), runYolo(model, input, box)]);
    expect(log).toEqual(["start 1", "start 1", "start 1"]);
  });

  it("keeps going after a failed run", async () => {
    const log: string[] = [];
    const model = fakeModel(log, true);
    const first = runYolo(model, input, box);
    const second = runYolo(model, input, box);
    await expect(first).rejects.toThrow("gpu lost");
    await expect(second).resolves.toMatchObject({ dims: [1, 2] });
  });
});
