import { createFaceModel, type FaceModel } from "./face";
import { backendOrder, createYoloModel, hasWebGpu } from "./onnx";
import type { PostureModels } from "./pose-loop";

export type SessionModels = { face: FaceModel | null; posture: PostureModels | null };

type Factories = {
  face: () => Promise<FaceModel>;
  posture: () => Promise<PostureModels>;
};

async function createPostureModels(): Promise<PostureModels> {
  const backends = backendOrder(hasWebGpu());
  const [pose, objects, behaviour] = await Promise.all([
    createYoloModel("pose", backends),
    createYoloModel("objects", backends),
    createYoloModel("behaviour", backends),
  ]);
  return { pose, objects, behaviour };
}

function once<T>(create: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= create().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

export function sessionModelLoader(factories: Factories) {
  const face = once(factories.face);
  const posture = once(factories.posture);
  return {
    face,
    posture,
    preload(): void {
      void face().catch(() => undefined);
      void posture().catch(() => undefined);
    },
    async all(): Promise<SessionModels> {
      const [loadedFace, loadedPosture] = await Promise.all([
        face().catch(() => null),
        posture().catch(() => null),
      ]);
      return { face: loadedFace, posture: loadedPosture };
    },
  };
}

const shared = sessionModelLoader({ face: createFaceModel, posture: createPostureModels });

export const loadFaceModel = shared.face;
export const loadPostureModels = shared.posture;
export const preloadSessionModels = shared.preload;
export const loadSessionModels = shared.all;
