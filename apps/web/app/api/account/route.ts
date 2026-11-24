import { removeStoredFiles, type StoredUpload } from "@/lib/db/retention";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const CONFIRMATION = "DELETE";

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.confirm !== CONFIRMATION) {
    return Response.json({ error: `Send { "confirm": "${CONFIRMATION}" } to delete the account.` }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json({ error: "Account deletion is not set up on this server." }, { status: 500 });
  }

  const { data: uploads, error: listError } = await supabase
    .from("uploads")
    .select("bucket, storage_path")
    .eq("user_id", auth.user.id)
    .is("deleted_at", null);
  if (listError) return Response.json({ error: "Could not delete the account. Try again." }, { status: 500 });
  if (!(await removeStoredFiles(supabase, (uploads ?? []) as StoredUpload[]))) {
    return Response.json({ error: "Could not delete your stored recordings, so the account was kept. Try again." }, { status: 500 });
  }

  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) return Response.json({ error: "Could not delete the account. Try again." }, { status: 500 });

  await supabase.auth.signOut().catch(() => undefined);
  return new Response(null, { status: 204 });
}
