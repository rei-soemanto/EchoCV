import type { LiveHint, BehaviourType } from "@/lib/vision/answer-tracker";

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const HINTS: Record<LiveHint, string> = {
  face_not_visible: "Wajah tidak terlihat. Pastikan wajah ada di dalam bingkai.",
  look_at_camera: "Coba tatap lensa kamera saat menjawab.",
};

const BEHAVIOURS: Record<BehaviourType, string> = {
  touching_face: "Tangan menyentuh wajah. Letakkan tangan dengan santai.",
  arms_crossed: "Tangan bersilang. Coba buka posisi tangan.",
  reading_notes: "Sepertinya Anda membaca catatan. Coba jawab sambil menatap kamera.",
  slouching: "Postur membungkuk. Coba duduk tegak.",
};

export function hintText(hint: LiveHint | null, active: BehaviourType[]): string[] {
  return [...(hint ? [HINTS[hint]] : []), ...active.map((b) => BEHAVIOURS[b])];
}

const GUIDE_KEY = "echocv.room.guide";

export function isGuideSeen(storage: () => Storage = () => localStorage): boolean {
  try {
    return storage().getItem(GUIDE_KEY) !== null;
  } catch {
    return false;
  }
}

export function markGuideSeen(storage: () => Storage = () => localStorage): void {
  try {
    storage().setItem(GUIDE_KEY, "1");
  } catch {
  }
}
