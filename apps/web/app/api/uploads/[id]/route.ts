import { isStaleProcessing, isUuid } from "@/lib/db/uploads";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Upload not found." }, { status: 404 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { data: upload } = await supabase
    .from("uploads")
    .select("id, answer_id, kind, status, failure_reason, updated_at, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!upload) return Response.json({ error: "Upload not found." }, { status: 404 });

  if (isStaleProcessing(upload.status, upload.updated_at, new Date())) {
    const { data: stopped } = await supabase
      .from("uploads")
      .update({ status: "failed", failure_reason: "timeout" })
      .eq("id", upload.id)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (stopped) {
      await supabase.from("answers").update({ status: "failed" }).eq("id", upload.answer_id).neq("status", "analyzed");
      upload.status = "failed";
      upload.failure_reason = "timeout";
    }
  }

  const { data: answer } = await supabase.from("answers").select("status").eq("id", upload.answer_id).maybeSingle();
  const answerStatus = answer?.status ?? "pending";

  return Response.json({
    upload_id: upload.id,
    answer_id: upload.answer_id,
    kind: upload.kind,
    status: upload.status,
    failure_reason: upload.failure_reason,
    answer_status: answerStatus,
    counted: answerStatus === "analyzed",
    file_deleted: upload.deleted_at !== null,
  });
}
