import thresholds from "@echocv/shared/thresholds.json";
import { describe, expect, it } from "vitest";

import { BEHAVIOURS, BehaviourTracker, postureSettings, type PostureFrame } from "@/lib/vision/behaviour-tracker";
import type { FaceFeatures } from "@/lib/vision/face-features";
import {
  heldObject,
  mainPerson,
  postureBaseline,
  rawPostureFeatures,
  relativeFeatures,
  RollingMean,
  ruleProbability,
  type PostureBaseline,
  type PostureRule,
} from "@/lib/vision/posture-features";
import type { Detection, Keypoint } from "@/lib/vision/yolo";

import fixture from "./fixtures/posture-rules.json";

const ignored = postureSettings.ignoredObjectIds;
const num = (v: number | null) => (v === null ? NaN : v);

function rawFor(frame: (typeof fixture.frames)[number]) {
  const object = heldObject(frame.objects as Detection[], frame.face, fixture.height, fixture.width, ignored);
  return rawPostureFeatures(
    frame.face,
    frame.keypoints as Keypoint[],
    object,
    fixture.width,
    fixture.height,
    thresholds.posture.keypointConf,
  );
}

const baseline: PostureBaseline = {
  fx: fixture.baseline.fx,
  fy: fixture.baseline.fy,
  fw: fixture.baseline.fw,
  fh: fixture.baseline.fh,
  roll: fixture.baseline.roll,
  pitch: fixture.baseline.pitch,
  shoulderDropRaw: num(fixture.baseline.shoulder_drop_raw),
  shoulderWidthRaw: num(fixture.baseline.shoulder_width_raw),
};

describe("posture features match calib/inhouse_posture.py", () => {
  it.each(fixture.frames.map((f, i) => [i, f] as const))("frame %i raw features", (_, frame) => {
    const raw = rawFor(frame);
    for (const [name, expected] of Object.entries(frame.raw)) {
      if (expected === null) expect(raw[name], name).toBeNaN();
      else expect(raw[name], name).toBeCloseTo(expected, 6);
    }
  });

  it("builds the baseline as the median of the first two seconds", () => {
    const start = fixture.frames.filter((f) => f.timeMs <= thresholds.posture.baselineSeconds * 1000);
    const built = postureBaseline(start.map((f) => ({ face: f.face, raw: rawFor(f) })));
    for (const key of Object.keys(baseline) as (keyof PostureBaseline)[]) {
      expect(built[key], key).toBeCloseTo(baseline[key], 6);
    }
  });

  it.each(fixture.frames.map((f, i) => [i, f] as const))("frame %i relative features", (_, frame) => {
    const rel = relativeFeatures(frame.face, rawFor(frame), baseline);
    for (const [name, expected] of Object.entries(frame.relative)) {
      expect(rel[name], name).toBeCloseTo(num(expected), 6);
    }
  });

  it.each(Object.keys(fixture.probabilities))("%s smoothed probabilities", (name) => {
    const rule = thresholds.posture.behaviours[name as keyof typeof thresholds.posture.behaviours] as PostureRule;
    const window = new RollingMean(rule.smoothingFrames);
    const expected = fixture.probabilities[name as keyof typeof fixture.probabilities];
    fixture.frames.forEach((frame, i) => {
      const p = ruleProbability(rule, relativeFeatures(frame.face, rawFor(frame), baseline));
      expect(window.push(p)).toBeCloseTo(expected[i], 8);
    });
  });
});

describe("helpers", () => {
  it("picks the person with the largest area times confidence", () => {
    const small = { box: [0, 0, 10, 10], score: 0.9, classId: 0 } as Detection;
    const big = { box: [0, 0, 100, 100], score: 0.5, classId: 0 } as Detection;
    expect(mainPerson([small, big])).toBe(big);
    expect(mainPerson([])).toBeNull();
  });

  it("waits for a full window when asked", () => {
    const window = new RollingMean(3, 3);
    expect(window.push(1)).toBeNull();
    expect(window.push(0)).toBeNull();
    expect(window.push(1)).toBeCloseTo(2 / 3);
    expect(window.push(1)).toBeCloseTo(2 / 3);
    expect(window.push(1)).toBe(1);
  });

  it("ignores laptops when looking for a held object", () => {
    const laptop = { box: [0, 600, 100, 700], score: 0.9, classId: 63 } as Detection;
    const face = { fx: 0.5, fy: 0.3, fw: 0.2, fh: 0.3 };
    expect(heldObject([laptop], face, 720, 1280, ignored)).toEqual({ held: 0, area: 0 });
  });
});

