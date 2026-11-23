import thresholds from "@echocv/shared/thresholds.json";

import type { BehaviourEvent, BehaviourType } from "./answer-tracker";
import type { Baseline } from "./eye-contact";
import type { FaceFeatures } from "./face-features";
import { classIds, visionManifest } from "./models";
import {
  heldObject,
  mainPerson,
  postureBaseline,
  rawPostureFeatures,
  relativeFeatures,
  RollingMean,
  ruleProbability,
  type FeatureMap,
  type PostureBaseline,
  type PostureFace,
  type PostureRule,
} from "./posture-features";
import type { Detection } from "./yolo";

export type PostureFrame = {
  timeMs: number;
  face: FaceFeatures | null;
  people: Detection[];
  objects: Detection[];
  behaviours: Detection[];
  width: number;
  height: number;
};

export type BehaviourSource = "pose_rule" | "detector";

export type PostureSettings = {
  baselineMs: number;
  keypointConf: number;
  rules: Record<BehaviourType, PostureRule & { source: BehaviourSource }>;
  detector: { conf: number; smoothingFrames: number; minFraction: number };
  gazeDown: { angleDeg: number; frames: number; minFraction: number; kY: number; sign: number };
  behaviourClassIds: Record<BehaviourType, number>;
  ignoredObjectIds: ReadonlySet<number>;
};

export const BEHAVIOURS: BehaviourType[] = ["touching_face", "arms_crossed", "reading_notes", "slouching"];

const posture = thresholds.posture;

function behaviourClassIds(): Record<BehaviourType, number> {
  const entries = Object.entries(visionManifest.models.behaviour.classes).map(([id, name]) => [name, Number(id)]);
  return Object.fromEntries(entries) as Record<BehaviourType, number>;
}

function ignoredObjects(): ReadonlySet<number> {
  const names = visionManifest.models.objects.classes as Record<string, string>;
  return new Set(classIds("objects").filter((id) => names[String(id)] === "laptop"));
}

export const postureSettings: PostureSettings = {
  baselineMs: posture.baselineSeconds * 1000,
  keypointConf: posture.keypointConf,
  rules: posture.behaviours as PostureSettings["rules"],
  detector: posture.detectorRule,
  gazeDown: {
    angleDeg: thresholds.gazeDown.angleDeg,
    frames: Math.max(1, Math.round(thresholds.gazeDown.windowS * posture.sampleFps)),
    minFraction: thresholds.gazeDown.minFraction,
    kY: thresholds.gazeDown.kY,
    sign: thresholds.gazeDown.sign,
  },
  behaviourClassIds: behaviourClassIds(),
  ignoredObjectIds: ignoredObjects(),
};

function postureFace(face: FaceFeatures): PostureFace {
  return { fx: face.fx, fy: face.fy, fw: face.fw, fh: face.fh, roll: face.roll, pitch: face.pitch };
}

export class BehaviourTracker {
  private readonly eyeBaseline: Baseline;
  private readonly settings: PostureSettings;
  private readonly ruleWindows: Map<BehaviourType, RollingMean>;
  private readonly detectorWindows: Map<BehaviourType, RollingMean>;
  private readonly gazeDownWindow: RollingMean;
  private readonly baselineSamples: { face: PostureFace; raw: FeatureMap }[] = [];
  private readonly flags = new Map<BehaviourType, boolean>();
  private readonly openSince = new Map<BehaviourType, number>();
  private readonly closed: BehaviourEvent[] = [];
  private baseline: PostureBaseline | null = null;
  private startMs: number | null = null;
  private lastMs = 0;

  constructor(eyeBaseline: Baseline, settings: PostureSettings = postureSettings) {
    this.eyeBaseline = eyeBaseline;
    this.settings = settings;
    this.ruleWindows = new Map(BEHAVIOURS.map((b) => [b, new RollingMean(settings.rules[b].smoothingFrames)]));
    this.detectorWindows = new Map(BEHAVIOURS.map((b) => [b, new RollingMean(settings.detector.smoothingFrames)]));
    this.gazeDownWindow = new RollingMean(settings.gazeDown.frames, settings.gazeDown.frames);
  }

