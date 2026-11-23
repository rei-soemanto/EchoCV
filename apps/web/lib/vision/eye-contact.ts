import thresholds from "@echocv/shared/thresholds.json";

import type { FaceFeatures } from "./face-features";

export type Baseline = Pick<FaceFeatures, "yaw" | "pitch" | "irisX" | "irisY" | "smile">;

export type FaceRules = {
  kX: number;
  kY: number;
  toleranceDeg: number;
  smileThreshold: number;
};

export const faceRules: FaceRules = {
  kX: thresholds.eyeContact.kX,
  kY: thresholds.eyeContact.kY,
  toleranceDeg: thresholds.eyeContact.toleranceDeg,
  smileThreshold: thresholds.smile.threshold,
};

const BASELINE_KEYS = ["yaw", "pitch", "irisX", "irisY", "smile"] as const;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildBaseline(samples: FaceFeatures[]): Baseline {
  if (samples.length === 0) throw new Error("A baseline needs at least one face sample");
  const entries = BASELINE_KEYS.map((key) => [key, median(samples.map((s) => s[key]))]);
  return Object.fromEntries(entries) as Baseline;
}

export function gazeError(features: FaceFeatures, baseline: Baseline, rules: FaceRules = faceRules): number {
  const horizontal = features.yaw - baseline.yaw + rules.kX * (features.irisX - baseline.irisX);
  const vertical = features.pitch - baseline.pitch + rules.kY * (features.irisY - baseline.irisY);
  return Math.hypot(horizontal, vertical);
}

export function isEyeContact(features: FaceFeatures, baseline: Baseline, rules: FaceRules = faceRules): boolean {
  return gazeError(features, baseline, rules) <= rules.toleranceDeg;
}

export function isSmiling(features: FaceFeatures, baseline: Baseline, rules: FaceRules = faceRules): boolean {
  return features.smile - baseline.smile >= rules.smileThreshold;
}
