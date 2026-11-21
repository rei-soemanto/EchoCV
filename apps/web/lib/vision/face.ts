import type { FaceLandmarker } from "@mediapipe/tasks-vision";

import { MEDIAPIPE_WASM_URL, modelUrl, visionManifest } from "./models";

export type FaceDelegate = "GPU" | "CPU";

export type FaceModel = {
  landmarker: FaceLandmarker;
  delegate: FaceDelegate;
};

export const MAX_FACES = 2;

export async function createFaceModel(delegates: FaceDelegate[] = ["GPU", "CPU"]): Promise<FaceModel> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  let lastError: unknown = new Error("No delegate to try");
  for (const delegate of delegates) {
    try {
      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: modelUrl(visionManifest.models.face.file),
          delegate,
        },
        runningMode: "VIDEO",
        numFaces: MAX_FACES,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      return { landmarker, delegate };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
