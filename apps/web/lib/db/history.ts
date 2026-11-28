import { summarizeHistory, type HistoryReport, type HistorySession } from "@/lib/scoring/history";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type History = ReturnType<typeof summarizeHistory>;

export async function loadHistory(supabase: Supabase, userId: string, limit: number): Promise<History | null> {
  const { data: sessions, error } = await supabase
    .from("practice_sessions")
    .select("id, created_at, role, level, language, mode, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return null;

  const ids = (sessions ?? []).map((session) => session.id);
  const { data: reports, error: reportError } = ids.length
    ? await supabase.from("reports").select("session_id, overall_score, report").in("session_id", ids)
    : { data: [], error: null };
  if (reportError) return null;

  return summarizeHistory((sessions ?? []) as HistorySession[], (reports ?? []) as HistoryReport[]);
}