const eyeBaseline = { yaw: 0, pitch: 0, irisX: 0, irisY: 0, smile: 0 };
const face: FaceFeatures = {
  yaw: 0,
  irisX: 0,
  irisY: 0,
  smile: 0,
  ...fixture.frames[0].face,
};

function frame(timeMs: number, overrides: Partial<PostureFrame> = {}): PostureFrame {
  const people = [{ box: [0, 0, 1280, 720], score: 0.9, classId: 0, keypoints: fixture.frames[0].keypoints } as Detection];
  return { timeMs, face, people, objects: [], behaviours: [], width: 1280, height: 720, ...overrides };
}

function readingNotes(score: number): Detection[] {
  return [{ box: [0, 0, 10, 10], score, classId: postureSettings.behaviourClassIds.reading_notes }];
}

describe("BehaviourTracker", () => {
  it("takes its posture baseline from the first two seconds of the answer", () => {
    const tracker = new BehaviourTracker(eyeBaseline);
    for (let t = 0; t < 2000; t += 200) tracker.add(frame(t));
    expect(tracker.postureBaseline).toBeNull();
    tracker.add(frame(2000));
    expect(tracker.postureBaseline?.fw).toBeCloseTo(face.fw, 6);
  });

  it("flags reading notes when the detector votes in enough of the last frames", () => {
    const tracker = new BehaviourTracker(eyeBaseline);
    const { smoothingFrames, conf } = thresholds.posture.detectorRule;
    for (let i = 0; i < smoothingFrames; i++) tracker.add(frame(i * 200, { behaviours: readingNotes(conf + 0.1) }));
    expect(tracker.active()).toContain("reading_notes");
  });

  it("does not flag reading notes for weak detections", () => {
    const tracker = new BehaviourTracker(eyeBaseline);
    for (let i = 0; i < 5; i++) tracker.add(frame(i * 200, { behaviours: readingNotes(0.1) }));
    expect(tracker.active()).not.toContain("reading_notes");
  });

  it("flags reading notes on the desk when the gaze stays down", () => {
    const tracker = new BehaviourTracker(eyeBaseline);
    const down = { ...face, pitch: thresholds.gazeDown.sign * (thresholds.gazeDown.angleDeg + 10) };
    const frames = postureSettings.gazeDown.frames;
    for (let i = 0; i < frames - 1; i++) tracker.add(frame(i * 200, { face: down }));
    expect(tracker.active()).not.toContain("reading_notes");
    tracker.add(frame((frames - 1) * 200, { face: down }));
    expect(tracker.active()).toContain("reading_notes");
  });

  it("turns flags into events relative to the start of the answer", () => {
    const tracker = new BehaviourTracker(eyeBaseline);
    const strong = readingNotes(0.9);
    let t = 1000;
    for (let i = 0; i < 5; i++, t += 200) tracker.add(frame(t));
    for (let i = 0; i < 6; i++, t += 200) tracker.add(frame(t, { behaviours: strong }));
    for (let i = 0; i < 6; i++, t += 200) tracker.add(frame(t));
    const events = tracker.events().filter((e) => e.type === "reading_notes");
    expect(events).toHaveLength(1);
    expect(events[0].startMs).toBeGreaterThanOrEqual(1000);
    expect(events[0].endMs).toBeGreaterThan(events[0].startMs);
    expect(events[0].endMs).toBeLessThanOrEqual(t - 1000);
  });

  it("closes events still open at the end of the answer", () => {
    const tracker = new BehaviourTracker(eyeBaseline);
    for (let i = 0; i < 4; i++) tracker.add(frame(i * 200, { behaviours: readingNotes(0.9) }));
    const [event] = tracker.events(1000);
    expect(event).toEqual({ type: "reading_notes", startMs: 0, endMs: 1000 });
  });

  it("only reports the four behaviour classes from shared/labels.json", () => {
    expect(BEHAVIOURS).toEqual(["touching_face", "arms_crossed", "reading_notes", "slouching"]);
    expect(Object.keys(postureSettings.behaviourClassIds).sort()).toEqual([...BEHAVIOURS].sort());
  });
});
