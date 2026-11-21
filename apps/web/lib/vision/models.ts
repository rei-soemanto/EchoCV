import manifest from "@echocv/shared/vision-models.json";

export const MODELS_BASE_URL = "/models/";
export const ORT_WASM_URL = `${MODELS_BASE_URL}ort/`;
export const MEDIAPIPE_WASM_URL = `${MODELS_BASE_URL}mediapipe`;

export type YoloModelKey = "pose" | "objects" | "behaviour";

export const visionManifest = manifest;

export function modelUrl(file: string): string {
  return `${MODELS_BASE_URL}${file}`;
}

export function classIds(key: Exclude<YoloModelKey, "pose">): number[] {
  return Object.keys(manifest.models[key].classes).map(Number);
}

export function numClasses(key: YoloModelKey): number {
  const channels = Number(manifest.models[key].output[1]);
  return key === "pose" ? channels - 4 - manifest.models.pose.keypoints * 3 : channels - 4;
}
