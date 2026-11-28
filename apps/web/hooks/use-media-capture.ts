"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CAPTURE_CONSTRAINTS,
  type CaptureError,
  captureError,
  DARK_LUMA,
  meanLuma,
  micLevel,
} from "@/lib/media";

export type CaptureStatus = "requesting" | "ready" | CaptureError;

export function useMediaCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CaptureStatus>("requesting");
  const [level, setLevel] = useState(0);
  const [lighting, setLighting] = useState<"ok" | "dark" | null>(null);
  const [online, setOnline] = useState(true);

  const start = useCallback(async () => {
    setStatus("requesting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }
    try {
      setStream(await navigator.mediaDevices.getUserMedia(CAPTURE_CONSTRAINTS));
      setStatus("ready");
    } catch (err) {
      const parsed = captureError(err);
      if (parsed === "busy") {
        await new Promise((resolve) => setTimeout(resolve, 350));
        try {
          setStream(await navigator.mediaDevices.getUserMedia(CAPTURE_CONSTRAINTS));
          setStatus("ready");
          return;
        } catch {
          // Keep first error
        }
      }
      setStatus(parsed);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- getUserMedia is the external system
    void start();
  }, [start]);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  const checkLighting = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 36;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setLighting(meanLuma(ctx.getImageData(0, 0, canvas.width, canvas.height).data) < DARK_LUMA ? "dark" : "ok");
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const timer = setTimeout(checkLighting, 1000);
    return () => clearTimeout(timer);
  }, [stream, checkLighting]);

  useEffect(() => {
    if (!stream?.getAudioTracks().length) return;
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    audio.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      setLevel(micLevel(samples));
    }, 66);
    return () => {
      clearInterval(timer);
      void audio.close();
    };
  }, [stream]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return {
    videoRef,
    stream,
    status,
    hasCamera: !!stream?.getVideoTracks().length,
    hasMic: !!stream?.getAudioTracks().length,
    level,
    lighting,
    online,
    retry: start,
    checkLighting,
  };
}
