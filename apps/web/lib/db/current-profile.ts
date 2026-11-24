import "server-only";
import { redirect } from "next/navigation";

import { SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function currentProfile() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) throw new Error("Could not load the profile.");
  return { email: auth.user.email ?? "", fullName: (profile?.full_name as string | undefined) ?? null };
}

/** For app layouts: nobody practises before the profile and the analysis consent are saved (BR-02). */
export async function requireProfile() {
  const account = await currentProfile();
  if (!account) redirect(SIGN_IN_PATH);
  if (!account.fullName) redirect(SIGN_UP_PATH);
  return { email: account.email, fullName: account.fullName };
}
