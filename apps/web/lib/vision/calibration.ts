import session from "@echocv/shared/session.json";

import { buildBaseline, type Baseline } from "./eye-contact";
import type { FaceFeatures } from "./face-features";

export type CalibrationSettings = {
  durationMs: number;
  minFaceFraction: number;
};

export type CalibrationResult =
  | { ok: true; baseline: Baseline; faceFraction: number }
  | { ok: false; reason: "face_not_found"; faceFraction: number };

export const calibrationSettings: CalibrationSettings = {
  durationMs: session.calibrationSeconds * 1000,
  minFaceFraction: session.calibrationMinFaceFraction,
};

export class Calibration {
  private readonly settings: CalibrationSettings;
  private readonly samples: FaceFeatures[] = [];
  private frames = 0;
  private startMs: number | null = null;
  private lastMs = 0;

  constructor(settings: CalibrationSettings = calibrationSettings) {
    this.settings = settings;
  }

  add(features: FaceFeatures | null, timeMs: number): void {
    if (this.done) return;
    this.startMs ??= timeMs;
    this.lastMs = timeMs;
    this.frames += 1;
    if (features) this.samples.push(features);
  }

  get progress(): number {
    if (this.startMs === null) return 0;
    return Math.min(1, (this.lastMs - this.startMs) / this.settings.durationMs);
  }

  get done(): boolean {
    return this.progress >= 1;
  }

  get faceFraction(): number {
    return this.frames ? this.samples.length / this.frames : 0;
  }

  result(): CalibrationResult {
    const faceFraction = this.faceFraction;
    if (this.samples.length === 0 || faceFraction < this.settings.minFaceFraction) {
      return { ok: false, reason: "face_not_found", faceFraction };
    }
    return { ok: true, baseline: buildBaseline(this.samples), faceFraction };
  }
}
