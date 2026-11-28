import { createClient } from "@/lib/supabase/server";

import { PrivacySettings } from "./privacy-settings";

export const metadata = { title: "Privasi dan data · EchoCV" };

export default async function PrivacyPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: consents, error } = await supabase
    .from("consents")
    .select("model_training, hr_rater_sharing")
    .eq("user_id", auth.user?.id ?? "")
    .maybeSingle();
  if (error) throw new Error("Could not load the consents.");

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">Privasi dan data</h1>
        <p className="text-body text-ink-secondary">
          Anda yang mengatur data latihan Anda. Perubahan di sini berlaku untuk sesi berikutnya.
        </p>
      </header>
      <PrivacySettings
        initial={{ model_training: Boolean(consents?.model_training), hr_rater_sharing: Boolean(consents?.hr_rater_sharing) }}
      />
    </div>
  );
}
