"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { Calibration, calibrationSettings } from "@/lib/vision/calibration";
import { clearBaseline, saveBaseline } from "@/lib/vision/calibration-store";
import type { FaceDelegate, FaceModel } from "@/lib/vision/face";
import { startFaceTracking } from "@/lib/vision/face-loop";
import { loadFaceModel, preloadSessionModels } from "@/lib/vision/session-models";

export type CalibrationPhase = "idle" | "loading" | "running" | "done" | "failed" | "unsupported";

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

  useEffect(() => preloadSessionModels(), []);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    halt();
    clearBaseline();
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
