import session from "@echocv/shared/session.json";

import { faceRules, isEyeContact, isSmiling, type Baseline, type FaceRules } from "./eye-contact";
import type { FaceFeatures } from "./face-features";

export type BehaviourType = "touching_face" | "arms_crossed" | "reading_notes" | "slouching";

export type BehaviourEvent = { type: BehaviourType; startMs: number; endMs: number };

export type VisualMetrics = {
  answerIndex: number;
  durationMs: number;
  eyeContactPct: number;
  smilePct: number;
  events: BehaviourEvent[];
};

export type LiveHint = "face_not_visible" | "look_at_camera";

export type HintSettings = {
  windowMs: number;
  minFaceFraction: number;
  minEyeContactFraction: number;
};

export type FrameVerdict = { face: boolean; eyeContact: boolean; smiling: boolean };

type Frame = FrameVerdict & { timeMs: number };

export const hintSettings: HintSettings = {
  windowMs: session.liveHints.windowSeconds * 1000,
  minFaceFraction: session.liveHints.minFaceFraction,
  minEyeContactFraction: session.liveHints.minEyeContactFraction,
};

function percent(count: number, total: number): number {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}

export class AnswerTracker {
  private readonly baseline: Baseline;
  private readonly rules: FaceRules;
  private readonly hints: HintSettings;
  private readonly recent: Frame[] = [];
  private frames = 0;
  private contactFrames = 0;
  private smileFrames = 0;
  private startMs: number | null = null;
  private lastMs = 0;

  constructor(baseline: Baseline, rules: FaceRules = faceRules, hints: HintSettings = hintSettings) {
    this.baseline = baseline;
    this.rules = rules;
    this.hints = hints;
  }

  add(features: FaceFeatures | null, timeMs: number): FrameVerdict {
    this.startMs ??= timeMs;
    this.lastMs = timeMs;
    const verdict: FrameVerdict = {
      face: features !== null,
      eyeContact: features !== null && isEyeContact(features, this.baseline, this.rules),
      smiling: features !== null && isSmiling(features, this.baseline, this.rules),
    };
    this.frames += 1;
    if (verdict.eyeContact) this.contactFrames += 1;
    if (verdict.smiling) this.smileFrames += 1;
    this.recent.push({ ...verdict, timeMs });
    while (this.recent.length && this.recent[0].timeMs <= timeMs - this.hints.windowMs) this.recent.shift();
    return verdict;
  }

  hint(): LiveHint | null {
    if (this.startMs === null || this.lastMs - this.startMs < this.hints.windowMs) return null;
    const total = this.recent.length;
    if (!total) return null;
    const faces = this.recent.filter((f) => f.face).length;
    if (faces / total < this.hints.minFaceFraction) return "face_not_visible";
    const contact = this.recent.filter((f) => f.eyeContact).length;
    if (contact / total < this.hints.minEyeContactFraction) return "look_at_camera";
    return null;
  }

  metrics(answerIndex: number, durationMs?: number, events: BehaviourEvent[] = []): VisualMetrics {
    const tracked = this.startMs === null ? 0 : this.lastMs - this.startMs;
    return {
      answerIndex,
      durationMs: Math.max(0, Math.round(durationMs ?? tracked)),
      eyeContactPct: percent(this.contactFrames, this.frames),
      smilePct: percent(this.smileFrames, this.frames),
      events,
    };
  }
}
