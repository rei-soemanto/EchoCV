import { describe, expect, it } from "vitest";

import { clearBaseline, loadBaseline, saveBaseline } from "@/lib/vision/calibration-store";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const baseline = { yaw: -2.5, pitch: 4.1, irisX: 0.01, irisY: -0.02, smile: 0.12 };

describe("calibration store", () => {
  it("round-trips a baseline and clears it", () => {
    const storage = memoryStorage();
    saveBaseline(baseline, storage);
    expect(loadBaseline(storage)).toEqual(baseline);
    clearBaseline(storage);
    expect(loadBaseline(storage)).toBeNull();
  });

  it("keeps only the baseline fields", () => {
    const storage = memoryStorage();
    storage.setItem("echocv.calibration.baseline", JSON.stringify({ ...baseline, extra: "x" }));
    expect(loadBaseline(storage)).toEqual(baseline);
  });

  it.each([
    ["missing", null],
    ["not JSON", "{oops"],
    ["a field missing", JSON.stringify({ yaw: 1, pitch: 1, irisX: 0, irisY: 0 })],
    ["a non-number", JSON.stringify({ ...baseline, smile: "0.1" })],
    ["a non-finite number", JSON.stringify({ ...baseline, yaw: null })],
  ])("rejects %s", (_, raw) => {
    const storage = memoryStorage();
    if (raw !== null) storage.setItem("echocv.calibration.baseline", raw);
    expect(loadBaseline(storage)).toBeNull();
  });

  it("survives blocked storage", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(() => saveBaseline(baseline, blocked)).not.toThrow();
    expect(loadBaseline(blocked)).toBeNull();
    expect(() => clearBaseline(blocked)).not.toThrow();
  });
});
