import { createClient } from "@/lib/supabase/server";

const TABLES = ["practice_sessions", "session_questions", "answers", "uploads", "reports"] as const;

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const userId = auth.user.id;

  const [profile, consents, ...rows] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("consents").select("*").eq("user_id", userId).maybeSingle(),
    ...TABLES.map((table) => supabase.from(table).select("*").eq("user_id", userId)),
  ]);
  if (profile.error || consents.error || rows.some((result) => result.error)) {
    return Response.json({ error: "Could not collect your data. Try again in a moment." }, { status: 500 });
  }

  const exportedAt = new Date().toISOString();
  const body = {
    exported_at: exportedAt,
    account: { id: userId, email: auth.user.email ?? null, created_at: auth.user.created_at },
    profile: profile.data,
    consents: consents.data,
    ...Object.fromEntries(TABLES.map((table, index) => [table, rows[index].data ?? []])),
    note: "Answer audio and videos are files in private storage and are not included. Uploaded videos are always deleted after analysis.",
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="echocv-data-${exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
