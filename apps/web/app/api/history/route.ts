import { loadHistory } from "@/lib/db/history";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw === null ? DEFAULT_LIMIT : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return Response.json({ error: `limit must be a whole number from 1 to ${MAX_LIMIT}.` }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const history = await loadHistory(supabase, auth.user.id, limit);
  if (!history) return Response.json({ error: "Could not load the practice history." }, { status: 500 });
  return Response.json(history);
}
