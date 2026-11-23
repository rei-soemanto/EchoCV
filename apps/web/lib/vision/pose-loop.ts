import thresholds from "@echocv/shared/thresholds.json";

import { drawLetterboxed } from "./letterbox";
import { classIds, numClasses, visionManifest } from "./models";
import { letterboxForModel, runYolo, type YoloModel } from "./onnx";
import { decodeYolo, type Detection } from "./yolo";

export type PostureModels = { pose: YoloModel; objects: YoloModel; behaviour: YoloModel };

export type PostureDetections = {
  timeMs: number;
  people: Detection[];
  objects: Detection[];
  behaviours: Detection[];
  width: number;
  height: number;
};

export const POSE_INTERVAL_MS = 1000 / thresholds.posture.sampleFps;

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createContext(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== "undefined") {
    const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
    if (context) return context;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("A 2D canvas is not available");
  return context;
}

export async function detectPosture(
  video: HTMLVideoElement,
  models: PostureModels,
  context: Canvas2D,
  timeMs: number,
): Promise<PostureDetections> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const box = letterboxForModel("pose", width, height);
  context.canvas.width = box.inputWidth;
  context.canvas.height = box.inputHeight;
  const input = drawLetterboxed(context, video, box, visionManifest.padValue);
  const conf = thresholds.posture.predictConf;
  const [pose, objects, behaviours] = await Promise.all([
    runYolo(models.pose, input, box),
    runYolo(models.objects, input, box),
    runYolo(models.behaviour, input, box),
  ]);
  return {
    timeMs,
    width,
    height,
    people: decodeYolo(pose.data, pose.dims, box, {
      numClasses: numClasses("pose"),
      numKeypoints: visionManifest.models.pose.keypoints,
      conf,
    }),
    objects: decodeYolo(objects.data, objects.dims, box, {
      numClasses: numClasses("objects"),
      classIds: classIds("objects"),
      conf,
    }),
    behaviours: decodeYolo(behaviours.data, behaviours.dims, box, {
      numClasses: numClasses("behaviour"),
      conf: Math.min(conf, thresholds.posture.detectorRule.conf),
    }),
  };
}

export function startPostureTracking(
  video: HTMLVideoElement,
  models: PostureModels,
  onFrame: (detections: PostureDetections) => void,
  onError: (error: unknown) => void = () => undefined,
  intervalMs: number = POSE_INTERVAL_MS,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const context = createContext(1, 1);

  const tick = async () => {
    if (stopped) return;
    const started = performance.now();
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) {
      try {
        const detections = await detectPosture(video, models, context, started);
        if (!stopped) onFrame(detections);
      } catch (error) {
        if (stopped) return;
        onError(error);
      }
    }
    if (!stopped) timer = setTimeout(tick, Math.max(0, intervalMs - (performance.now() - started)));
  };

  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
