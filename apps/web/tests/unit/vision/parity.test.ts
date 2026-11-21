import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { letterboxFor, type Letterbox } from "@/lib/vision/letterbox";
import { classIds, numClasses, visionManifest, type YoloModelKey } from "@/lib/vision/models";
import { createYoloModel, runYolo } from "@/lib/vision/onnx";
import { decodeYolo, iou, type Box } from "@/lib/vision/yolo";

const FIXTURES = resolve(__dirname, "../../../../../ml/data/browser_parity");
const MODELS = resolve(__dirname, "../../../public/models");
const KEYS: YoloModelKey[] = ["pose", "objects", "behaviour"];

type Fixture = {
  letterbox: Letterbox;
  conf: number;
  outputShape: number[];
  expected: { box: Box; cls: number; conf: number; keypoints?: number[][] }[];
};

function floats(path: string): Float32Array {
  const bytes = readFileSync(path);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function modelPath(key: YoloModelKey): string {
  return resolve(MODELS, visionManifest.models[key].file);
}

const ready = KEYS.every((k) => existsSync(resolve(FIXTURES, `${k}.json`)) && existsSync(modelPath(k)));

describe.skipIf(!ready)("ONNX Runtime Web matches Ultralytics on team frames", () => {
  for (const key of KEYS) {
    it(`runs and decodes ${key} like Ultralytics`, async () => {
      const fixture: Fixture = JSON.parse(readFileSync(resolve(FIXTURES, `${key}.json`), "utf8"));
      const model = visionManifest.models[key];
      const box = letterboxFor(
        fixture.letterbox.sourceWidth,
        fixture.letterbox.sourceHeight,
        model.inputSize,
        model.stride,
      );
      expect(box).toEqual(fixture.letterbox);

      const session = await createYoloModel(key, ["wasm"], readFileSync(modelPath(key)));
      const reference = floats(resolve(FIXTURES, `${key}.output.bin`));
      const { data, dims } = await runYolo(session, floats(resolve(FIXTURES, `${key}.input.bin`)), box);
      expect(Array.from(dims)).toEqual(fixture.outputShape);
      let maxDiff = 0;
      for (let i = 0; i < data.length; i++) maxDiff = Math.max(maxDiff, Math.abs(data[i] - reference[i]));
      expect(maxDiff).toBeLessThan(1e-2);

      const found = decodeYolo(data, dims, box, {
        numClasses: numClasses(key),
        numKeypoints: key === "pose" ? visionManifest.models.pose.keypoints : undefined,
        conf: fixture.conf,
        classIds: key === "objects" ? classIds("objects") : undefined,
      });
      expect(found.length).toBe(fixture.expected.length);
      for (const want of fixture.expected) {
        const match = found.find((d) => d.classId === want.cls && iou(d.box, want.box) > 0.99);
        expect(match, `class ${want.cls}`).toBeDefined();
        expect(Math.abs(match!.score - want.conf)).toBeLessThan(1e-3);
        want.keypoints?.forEach(([x, y, c], k) => {
          if (c < 0.5) return;
          const [mx, my] = match!.keypoints![k];
          expect(Math.abs(mx - x)).toBeLessThan(0.5);
          expect(Math.abs(my - y)).toBeLessThan(0.5);
        });
      }
    }, 60000);
  }
});
