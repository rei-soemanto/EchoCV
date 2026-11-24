import { summarizeHistory, type HistoryReport, type HistorySession } from "@/lib/scoring/history";
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

  const { data: sessions, error } = await supabase
    .from("practice_sessions")
    .select("id, created_at, role, level, language, mode, status")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return Response.json({ error: "Could not load the practice history." }, { status: 500 });

  const ids = (sessions ?? []).map((session) => session.id);
  const { data: reports, error: reportError } = ids.length
    ? await supabase.from("reports").select("session_id, overall_score, report").in("session_id", ids)
    : { data: [], error: null };
  if (reportError) return Response.json({ error: "Could not load the practice history." }, { status: 500 });

  return Response.json(summarizeHistory((sessions ?? []) as HistorySession[], (reports ?? []) as HistoryReport[]));
}
