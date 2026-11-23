import type { FaceBox } from "./face-features";
import type { Detection, Keypoint } from "./yolo";

export type PostureFace = FaceBox & { roll: number; pitch: number };

export type FeatureMap = Record<string, number>;

export type PostureBaseline = PostureFace & { shoulderDropRaw: number; shoulderWidthRaw: number };

export type PostureRule = {
  features: string[];
  mean: number[];
  scale: number[];
  weights: number[];
  bias: number;
  smoothingFrames: number;
  threshold: number;
};

const L_SHOULDER = 5;
const R_SHOULDER = 6;
const L_ELBOW = 7;
const R_ELBOW = 8;
const L_WRIST = 9;
const R_WRIST = 10;
const FAR = 4;
const MOUTH_BELOW_CENTRE = 0.25;
const OBJECT_BELOW_FACE = 0.3;
const TILT_EPSILON = 1e-6;
const DEGREES = 180 / Math.PI;

type VisiblePoint = { x: number; y: number; visible: boolean };

function point(keypoints: Keypoint[] | null, index: number, minConf: number): VisiblePoint {
  const kp = keypoints?.[index];
  const visible = kp !== undefined && kp[2] >= minConf;
  return visible ? { x: kp[0], y: kp[1], visible } : { x: NaN, y: NaN, visible: false };
}

function orFar(value: number): number {
  return Number.isNaN(value) ? FAR : value;
}

function clampFar(value: number): number {
  return Math.min(Math.max(value, 0), FAR);
}

export function mainPerson(people: Detection[]): Detection | null {
  let best: Detection | null = null;
  let bestScore = -Infinity;
  for (const person of people) {
    const [x1, y1, x2, y2] = person.box;
    const score = (x2 - x1) * (y2 - y1) * person.score;
    if (score > bestScore) {
      best = person;
      bestScore = score;
    }
  }
  return best;
}

export function heldObject(
  objects: Detection[],
  face: FaceBox,
  height: number,
  width: number,
  ignoredClassIds: ReadonlySet<number>,
): { held: number; area: number } {
  let held = 0;
  let area = 0;
  for (const o of objects) {
    if (ignoredClassIds.has(o.classId)) continue;
    const [x1, y1, x2, y2] = o.box;
    if ((y1 + y2) / 2 / height > face.fy + OBJECT_BELOW_FACE * face.fh) {
      held = Math.max(held, o.score);
      area = Math.max(area, ((x2 - x1) * (y2 - y1)) / (width * height));
    }
  }
  return { held, area };
}

export function rawPostureFeatures(
  face: PostureFace,
  keypoints: Keypoint[] | null,
  object: { held: number; area: number },
  width: number,
  height: number,
  minConf: number,
): FeatureMap {
  const fwPx = face.fw * width;
  const fcx = face.fx * width;
  const fcy = face.fy * height;
  const mouthY = fcy + MOUTH_BELOW_CENTRE * face.fh * height;
  const ls = point(keypoints, L_SHOULDER, minConf);
  const rs = point(keypoints, R_SHOULDER, minConf);
  const le = point(keypoints, L_ELBOW, minConf);
  const re = point(keypoints, R_ELBOW, minConf);
  const lw = point(keypoints, L_WRIST, minConf);
  const rw = point(keypoints, R_WRIST, minConf);
  const bothShoulders = ls.visible && rs.visible;
  const shoulderMidX = (ls.x + rs.x) / 2;
  const shoulderY = (ls.y + rs.y) / 2;
  const distLeft = Math.hypot(lw.x - fcx, lw.y - fcy) / fwPx;
  const distRight = Math.hypot(rw.x - fcx, rw.y - fcy) / fwPx;
  const side = Math.sign(ls.x - rs.x);
  const crossed =
    bothShoulders &&
    lw.visible &&
    rw.visible &&
    (lw.x - shoulderMidX) * side < 0 &&
    (rw.x - shoulderMidX) * side > 0;
  return {
    shoulders_visible: bothShoulders ? 1 : 0,
    shoulder_drop_raw: bothShoulders ? (shoulderY - fcy) / fwPx : NaN,
    shoulder_tilt: bothShoulders ? Math.atan2(ls.y - rs.y, Math.abs(ls.x - rs.x) + TILT_EPSILON) * DEGREES : 0,
    shoulder_width_raw: bothShoulders ? Math.abs(ls.x - rs.x) / fwPx : NaN,
    wrists_visible: Number(lw.visible) + Number(rw.visible),
    elbows_visible: Number(le.visible) + Number(re.visible),
    wrist_face_dist: clampFar(Math.min(orFar(distLeft), orFar(distRight))),
    wrist_mouth_dy: clampFar(
      Math.min(orFar(Math.abs(lw.y - mouthY) / fwPx), orFar(Math.abs(rw.y - mouthY) / fwPx)),
    ),
    wrists_crossed: crossed ? 1 : 0,
    wrist_gap: clampFar(orFar(Math.abs(lw.x - rw.x) / fwPx)),
    wrists_low_mid:
      (orFar(Math.abs(lw.x - shoulderMidX) / fwPx) + orFar(Math.abs(rw.x - shoulderMidX) / fwPx)) / 2,
    object_held: object.held,
    object_area: object.area,
  };
}

