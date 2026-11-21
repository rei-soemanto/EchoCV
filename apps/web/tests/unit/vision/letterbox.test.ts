import { describe, expect, it } from "vitest";

import { letterboxFor, rgbaToTensor, roundHalfEven } from "@/lib/vision/letterbox";

describe("roundHalfEven", () => {
  it("rounds halves to the even neighbour like Python", () => {
    expect(roundHalfEven(426.5)).toBe(426);
    expect(roundHalfEven(427.5)).toBe(428);
    expect(roundHalfEven(10.9)).toBe(11);
    expect(roundHalfEven(10.4)).toBe(10);
  });
});

describe("letterboxFor", () => {
  it("pads a 3:2 frame to the next multiple of 32 like Ultralytics", () => {
    expect(letterboxFor(1280, 853, 640, 32)).toEqual({
      scale: 0.5,
      left: 0,
      top: 11,
      resizedWidth: 640,
      resizedHeight: 426,
      inputWidth: 640,
      inputHeight: 448,
      sourceWidth: 1280,
      sourceHeight: 853,
    });
  });

  it("gives 640x384 for a 16:9 webcam", () => {
    const box = letterboxFor(1280, 720, 640, 32);
    expect([box.inputWidth, box.inputHeight, box.top]).toEqual([640, 384, 12]);
  });

  it("keeps a 640x480 frame unscaled and unpadded", () => {
    const box = letterboxFor(640, 480, 640, 32);
    expect([box.scale, box.inputWidth, box.inputHeight, box.left, box.top]).toEqual([1, 640, 480, 0, 0]);
  });

  it("pads the width of a portrait frame", () => {
    const box = letterboxFor(720, 1280, 640, 32);
    expect([box.resizedWidth, box.inputWidth, box.inputHeight, box.left]).toEqual([360, 384, 640, 12]);
  });
});

describe("rgbaToTensor", () => {
  it("drops alpha and lays out RGB planes scaled to 0..1", () => {
    const rgba = new Uint8ClampedArray([255, 0, 51, 255, 0, 102, 255, 255]);
    const tensor = Array.from(rgbaToTensor(rgba, 2, 1));
    [1, 0, 0, 0.4, 0.2, 1].forEach((want, i) => expect(tensor[i]).toBeCloseTo(want, 6));
  });
});
