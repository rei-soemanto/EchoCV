import { NextResponse } from "next/server";
import { SIGN_IN_PATH } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/supabase/proxy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin));
  }

  const failed = new URL(SIGN_IN_PATH, url.origin);
  failed.searchParams.set("auth_error", "1");
  return NextResponse.redirect(failed);
}
