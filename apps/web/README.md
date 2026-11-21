# apps/web

Next.js app (App Router, Tailwind, shadcn/ui): UI, API routes and in-browser vision.
See the root [README](../../README.md) for setup.

```bash
pnpm dev          # http://localhost:3000
pnpm lint
pnpm test         # Vitest (tests/unit)
pnpm test:e2e     # Playwright (tests/e2e)
pnpm build
```

## In-browser vision (`lib/vision`)

`loadVisionModels()` loads MediaPipe Face Landmarker (GPU, then CPU) and three YOLO26n ONNX models
through ONNX Runtime Web (WebGPU, then WASM on the CPU): `pose` (keypoints), `objects` (COCO phone,
book and laptop) and `behaviour` (detector v1). When nothing loads it throws
`VisionUnsupportedError`, so the page can recommend Chrome or Edge, or Upload mode (UC-03 E2).
`letterboxForModel`, `drawLetterboxed`, `runYolo` and `decodeYolo` turn a frame into detections in
source-frame pixels, with the same letterbox and NMS as Ultralytics, so the browser sees what the
pose rules were calibrated on. Runs are queued one at a time, as ONNX Runtime's WebGPU backend needs.

The model and runtime files are git-ignored. Until they are on Hugging Face Hub, make them from `ml/`
(needs the weights in `ml/artifacts/` and `pnpm install` done):

```bash
cd ../../ml && YOLO_AUTOINSTALL=false uv run python -m yolo.export_browser
```

It writes the ONNX models, `face_landmarker.task`, `ort/` and `mediapipe/` into `public/models/`,
checks every ONNX model against PyTorch, and regenerates `shared/vision-models.json` (never
hand-edit it). `tests/unit/vision/parity.test.ts` then runs ONNX Runtime Web on the same frames and
compares with Ultralytics; it skips when the files are missing, as in CI.
