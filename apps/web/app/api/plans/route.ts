import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, price_idr, duration_days")
    .eq("active", true)
    .order("price_idr", { ascending: true });
  if (error) return Response.json({ error: "Could not load the plans." }, { status: 500 });
  return Response.json({ plans: data ?? [] });
}
