import { keepsMedia, removeStoredFiles, type StoredUpload } from "@/lib/db/retention";
import { createClient } from "@/lib/supabase/server";

const OPTIONAL = ["model_training", "hr_rater_sharing"] as const;

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Send a JSON object." }, { status: 400 });
  }
  if ("analysis" in body && body.analysis !== true) {
    return Response.json(
      { error: "Analysis consent is required to use EchoCV. To stop all analysis, delete your account instead." },
      { status: 400 },
    );
  }
  const changes: Partial<Record<(typeof OPTIONAL)[number], boolean>> = {};
  for (const key of OPTIONAL) {
    if (key in body) {
      if (typeof body[key] !== "boolean") return Response.json({ error: `${key} must be true or false.` }, { status: 400 });
      changes[key] = body[key];
    }
  }
  if (!Object.keys(changes).length) {
    return Response.json({ error: "Send model_training and/or hr_rater_sharing." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { data: consents, error } = await supabase
    .from("consents")
    .update(changes)
    .eq("user_id", auth.user.id)
    .select("analysis, model_training, hr_rater_sharing")
    .maybeSingle();
  if (error) return Response.json({ error: "Could not save your consent." }, { status: 500 });
  if (!consents) return Response.json({ error: "Finish setting up your profile first." }, { status: 404 });

  let removedRecordings = 0;
  if (!keepsMedia(consents)) {
    const { data: kept } = await supabase
      .from("uploads")
      .select("id, bucket, storage_path")
      .eq("user_id", auth.user.id)
      .eq("kind", "audio")
      .eq("status", "processed")
      .is("deleted_at", null);
    const uploads = (kept ?? []) as StoredUpload[];
    if (uploads.length && (await removeStoredFiles(supabase, uploads))) {
      await supabase
        .from("uploads")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .in(
          "id",
          uploads.map((upload) => upload.id),
        );
      removedRecordings = uploads.length;
    }
  }

  return Response.json({ consents, removed_recordings: removedRecordings });
}
