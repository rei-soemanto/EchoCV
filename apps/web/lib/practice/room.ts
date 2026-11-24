import type { LiveHint, BehaviourType } from "@/lib/vision/answer-tracker";

/** mm:ss for the recording bar; negative time shows as 00:00. */
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

/** Calm live hints (UC-04): the face hint first, then any active behaviours. */
export function hintText(hint: LiveHint | null, active: BehaviourType[]): string[] {
  return [...(hint ? [HINTS[hint]] : []), ...active.map((b) => BEHAVIOURS[b])];
}
