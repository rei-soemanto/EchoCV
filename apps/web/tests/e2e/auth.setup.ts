import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test as setup } from "@playwright/test";

import { SIGNED_IN_STATE } from "./auth-state";

const EMAIL = process.env.E2E_EMAIL ?? "e2e-live@echocv.test";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}: copy .env.example to apps/web/.env.local and fill it in.`);
  return value;
}

setup("sign in the e2e test user", async ({ page, baseURL }) => {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const admin = createClient(url, env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const created = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true });
  if (created.error && created.error.code !== "email_exists") throw created.error;

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  if (link.error) throw link.error;
  const userId = link.data.user.id;

  const profile = await admin.from("profiles").upsert({
    id: userId,
    full_name: "Penguji E2E",
    date_of_birth: "2000-01-01",
    status: "fresh_graduate",
    job_field: "IT",
    preferred_language: "id",
  });
  if (profile.error) throw profile.error;
  const consent = await admin.from("consents").upsert({ user_id: userId, analysis: true });
  if (consent.error) throw consent.error;
  const cleared = await admin.from("practice_sessions").delete().eq("user_id", userId);
  if (cleared.error) throw cleared.error;

  const jar = new Map<string, { value: string; options: CookieOptions }>();
  const client = createServerClient(url, env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => [...jar].map(([name, { value }]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => jar.set(name, { value, options })),
    },
  });
  const verified = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (verified.error) throw verified.error;

  await page.context().addCookies([...jar].map(([name, { value }]) => ({ name, value, url: baseURL! })));
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.context().storageState({ path: SIGNED_IN_STATE });
});
