import { createFaceModel, type FaceModel } from "./face";
import { backendOrder, createYoloModel, hasWebGpu, type Backend, type YoloModel } from "./onnx";
import type { YoloModelKey } from "./models";

export type VisionModels = {
  face: FaceModel;
  pose: YoloModel;
  objects: YoloModel;
  behaviour: YoloModel;
  backend: Backend;
};

export type LoadStep = "face" | YoloModelKey;

export class VisionUnsupportedError extends Error {
  readonly step: LoadStep;

  constructor(step: LoadStep, cause: unknown) {
    super(`The ${step} model could not be loaded in this browser`, { cause });
    this.name = "VisionUnsupportedError";
    this.step = step;
  }
}

async function attempt<T>(step: LoadStep, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    throw new VisionUnsupportedError(step, error);
  }
}

export async function loadVisionModels(
  onLoaded?: (step: LoadStep, backend: string) => void,
): Promise<VisionModels> {
  const face = await attempt("face", () => createFaceModel());
  onLoaded?.("face", face.delegate);
  const pose = await attempt("pose", () => createYoloModel("pose", backendOrder(hasWebGpu())));
  onLoaded?.("pose", pose.backend);
  const rest: Backend[] = [pose.backend];
  const objects = await attempt("objects", () => createYoloModel("objects", rest));
  onLoaded?.("objects", objects.backend);
  const behaviour = await attempt("behaviour", () => createYoloModel("behaviour", rest));
  onLoaded?.("behaviour", behaviour.backend);
  return { face, pose, objects, behaviour, backend: pose.backend };
}
