import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/supabase/proxy";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const next = safeNextPath(typeof body?.next === "string" ? body.next : null);
  const callback = new URL("/api/auth/callback", request.url);
  callback.searchParams.set("next", next);

  const supabase = await createClient();

  if (body?.provider === "google") {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) return Response.json({ error: "Google sign-in is not available right now." }, { status: 502 });
    return Response.json({ url: data.url });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (email.length > 254 || !EMAIL.test(email)) {
    return Response.json({ error: "Send provider \"google\" or a valid email." }, { status: 400 });
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
  });
  if (error) {
    return Response.json(
      { error: "The sign-in link could not be sent. Try again in a moment." },
      { status: error.status === 429 ? 429 : 502 },
    );
  }
  return Response.json({ sent: true });
}
