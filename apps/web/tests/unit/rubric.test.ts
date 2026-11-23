import labels from "@echocv/shared/labels.json";
import rubric from "@echocv/shared/rubric.json";
import session from "@echocv/shared/session.json";
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

  it("keeps smile out of the overall score (BR-09)", () => {
    const smile = rubric.dimensions.find((d) => d.id === "smile");
    expect(smile?.weight).toBe(0);
  });
});

describe("shared session config", () => {
  it("has whole positive counts and limits", () => {
    for (const value of [
      session.questionsPerSession,
      session.quickStartQuestions,
      session.prepSeconds,
      session.maxAnswerSeconds,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("asks fewer quick start questions than a full session", () => {
    expect(session.quickStartQuestions).toBeLessThan(session.questionsPerSession);
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
