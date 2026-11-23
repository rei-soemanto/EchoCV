import { parseProfileRequest } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";

const PROFILE_COLUMNS = "full_name, date_of_birth, status, job_field, preferred_language";
const CONSENT_COLUMNS = "analysis, model_training, hr_rater_sharing";

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const [profile, consents] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", auth.user.id).maybeSingle(),
    supabase.from("consents").select(CONSENT_COLUMNS).eq("user_id", auth.user.id).maybeSingle(),
  ]);
  if (profile.error || consents.error) return Response.json({ error: "Could not load the profile." }, { status: 500 });
  if (!profile.data) return Response.json({ error: "No profile yet." }, { status: 404 });
  return Response.json({ profile: profile.data, consents: consents.data });
}

export async function POST(request: Request) {
  const parsed = parseProfileRequest(await request.json().catch(() => null));
  if (!parsed.ok) {
    return Response.json(
      { error: parsed.error, code: parsed.code },
      { status: parsed.code === "invalid" ? 400 : 403 },
    );
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ ...parsed.value.profile, id: auth.user.id });
  if (profileError) {
    return profileError.code === "23505"
      ? Response.json({ error: "The profile already exists." }, { status: 409 })
      : Response.json({ error: "Could not save the profile." }, { status: 500 });
  }

  const { error: consentError } = await supabase
    .from("consents")
    .insert({ ...parsed.value.consents, user_id: auth.user.id });
  if (consentError) {
    await supabase.from("profiles").delete().eq("id", auth.user.id);
    return Response.json({ error: "Could not save the consents." }, { status: 500 });
  }

  return Response.json(parsed.value, { status: 201 });
}
