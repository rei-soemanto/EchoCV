import type { InferenceSession, Tensor } from "onnxruntime-web";

import { letterboxFor, type Letterbox } from "./letterbox";
import { modelUrl, ORT_WASM_URL, visionManifest, type YoloModelKey } from "./models";

export type Backend = "webgpu" | "wasm";

export type YoloModel = {
  key: YoloModelKey;
  session: InferenceSession;
  backend: Backend;
  inputName: string;
  outputName: string;
};

type Ort = typeof import("onnxruntime-web");

let ortModule: Promise<Ort> | null = null;

export function loadOrt(): Promise<Ort> {
  ortModule ??= import("onnxruntime-web").then((ort) => {
    if (typeof location !== "undefined") ort.env.wasm.wasmPaths = ORT_WASM_URL;
    return ort;
  });
  return ortModule;
}

export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && Boolean(navigator.gpu);
}

export function backendOrder(webGpu: boolean): Backend[] {
  return webGpu ? ["webgpu", "wasm"] : ["wasm"];
}

export async function createYoloModel(
  key: YoloModelKey,
  backends: Backend[],
  source: string | Uint8Array = modelUrl(visionManifest.models[key].file),
): Promise<YoloModel> {
  const ort = await loadOrt();
  let lastError: unknown = new Error("No backend to try");
  for (const backend of backends) {
    try {
      const session =
        typeof source === "string"
          ? await ort.InferenceSession.create(source, { executionProviders: [backend] })
          : await ort.InferenceSession.create(source, { executionProviders: [backend] });
      return {
        key,
        session,
        backend,
        inputName: session.inputNames[0],
        outputName: session.outputNames[0],
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function letterboxForModel(key: YoloModelKey, width: number, height: number): Letterbox {
  const model = visionManifest.models[key];
  return letterboxFor(width, height, model.inputSize, model.stride);
}

let pending: Promise<unknown> = Promise.resolve();

export function runYolo(
  model: YoloModel,
  input: Float32Array,
  box: Letterbox,
): Promise<{ data: Float32Array; dims: readonly number[] }> {
  const run = pending.then(() => runNow(model, input, box));
  pending = run.catch(() => undefined);
  return run;
}

async function runNow(
  model: YoloModel,
  input: Float32Array,
  box: Letterbox,
): Promise<{ data: Float32Array; dims: readonly number[] }> {
  const ort = await loadOrt();
  const tensor: Tensor = new ort.Tensor("float32", input, [1, 3, box.inputHeight, box.inputWidth]);
  const outputs = await model.session.run({ [model.inputName]: tensor });
  const output = outputs[model.outputName];
  const data = output.data as Float32Array;
  const dims = output.dims;
  tensor.dispose();
  return { data: new Float32Array(data), dims };
}
