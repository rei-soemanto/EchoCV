import { describe, expect, it } from "vitest";

import { letterboxFor } from "@/lib/vision/letterbox";
import { decodeYolo, iou } from "@/lib/vision/yolo";

type Anchor = { cx: number; cy: number; w: number; h: number; scores: number[]; kps?: number[] };

function rawOutput(anchors: Anchor[], channels: number): Float32Array {
  const n = anchors.length;
  const out = new Float32Array(channels * n);
  anchors.forEach((a, i) => {
    const values = [a.cx, a.cy, a.w, a.h, ...a.scores, ...(a.kps ?? [])];
    values.forEach((v, c) => {
      out[c * n + i] = v;
    });
  });
  return out;
}

const identity = letterboxFor(640, 640, 640, 32);

describe("decodeYolo", () => {
  it("keeps the best of overlapping boxes of one class and drops weak ones", () => {
    const output = rawOutput(
      [
        { cx: 100, cy: 100, w: 50, h: 50, scores: [0.9, 0.1] },
        { cx: 102, cy: 101, w: 50, h: 50, scores: [0.8, 0.1] },
        { cx: 101, cy: 100, w: 50, h: 50, scores: [0.1, 0.7] },
        { cx: 400, cy: 400, w: 20, h: 20, scores: [0.2, 0.1] },
      ],
      6,
    );
    const found = decodeYolo(output, [1, 6, 4], identity, { numClasses: 2, conf: 0.25 });
    expect(found.map((d) => [d.classId, Number(d.score.toFixed(2))])).toEqual([
      [0, 0.9],
      [1, 0.7],
    ]);
    expect(found[0].box).toEqual([75, 75, 125, 125]);
  });

  it("keeps only the requested classes", () => {
    const output = rawOutput(
      [
        { cx: 100, cy: 100, w: 50, h: 50, scores: [0.9, 0.1, 0.0] },
        { cx: 300, cy: 300, w: 50, h: 50, scores: [0.1, 0.0, 0.8] },
      ],
      7,
    );
    const found = decodeYolo(output, [1, 7, 2], identity, { numClasses: 3, conf: 0.25, classIds: [2] });
    expect(found.map((d) => d.classId)).toEqual([2]);
  });

  it("maps boxes and keypoints back to the source frame and clips them", () => {
    const box = letterboxFor(1280, 720, 640, 32);
    const output = rawOutput(
      [{ cx: 320, cy: 12 + 180, w: 100, h: 50, scores: [0.95], kps: [320, 12, 0.9, 700, 200, 0.4] }],
      11,
    );
    const [det] = decodeYolo(output, [1, 11, 1], box, { numClasses: 1, numKeypoints: 2, conf: 0.25 });
    expect(det.box).toEqual([540, 310, 740, 410]);
    expect(det.keypoints).toEqual([
      [640, 0, expect.closeTo(0.9, 5)],
      [1280, 376, expect.closeTo(0.4, 5)],
    ]);
  });
});

describe("iou", () => {
  it("is 1 for equal boxes and 0 for disjoint ones", () => {
    expect(iou([0, 0, 10, 10], [0, 0, 10, 10])).toBe(1);
    expect(iou([0, 0, 10, 10], [20, 20, 30, 30])).toBe(0);
  });
});
