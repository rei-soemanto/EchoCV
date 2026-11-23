export type Point = { x: number; y: number };

export type Blendshape = { categoryName: string; score: number };

export type FaceBox = { fx: number; fy: number; fw: number; fh: number };

export type FaceFeatures = FaceBox & {
  yaw: number;
  pitch: number;
  roll: number;
  irisX: number;
  irisY: number;
  smile: number;
};

export type FaceFrame = {
  landmarks: Point[][];
  matrices: number[][];
  blendshapes: Blendshape[][];
  width: number;
  height: number;
};

type EyeIndices = { cornerA: number; cornerB: number; iris: number };

const RIGHT_EYE: EyeIndices = { cornerA: 33, cornerB: 133, iris: 468 };
const LEFT_EYE: EyeIndices = { cornerA: 362, cornerB: 263, iris: 473 };
const TRANSLATION_MIN = 1.5;
const DEGREES = 180 / Math.PI;

export function rotationEntry(matrix: number[], row: number, col: number): number {
  const columnMajor = Math.abs(matrix[14]) > TRANSLATION_MIN || Math.abs(matrix[11]) <= TRANSLATION_MIN;
  return columnMajor ? matrix[col * 4 + row] : matrix[row * 4 + col];
}

export function headAngles(matrix: number[]): { yaw: number; pitch: number; roll: number } {
  const r = (row: number, col: number) => rotationEntry(matrix, row, col);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r(1, 2)))) * DEGREES;
  const yaw = Math.atan2(r(0, 2), r(2, 2)) * DEGREES;
  const roll = Math.atan2(r(1, 0), r(1, 1)) * DEGREES;
  return { yaw, pitch, roll };
}

function eyeOffset(points: Point[], eye: EyeIndices, iris: number) {
  const a = points[eye.cornerA];
  const b = points[eye.cornerB];
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  const axisX = right.x - left.x;
  const axisY = right.y - left.y;
  const width = Math.hypot(axisX, axisY);
  const ux = { x: axisX / width, y: axisY / width };
  const uy = { x: -ux.y, y: ux.x };
  const centre = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  const p = points[iris];
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  const along = (p.x - left.x) * ux.x + (p.y - left.y) * ux.y;
  return {
    x: (dx * ux.x + dy * ux.y) / width,
    y: (dx * uy.x + dy * uy.y) / width,
    inside: along >= 0 && along <= width,
  };
}

export function irisOffsets(points: Point[]): { irisX: number; irisY: number } {
  const pairs: [number, number][] = [
    [RIGHT_EYE.iris, LEFT_EYE.iris],
    [LEFT_EYE.iris, RIGHT_EYE.iris],
  ];
  let right = eyeOffset(points, RIGHT_EYE, pairs[0][0]);
  let left = eyeOffset(points, LEFT_EYE, pairs[0][1]);
  for (const [rightIris, leftIris] of pairs) {
    right = eyeOffset(points, RIGHT_EYE, rightIris);
    left = eyeOffset(points, LEFT_EYE, leftIris);
    if (right.inside && left.inside) break;
  }
  return { irisX: (right.x + left.x) / 2, irisY: (right.y + left.y) / 2 };
}

export function smileScore(blendshapes: Blendshape[]): number {
  const score = (name: string) => blendshapes.find((b) => b.categoryName === name)?.score ?? 0;
  return (score("mouthSmileLeft") + score("mouthSmileRight")) / 2;
}

function bounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function faceArea(points: Point[]): number {
  const b = bounds(points);
  return (b.maxX - b.minX) * (b.maxY - b.minY);
}

export function faceBox(points: Point[], width: number, height: number): FaceBox {
  const b = bounds(points);
  return {
    fx: (b.minX + b.maxX) / 2 / width,
    fy: (b.minY + b.maxY) / 2 / height,
    fw: (b.maxX - b.minX) / width,
    fh: (b.maxY - b.minY) / height,
  };
}

export function largestFace(landmarks: Point[][]): number {
  let best = -1;
  let bestArea = -1;
  landmarks.forEach((face, index) => {
    const area = faceArea(face);
    if (area > bestArea) {
      best = index;
      bestArea = area;
    }
  });
  return best;
}

export function faceFeatures(frame: FaceFrame): FaceFeatures | null {
  const index = largestFace(frame.landmarks);
  const matrix = frame.matrices[index];
  const blendshapes = frame.blendshapes[index];
  if (index < 0 || !matrix || !blendshapes) return null;
  const points = frame.landmarks[index].map((p) => ({ x: p.x * frame.width, y: p.y * frame.height }));
  return {
    ...headAngles(matrix),
    ...irisOffsets(points),
    ...faceBox(points, frame.width, frame.height),
    smile: smileScore(blendshapes),
  };
}
