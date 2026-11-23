import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|models/|icons/|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|onnx|tflite|task|wasm)$).*)"],
};
