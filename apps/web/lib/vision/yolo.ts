import type { Letterbox } from "./letterbox";

export type Box = [number, number, number, number];
export type Keypoint = [number, number, number];

export type Detection = {
  box: Box;
  score: number;
  classId: number;
  keypoints?: Keypoint[];
};

export type DecodeOptions = {
  numClasses: number;
  numKeypoints?: number;
  conf: number;
  iou?: number;
  maxDetections?: number;
  classIds?: readonly number[];
};

const DEFAULT_IOU = 0.7;
const DEFAULT_MAX_DETECTIONS = 300;
const MAX_CANDIDATES = 30000;

export function iou(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = w * h;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

function toSource(x: number, y: number, box: Letterbox): [number, number] {
  return [
    clamp((x - box.left) / box.scale, box.sourceWidth),
    clamp((y - box.top) / box.scale, box.sourceHeight),
  ];
}

type Candidate = { anchor: number; score: number; classId: number; box: Box };

function candidates(output: Float32Array, anchors: number, options: DecodeOptions): Candidate[] {
  const allowed = options.classIds ? new Set(options.classIds) : null;
  const found: Candidate[] = [];
  for (let a = 0; a < anchors; a++) {
    let best = -1;
    let score = -Infinity;
    for (let c = 0; c < options.numClasses; c++) {
      const s = output[(4 + c) * anchors + a];
      if (s > score) {
        score = s;
        best = c;
      }
    }
    if (score <= options.conf || (allowed && !allowed.has(best))) continue;
    const cx = output[a];
    const cy = output[anchors + a];
    const w = output[2 * anchors + a];
    const h = output[3 * anchors + a];
    found.push({
      anchor: a,
      score,
      classId: best,
      box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
    });
  }
  return found.sort((p, q) => q.score - p.score).slice(0, MAX_CANDIDATES);
}

export function nonMaxSuppression<T extends { box: Box; classId: number }>(
  sorted: T[],
  threshold: number,
  limit: number,
): T[] {
  const kept: T[] = [];
  for (const item of sorted) {
    if (kept.length >= limit) break;
    if (kept.every((k) => k.classId !== item.classId || iou(k.box, item.box) <= threshold)) {
      kept.push(item);
    }
  }
  return kept;
}

export function decodeYolo(
  output: Float32Array,
  dims: readonly number[],
  box: Letterbox,
  options: DecodeOptions,
): Detection[] {
  const anchors = dims[dims.length - 1];
  const kept = nonMaxSuppression(
    candidates(output, anchors, options),
    options.iou ?? DEFAULT_IOU,
    options.maxDetections ?? DEFAULT_MAX_DETECTIONS,
  );
  const kpStart = 4 + options.numClasses;
  return kept.map((c) => {
    const [x1, y1] = toSource(c.box[0], c.box[1], box);
    const [x2, y2] = toSource(c.box[2], c.box[3], box);
    const detection: Detection = { box: [x1, y1, x2, y2], score: c.score, classId: c.classId };
    if (options.numKeypoints) {
      detection.keypoints = Array.from({ length: options.numKeypoints }, (_, k) => {
        const row = kpStart + k * 3;
        const [x, y] = toSource(
          output[row * anchors + c.anchor],
          output[(row + 1) * anchors + c.anchor],
          box,
        );
        return [x, y, output[(row + 2) * anchors + c.anchor]];
      });
    }
    return detection;
  });
}
