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
    <div className="grid gap-12 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-10">
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

      <aside className="flex flex-col gap-5 self-start rounded-xl border border-border-default bg-surface-card p-6">
        <h2 className="text-h3 font-semibold text-ink-primary">Jaminan Privasi EchoCV</h2>
        <ul className="flex flex-col gap-4 text-body-sm text-ink-secondary">
          <li className="flex flex-col gap-1 border-b border-border-default pb-3">
            <span className="font-medium text-ink-primary">Kepatuhan UU PDP No. 27/2022</span>
            <span>Anda memiliki hak penuh atas portabilitas data dan penghapusan permanen akun Anda kapan saja.</span>
          </li>
          <li className="flex flex-col gap-1 border-b border-border-default pb-3">
            <span className="font-medium text-ink-primary">Video Tetap di Perangkat</span>
            <span>Pada mode Live, video webcam dianalisis langsung di browser. Nol byte rekaman video dikirim ke server.</span>
          </li>
          <li className="flex flex-col gap-1 border-b border-border-default pb-3">
            <span className="font-medium text-ink-primary">Penghapusan Video Otomatis</span>
            <span>Pada mode Unggah, berkas video langsung dihapus permanen dari server penyimpanan setelah analisis selesai.</span>
          </li>
          <li className="flex flex-col gap-1">
            <span className="font-medium text-ink-primary">Penilaian Tanpa Bias Fisik</span>
            <span>Pakaian, penampilan, suku, ras, dan atribut fisik lainnya tidak pernah dinilai dalam skor latihan.</span>
          </li>
        </ul>
      </aside>
    </div>
  );
}
