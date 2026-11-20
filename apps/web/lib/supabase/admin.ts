import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv, supabaseUrl } from "./env";

export function createAdminClient() {
  return createClient(supabaseUrl(), requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