function nanMedian(values: number[]): number {
  const finite = values.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  if (!finite.length) return NaN;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
}

export function postureBaseline(samples: { face: PostureFace; raw: FeatureMap }[]): PostureBaseline {
  const of = (pick: (s: { face: PostureFace; raw: FeatureMap }) => number) => nanMedian(samples.map(pick));
  return {
    fx: of((s) => s.face.fx),
    fy: of((s) => s.face.fy),
    fw: of((s) => s.face.fw),
    fh: of((s) => s.face.fh),
    roll: of((s) => s.face.roll),
    pitch: of((s) => s.face.pitch),
    shoulderDropRaw: of((s) => s.raw.shoulder_drop_raw),
    shoulderWidthRaw: of((s) => s.raw.shoulder_width_raw),
  };
}

function logDeviation(ratio: number): number {
  return Math.abs(Math.log(Math.max(ratio, 1e-3)));
}

export function relativeFeatures(face: PostureFace, raw: FeatureMap, base: PostureBaseline): FeatureMap {
  const faceDy = (face.fy - base.fy) / base.fh;
  const faceDx = (face.fx - base.fx) / base.fw;
  const faceScale = face.fw / base.fw;
  const rollRel = face.roll - base.roll;
  const pitchRel = face.pitch - base.pitch;
  const drop = raw.shoulder_drop_raw - base.shoulderDropRaw;
  const width = raw.shoulder_width_raw / base.shoulderWidthRaw;
  const shoulderDrop = Number.isNaN(drop) ? 0 : drop;
  const shoulderWidthRel = Number.isNaN(width) ? 1 : width;
  return {
    ...raw,
    face_dy: faceDy,
    face_dx: faceDx,
    face_scale: faceScale,
    roll_rel: rollRel,
    pitch_rel: pitchRel,
    shoulder_drop: shoulderDrop,
    shoulder_width_rel: shoulderWidthRel,
    face_dy_abs: Math.abs(faceDy),
    face_dx_abs: Math.abs(faceDx),
    face_scale_dev: logDeviation(faceScale),
    roll_abs: Math.abs(rollRel),
    pitch_abs: Math.abs(pitchRel),
    shoulder_drop_abs: Math.abs(shoulderDrop),
    shoulder_width_dev: logDeviation(shoulderWidthRel),
    shoulder_tilt_abs: Math.abs(raw.shoulder_tilt),
  };
}

export function ruleProbability(rule: PostureRule, features: FeatureMap): number {
  let logit = rule.bias;
  rule.features.forEach((name, i) => {
    logit += (rule.weights[i] * (features[name] - rule.mean[i])) / rule.scale[i];
  });
  return 1 / (1 + Math.exp(-logit));
}

export class RollingMean {
  private readonly window: number;
  private readonly minCount: number;
  private readonly values: number[] = [];

  constructor(window: number, minCount = 1) {
    this.window = window;
    this.minCount = minCount;
  }

  push(value: number): number | null {
    this.values.push(value);
    if (this.values.length > this.window) this.values.shift();
    if (this.values.length < this.minCount) return null;
    return this.values.reduce((sum, v) => sum + v, 0) / this.values.length;
  }
}
