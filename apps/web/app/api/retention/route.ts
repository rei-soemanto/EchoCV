import { timingSafeEqual } from "node:crypto";
import { expiredUploads, removeStoredFiles, type MediaConsent, type StoredUpload } from "@/lib/db/retention";
import { createAdminClient } from "@/lib/supabase/admin";

const BATCH = 500;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function run(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const admin = createAdminClient();

  const { data: setting } = await admin
    .from("retention_settings")
    .select("value")
    .eq("key", "leftover_media_hours")
    .maybeSingle();
  const hours = Number(setting?.value);
  if (!Number.isFinite(hours) || hours <= 0) {
    return Response.json({ error: "The retention setting is not set up." }, { status: 500 });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - hours * 3_600_000).toISOString();
  const { data: candidates, error } = await admin
    .from("uploads")
    .select("id, user_id, kind, bucket, storage_path, status, created_at, deleted_at")
    .is("deleted_at", null)
    .lt("created_at", cutoff)
    .limit(BATCH);
  if (error) return Response.json({ error: "Could not read the uploads." }, { status: 500 });
  const uploads = (candidates ?? []) as StoredUpload[];

  const userIds = [...new Set(uploads.map((upload) => upload.user_id))];
  const { data: consents } = userIds.length
    ? await admin.from("consents").select("user_id, model_training, hr_rater_sharing").in("user_id", userIds)
    : { data: [] };
  const consentByUser = new Map(
    ((consents ?? []) as (MediaConsent & { user_id: string })[]).map((consent) => [consent.user_id, consent]),
  );

  const expired = expiredUploads(uploads, consentByUser, now, hours);
  if (expired.length && !(await removeStoredFiles(admin, expired))) {
    return Response.json({ error: "Could not delete the expired files." }, { status: 500 });
  }
  if (expired.length) {
    await admin
      .from("uploads")
      .update({ status: "deleted", deleted_at: now.toISOString() })
      .in(
        "id",
        expired.map((upload) => upload.id),
      );
  }

  return Response.json({ deleted: expired.length, checked: uploads.length, more: uploads.length === BATCH });
}

export const GET = run;
export const POST = run;
