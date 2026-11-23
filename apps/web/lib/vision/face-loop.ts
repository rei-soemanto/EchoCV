import session from "@echocv/shared/session.json";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

import { faceFeatures, type FaceFeatures, type FaceFrame } from "./face-features";
import type { FaceModel } from "./face";

export type FaceFrameHandler = (features: FaceFeatures | null, timeMs: number) => void;

export const FACE_INTERVAL_MS = 1000 / session.faceFps;

export function toFaceFrame(result: FaceLandmarkerResult, width: number, height: number): FaceFrame {
  return {
    landmarks: result.faceLandmarks,
    matrices: (result.facialTransformationMatrixes ?? []).map((m) => m.data),
    blendshapes: (result.faceBlendshapes ?? []).map((c) => c.categories),
    width,
    height,
  };
}

export function startFaceTracking(
  video: HTMLVideoElement,
  model: FaceModel,
  onFrame: FaceFrameHandler,
  intervalMs: number = FACE_INTERVAL_MS,
): () => void {
  let stopped = false;
  let lastRun = -Infinity;
  let handle = 0;

  const schedule = () => {
    if (stopped) return;
    handle = requestAnimationFrame(tick);
  };

  const tick = () => {
    const now = performance.now();
    if (now - lastRun >= intervalMs && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) {
      lastRun = now;
      const result = model.landmarker.detectForVideo(video, now);
      onFrame(faceFeatures(toFaceFrame(result, video.videoWidth, video.videoHeight)), now);
    }
    schedule();
  };

  schedule();
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
  };
}
