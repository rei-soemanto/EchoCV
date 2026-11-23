"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { Calibration, calibrationSettings } from "@/lib/vision/calibration";
import { clearBaseline, saveBaseline } from "@/lib/vision/calibration-store";
import { createFaceModel, type FaceDelegate, type FaceModel } from "@/lib/vision/face";
import { startFaceTracking } from "@/lib/vision/face-loop";

export type CalibrationPhase = "idle" | "loading" | "running" | "done" | "failed" | "unsupported";

// One face model per page load: retries reuse it instead of downloading 3.6 MB again.
let faceModel: Promise<FaceModel> | null = null;
function loadFaceModel(): Promise<FaceModel> {
  faceModel ??= createFaceModel().catch((error: unknown) => {
    faceModel = null; // let a later retry try again
    throw error;
  });
  return faceModel;
}

/**
 * The 5-second "look at the lens" step (UC-03): runs Rei's Calibration on the webcam video and
 * stores the baseline for the interview room. Only numbers are kept; video never leaves (BR-04).
 */
export function useCalibration(videoRef: RefObject<HTMLVideoElement | null>) {
  const [phase, setPhase] = useState<CalibrationPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [faceVisible, setFaceVisible] = useState(false);
  const [delegate, setDelegate] = useState<FaceDelegate | null>(null);
  const stop = useRef<(() => void) | null>(null);

  const halt = () => {
    stop.current?.();
    stop.current = null;
  };

  useEffect(() => halt, []);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    halt();
    clearBaseline(); // a new attempt invalidates the old baseline
    setProgress(0);
    setFaceVisible(false);
    setPhase("loading");
    let model: FaceModel;
    try {
      model = await loadFaceModel();
    } catch {
      setPhase("unsupported");
      return;
    }
    setDelegate(model.delegate);
    const calibration = new Calibration();
    setPhase("running");
    stop.current = startFaceTracking(video, model, (features, timeMs) => {
      calibration.add(features, timeMs);
      setProgress(calibration.progress);
      setFaceVisible(features !== null);
      if (!calibration.done) return;
      halt();
      const result = calibration.result();
      if (result.ok) saveBaseline(result.baseline);
      setPhase(result.ok ? "done" : "failed");
    });
  }, [videoRef]);

  const secondsLeft = Math.ceil((1 - progress) * (calibrationSettings.durationMs / 1000));
  return { phase, progress, secondsLeft, faceVisible, delegate, start };
}
