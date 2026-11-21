import labels from "@echocv/shared/labels.json";
import { describe, expect, it } from "vitest";

import { backendOrder } from "@/lib/vision/onnx";
import { classIds, numClasses, visionManifest } from "@/lib/vision/models";

describe("vision model manifest", () => {
  it("lists the behaviour classes in the order of labels.json", () => {
    expect(Object.values(visionManifest.models.behaviour.classes)).toEqual(labels.behaviourClasses);
    expect(numClasses("behaviour")).toBe(labels.behaviourClasses.length);
  });

  it("uses the COCO phone, book and laptop classes for objects", () => {
    expect(classIds("objects").sort((a, b) => a - b)).toEqual([63, 67, 73]);
    expect(numClasses("objects")).toBe(80);
  });

  it("has one person class with 17 keypoints for pose", () => {
    expect(numClasses("pose")).toBe(1);
    expect(visionManifest.models.pose.keypoints).toBe(17);
  });

  it("pins the browser runtimes", () => {
    expect(visionManifest.runtimes.onnxruntimeWeb).toMatch(/^\d+\.\d+\.\d+$/);
    expect(visionManifest.runtimes.mediapipeTasksVision).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("backendOrder", () => {
  it("tries WebGPU first and falls back to WASM on the CPU", () => {
    expect(backendOrder(true)).toEqual(["webgpu", "wasm"]);
    expect(backendOrder(false)).toEqual(["wasm"]);
  });
});
