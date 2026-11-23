import { parseSessionUpdate } from "@/lib/db/sessions";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Session not found." }, { status: 404 });

  const parsed = parseSessionUpdate(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { data: session, error } = await supabase
    .from("practice_sessions")
    .update({ status: parsed.value, ended_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "in_progress")
    .select("id, status, ended_at")
    .maybeSingle();
  if (error) return Response.json({ error: "Could not update the session." }, { status: 500 });
  if (!session) {
    return Response.json({ error: "No session in progress with this id." }, { status: 409 });
  }
  return Response.json(session);
}