  get postureBaseline(): PostureBaseline | null {
    return this.baseline;
  }

  add(frame: PostureFrame): BehaviourType[] {
    this.startMs ??= frame.timeMs;
    this.lastMs = frame.timeMs;
    const detectorFlags = this.detectorFlags(frame.behaviours);
    const poseFlags = frame.face ? this.poseFlags(frame, frame.face) : null;
    const gazeDown = frame.face ? this.gazeDownFlag(frame.face) : null;
    for (const behaviour of BEHAVIOURS) {
      const usesDetector = this.settings.rules[behaviour].source === "detector";
      const fromModel = (usesDetector ? detectorFlags.get(behaviour) : poseFlags?.get(behaviour)) ?? false;
      const active = fromModel || (behaviour === "reading_notes" && gazeDown === true);
      this.setFlag(behaviour, active, frame.timeMs);
    }
    return this.active();
  }

  active(): BehaviourType[] {
    return BEHAVIOURS.filter((b) => this.flags.get(b));
  }

  events(endMs: number = this.lastMs): BehaviourEvent[] {
    const open = [...this.openSince].map(([type, startMs]) => ({ type, startMs, endMs: Math.max(startMs, endMs) }));
    return [...this.closed, ...open].sort((a, b) => a.startMs - b.startMs).map((e) => this.relative(e));
  }

  private relative(event: BehaviourEvent): BehaviourEvent {
    const start = this.startMs ?? 0;
    return { type: event.type, startMs: Math.round(event.startMs - start), endMs: Math.round(event.endMs - start) };
  }

  private setFlag(behaviour: BehaviourType, active: boolean, timeMs: number): void {
    const wasActive = this.flags.get(behaviour) ?? false;
    this.flags.set(behaviour, active);
    if (active && !wasActive) this.openSince.set(behaviour, timeMs);
    if (!active && wasActive) {
      const startMs = this.openSince.get(behaviour) ?? timeMs;
      this.openSince.delete(behaviour);
      this.closed.push({ type: behaviour, startMs, endMs: timeMs });
    }
  }

  private detectorFlags(detections: Detection[]): Map<BehaviourType, boolean> {
    const { conf, minFraction } = this.settings.detector;
    const flags = new Map<BehaviourType, boolean>();
    for (const behaviour of BEHAVIOURS) {
      const classId = this.settings.behaviourClassIds[behaviour];
      const best = Math.max(0, ...detections.filter((d) => d.classId === classId).map((d) => d.score));
      const share = this.detectorWindows.get(behaviour)!.push(best >= conf ? 1 : 0) ?? 0;
      flags.set(behaviour, share >= minFraction);
    }
    return flags;
  }

  private poseFlags(frame: PostureFrame, face: FaceFeatures): Map<BehaviourType, boolean> | null {
    const pf = postureFace(face);
    const object = heldObject(frame.objects, pf, frame.height, frame.width, this.settings.ignoredObjectIds);
    const person = mainPerson(frame.people);
    const raw = rawPostureFeatures(pf, person?.keypoints ?? null, object, frame.width, frame.height, this.settings.keypointConf);
    if (!this.baseline) {
      this.baselineSamples.push({ face: pf, raw });
      if (frame.timeMs - (this.startMs ?? frame.timeMs) < this.settings.baselineMs) return null;
      this.baseline = postureBaseline(this.baselineSamples);
    }
    const features = relativeFeatures(pf, raw, this.baseline);
    const flags = new Map<BehaviourType, boolean>();
    for (const behaviour of BEHAVIOURS) {
      const rule = this.settings.rules[behaviour];
      const smoothed = this.ruleWindows.get(behaviour)!.push(ruleProbability(rule, features)) ?? 0;
      flags.set(behaviour, smoothed >= rule.threshold);
    }
    return flags;
  }

  private gazeDownFlag(face: FaceFeatures): boolean {
    const g = this.settings.gazeDown;
    const score = g.sign * (face.pitch - this.eyeBaseline.pitch + g.kY * (face.irisY - this.eyeBaseline.irisY));
    const share = this.gazeDownWindow.push(score >= g.angleDeg ? 1 : 0);
    return share !== null && share >= g.minFraction;
  }
}
