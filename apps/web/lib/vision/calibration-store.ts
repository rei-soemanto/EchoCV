import type { Baseline } from "./eye-contact";

// The calibration page hands the baseline to the interview room through sessionStorage:
// it lives only in this tab and disappears when the tab closes. Numbers only (BR-04).
const KEY = "echocv.calibration.baseline";
const FIELDS = ["yaw", "pitch", "irisX", "irisY", "smile"] as const;

export function saveBaseline(baseline: Baseline, storage: Storage = sessionStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(baseline));
  } catch {
    // Storage blocked (private mode, quota): the room asks for calibration again.
  }
}

/** The stored baseline, or null when missing or not a full set of finite numbers. */
export function loadBaseline(storage: Storage = sessionStorage): Baseline | null {
  try {
    const raw: unknown = JSON.parse(storage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return null;
    const value = raw as Record<string, unknown>;
    if (!FIELDS.every((f) => typeof value[f] === "number" && Number.isFinite(value[f]))) return null;
    return Object.fromEntries(FIELDS.map((f) => [f, value[f]])) as Baseline;
  } catch {
    return null;
  }
}

export function clearBaseline(storage: Storage = sessionStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // nothing stored, nothing to clear
  }
}
