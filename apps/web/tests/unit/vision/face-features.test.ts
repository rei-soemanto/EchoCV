import { describe, expect, it } from "vitest";

import { gazeError } from "@/lib/vision/eye-contact";
import { faceFeatures, headAngles, irisOffsets, largestFace, smileScore } from "@/lib/vision/face-features";

import fixture from "./fixtures/face-rules.json";

const points = (raw: number[][]) => raw.map(([x, y]) => ({ x, y }));

describe("face features match calib/rules.py", () => {
  it.each(fixture.cases.map((c, i) => [i, c] as const))("case %i head angles from both matrix layouts", (_, c) => {
    for (const matrix of [c.matrixColumnMajor, c.matrixRowMajor]) {
      const angles = headAngles(matrix);
      expect(angles.yaw).toBeCloseTo(c.expected.yaw, 5);
      expect(angles.pitch).toBeCloseTo(c.expected.pitch, 5);
      expect(angles.roll).toBeCloseTo(c.expected.roll, 5);
    }
  });

  it.each(fixture.cases.map((c, i) => [i, c] as const))("case %i iris offsets", (_, c) => {
    const offsets = irisOffsets(points(c.points));
    expect(offsets.irisX).toBeCloseTo(c.expected.irisX, 6);
    expect(offsets.irisY).toBeCloseTo(c.expected.irisY, 6);
  });

  it.each(fixture.cases.map((c, i) => [i, c] as const))("case %i gaze error", (_, c) => {
    const features = { ...c.expected, smile: 0 };
    const baseline = { ...c.baseline, smile: 0 };
    const rules = { kX: fixture.kX, kY: fixture.kY, toleranceDeg: 9, smileThreshold: 0.2 };
    expect(gazeError(features, baseline, rules)).toBeCloseTo(c.expected.gazeError, 4);
  });
});

describe("faceFeatures", () => {
  const c = fixture.cases[1];
  const width = 640;
  const height = 480;
  const normalised = c.points.map(([x, y]) => ({ x: x / width, y: y / height }));
  const blendshapes = [
    { categoryName: "mouthSmileLeft", score: 0.4 },
    { categoryName: "mouthSmileRight", score: 0.6 },
  ];

  it("scales landmarks to pixels and reads the smile blendshapes", () => {
    const features = faceFeatures({
      landmarks: [normalised],
      matrices: [c.matrixColumnMajor],
      blendshapes: [blendshapes],
      width,
      height,
    });
    expect(features?.yaw).toBeCloseTo(c.expected.yaw, 5);
    expect(features?.irisX).toBeCloseTo(c.expected.irisX, 5);
    expect(features?.smile).toBeCloseTo(0.5, 6);
  });

  it("returns null when there is no face", () => {
    expect(faceFeatures({ landmarks: [], matrices: [], blendshapes: [], width, height })).toBeNull();
  });

  it("follows the largest face when two are visible", () => {
    const small = normalised.map((p) => ({ x: 0.9 + p.x * 0.05, y: 0.9 + p.y * 0.05 }));
    expect(largestFace([small, normalised])).toBe(1);
  });

  it("treats missing smile blendshapes as zero", () => {
    expect(smileScore([])).toBe(0);
  });
});
