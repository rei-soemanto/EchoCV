import labels from "@echocv/shared/labels.json";
import rubric from "@echocv/shared/rubric.json";
import { describe, expect, it } from "vitest";

describe("shared rubric", () => {
  it("has weights that sum to 1", () => {
    const total = rubric.dimensions.reduce((sum, d) => sum + d.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("has unique dimension ids", () => {
    const ids = rubric.dimensions.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("shared labels", () => {
  it("lists the four behaviour classes the detector is trained on", () => {
    expect(labels.behaviourClasses).toEqual([
      "touching_face",
      "arms_crossed",
      "reading_notes",
      "slouching",
    ]);
  });
});
