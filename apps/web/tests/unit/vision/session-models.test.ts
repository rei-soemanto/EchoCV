import { describe, expect, it, vi } from "vitest";

import type { FaceModel } from "@/lib/vision/face";
import type { PostureModels } from "@/lib/vision/pose-loop";
import { sessionModelLoader } from "@/lib/vision/session-models";

const face = { delegate: "CPU" } as unknown as FaceModel;
const posture = { pose: {}, objects: {}, behaviour: {} } as unknown as PostureModels;

describe("sessionModelLoader", () => {
  it("creates each model once, however often it is asked for", async () => {
    const makeFace = vi.fn(async () => face);
    const makePosture = vi.fn(async () => posture);
    const loader = sessionModelLoader({ face: makeFace, posture: makePosture });
    loader.preload();
    await loader.all();
    await loader.face();
    expect(makeFace).toHaveBeenCalledTimes(1);
    expect(makePosture).toHaveBeenCalledTimes(1);
  });

  it("starts the posture models without waiting for the face model", () => {
    let finishFace: (model: FaceModel) => void = () => undefined;
    const makePosture = vi.fn(async () => posture);
    const loader = sessionModelLoader({
      face: () => new Promise<FaceModel>((resolve) => (finishFace = resolve)),
      posture: makePosture,
    });
    void loader.all();
    expect(makePosture).toHaveBeenCalledTimes(1);
    finishFace(face);
  });

  it("tries again after a failed load", async () => {
    const makeFace = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(face);
    const loader = sessionModelLoader({ face: makeFace, posture: async () => posture });
    await expect(loader.face()).rejects.toThrow("offline");
    await expect(loader.face()).resolves.toBe(face);
    expect(makeFace).toHaveBeenCalledTimes(2);
  });

  it("opens the room with whatever loaded when one model fails", async () => {
    const loader = sessionModelLoader({
      face: async () => face,
      posture: () => Promise.reject(new Error("no webgpu")),
    });
    await expect(loader.all()).resolves.toEqual({ face, posture: null });
  });
});
