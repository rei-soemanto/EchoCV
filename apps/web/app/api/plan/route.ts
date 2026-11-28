import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select("plan_id, starts_at, ends_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) return Response.json({ error: "Could not load your plan." }, { status: 500 });

  if (!subscription || new Date(subscription.ends_at).getTime() <= Date.now()) {
    return Response.json({ plan_id: "free", starts_at: null, ends_at: null });
  }
  return Response.json(subscription);
}
