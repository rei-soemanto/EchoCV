import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { cp, copyFile, mkdir, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const WEB = resolve(import.meta.dirname, "..");
const SHARED = resolve(WEB, "../../shared");
const OUT = join(WEB, "public", "models");
const HUB_URL = "https://huggingface.co";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function isCurrent(path, expected) {
  try {
    return (await sha256(path)) === expected;
  } catch {
    return false;
  }
}

async function pull(hub, file, expected, token) {
  const target = join(OUT, file);
  if (await isCurrent(target, expected)) return false;
  const url = `${HUB_URL}/${hub.repo}/resolve/${hub.revision}/${hub.web.path}/${file}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`${file}: Hugging Face answered ${response.status}`);
  const part = `${target}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(part));
  if ((await sha256(part)) !== expected) {
    await rm(part);
    throw new Error(`${file} does not match shared/vision-models.json`);
  }
  await rename(part, target);
  return true;
}

async function copyRuntimes(manifest) {
  await mkdir(join(OUT, "ort"), { recursive: true });
  const ortDist = join(WEB, "node_modules", "onnxruntime-web", "dist");
  for (const file of manifest.ortFiles) await copyFile(join(ortDist, file), join(OUT, "ort", file));
  const mediapipe = join(WEB, "node_modules", "@mediapipe", "tasks-vision", "wasm");
  await cp(mediapipe, join(OUT, "mediapipe"), { recursive: true });
}

const token = process.env.HF_TOKEN;
if (!token) {
  console.error("HF_TOKEN is missing: put the read token shared by Rei in apps/web/.env.local");
  process.exit(1);
}
const hub = await readJson(join(SHARED, "model-hub.json"));
const manifest = await readJson(join(SHARED, "vision-models.json"));
await mkdir(OUT, { recursive: true });
let downloaded = 0;
for (const model of Object.values(manifest.models)) {
  if (await pull(hub, model.file, model.sha256, token)) downloaded += 1;
}
await copyRuntimes(manifest);
const total = Object.keys(manifest.models).length;
console.log(`public/models: ${downloaded} downloaded, ${total - downloaded} up to date, runtimes copied`);
