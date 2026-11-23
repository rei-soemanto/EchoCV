import session from "@echocv/shared/session.json";
import thresholds from "@echocv/shared/thresholds.json";
import { describe, expect, it } from "vitest";

import { AnswerTracker } from "@/lib/vision/answer-tracker";
import { Calibration } from "@/lib/vision/calibration";
import { buildBaseline, faceRules, isEyeContact, isSmiling, median } from "@/lib/vision/eye-contact";
import type { FaceFeatures } from "@/lib/vision/face-features";

const looking: FaceFeatures = { yaw: 2, pitch: -3, roll: 0, irisX: 0.01, irisY: 0.02, smile: 0.05 };
const away: FaceFeatures = { ...looking, yaw: looking.yaw + 30 };
const smiling: FaceFeatures = { ...looking, smile: looking.smile + thresholds.smile.threshold + 0.05 };
const baseline = buildBaseline([looking]);

describe("rules from shared/thresholds.json", () => {
  it("uses the calibrated constants", () => {
    expect(faceRules.kX).toBe(thresholds.eyeContact.kX);
    expect(faceRules.toleranceDeg).toBe(thresholds.eyeContact.toleranceDeg);
    expect(faceRules.smileThreshold).toBe(thresholds.smile.threshold);
  });

  it("counts looking at the calibrated pose as eye contact and turning away as not", () => {
    expect(isEyeContact(looking, baseline)).toBe(true);
    expect(isEyeContact(away, baseline)).toBe(false);
  });

  it("measures the smile against the calibration baseline", () => {
    expect(isSmiling(looking, baseline)).toBe(false);
    expect(isSmiling(smiling, baseline)).toBe(true);
  });

  it("takes the median of the calibration samples", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(buildBaseline([looking, away, looking]).yaw).toBe(looking.yaw);
  });
});

describe("Calibration", () => {
  const settings = { durationMs: 5000, minFaceFraction: 0.6 };

  it("reads the calibration length from shared/session.json", () => {
    expect(new Calibration().progress).toBe(0);
    expect(session.calibrationSeconds).toBe(5);
  });

  it("finishes after the calibration time and returns a baseline", () => {
    const calibration = new Calibration(settings);
    for (let t = 0; t <= 5000; t += 100) calibration.add(looking, t);
    expect(calibration.done).toBe(true);
    const result = calibration.result();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.baseline.yaw).toBe(looking.yaw);
  });

  it("fails when the face was missing for too much of the calibration", () => {
    const calibration = new Calibration(settings);
    for (let t = 0; t <= 5000; t += 100) calibration.add(t % 300 === 0 ? looking : null, t);
    expect(calibration.result()).toMatchObject({ ok: false, reason: "face_not_found" });
  });

  it("ignores frames after it is done", () => {
    const calibration = new Calibration(settings);
    for (let t = 0; t <= 5000; t += 100) calibration.add(looking, t);
    calibration.add(away, 5100);
    const result = calibration.result();
    if (result.ok) expect(result.baseline.yaw).toBe(looking.yaw);
  });
});

describe("AnswerTracker", () => {
  const hints = { windowMs: 3000, minFaceFraction: 0.5, minEyeContactFraction: 0.4 };

  it("counts frames without a face as no eye contact", () => {
    const tracker = new AnswerTracker(baseline, faceRules, hints);
    tracker.add(looking, 0);
    tracker.add(looking, 100);
    tracker.add(null, 200);
    tracker.add(away, 300);
    const metrics = tracker.metrics(2, 400);
    expect(metrics).toEqual({ answerIndex: 2, durationMs: 400, eyeContactPct: 50, smilePct: 0, events: [] });
  });

  it("reports the smile share as feedback", () => {
    const tracker = new AnswerTracker(baseline, faceRules, hints);
    tracker.add(smiling, 0);
    tracker.add(looking, 100);
    expect(tracker.metrics(0).smilePct).toBe(50);
  });

  it("gives no hint before the hint window has passed", () => {
    const tracker = new AnswerTracker(baseline, faceRules, hints);
    for (let t = 0; t < 2000; t += 100) tracker.add(null, t);
    expect(tracker.hint()).toBeNull();
  });

  it("asks to come back into the frame when the face is missing", () => {
    const tracker = new AnswerTracker(baseline, faceRules, hints);
    for (let t = 0; t <= 4000; t += 100) tracker.add(t < 1000 ? looking : null, t);
    expect(tracker.hint()).toBe("face_not_visible");
  });

  it("asks to look at the camera when the gaze stays away", () => {
    const tracker = new AnswerTracker(baseline, faceRules, hints);
    for (let t = 0; t <= 4000; t += 100) tracker.add(t < 1000 ? looking : away, t);
    expect(tracker.hint()).toBe("look_at_camera");
  });

  it("clears the hint once eye contact is back", () => {
    const tracker = new AnswerTracker(baseline, faceRules, hints);
    for (let t = 0; t <= 8000; t += 100) tracker.add(t < 4000 ? away : looking, t);
    expect(tracker.hint()).toBeNull();
  });

  it("uses the tracked time when no duration is given", () => {
    const tracker = new AnswerTracker(baseline, faceRules, hints);
    tracker.add(looking, 1000);
    tracker.add(looking, 3500);
    expect(tracker.metrics(0).durationMs).toBe(2500);
  });
});
