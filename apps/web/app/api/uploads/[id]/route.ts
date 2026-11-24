import { isUuid } from "@/lib/db/uploads";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Upload not found." }, { status: 404 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { data: upload } = await supabase
    .from("uploads")
    .select("id, answer_id, kind, status, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!upload) return Response.json({ error: "Upload not found." }, { status: 404 });

  const { data: answer } = await supabase.from("answers").select("status").eq("id", upload.answer_id).maybeSingle();
  const answerStatus = answer?.status ?? "pending";

  return Response.json({
    upload_id: upload.id,
    answer_id: upload.answer_id,
    kind: upload.kind,
    status: upload.status,
    answer_status: answerStatus,
    counted: answerStatus === "analyzed",
    file_deleted: upload.deleted_at !== null,
  });
}
