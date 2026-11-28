"use client";

import Image from "next/image";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { ConsentRow } from "@/components/ui/consent-row";
import { TextField } from "@/components/ui/text-field";
import { changeConsent, deleteAccount, type OptionalConsents } from "@/lib/privacy";

const CONFIRM_WORD = "HAPUS";

export function PrivacySettings({ initial }: { initial: OptionalConsents }) {
  const [consents, setConsents] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [consentNote, setConsentNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState<"closed" | "open" | "busy">("closed");
  const [typed, setTyped] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function toggle(key: keyof OptionalConsents, value: boolean) {
    setSaving(true);
    setConsentNote(null);
    const result = await changeConsent({ [key]: value });
    setSaving(false);
    if (!result.ok) return setConsentNote({ ok: false, text: result.message });
    setConsents(result.consents);
    setConsentNote({
      ok: true,
      text:
        result.removed > 0
          ? `Tersimpan. ${result.removed} rekaman audio yang disimpan sudah dihapus.`
          : "Tersimpan.",
    });
  }

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (typed.trim().toUpperCase() !== CONFIRM_WORD) return setDeleteError(`Ketik ${CONFIRM_WORD} untuk melanjutkan.`);
    setDeleting("busy");
    setDeleteError(null);
    const failure = await deleteAccount();
    if (failure) {
      setDeleting("open");
      return setDeleteError(failure);
    }
    window.location.replace("/?account_deleted=1"); // a full load drops everything cached for this user
  }

  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-h2">Persetujuan</h2>
        <div className="flex w-full items-center justify-between gap-6 border-t border-border-default py-5">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-label">Analisis jawaban latihan (wajib)</span>
            <span className="text-body-sm text-ink-secondary">
              Diperlukan agar sistem dapat menilai jawaban dan menyusun laporan latihan. Mode Live: video Anda dianalisis di perangkat dan tidak dikirim ke server.
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-success-bg px-2.5 py-1 text-caption font-semibold text-ink-success">
            Wajib · Selalu aktif
          </span>
        </div>
        <fieldset disabled={saving} className="contents">
          <ConsentRow
            title="Pelatihan model (opsional)"
            description="Audio jawaban Anda boleh disimpan untuk melatih model EchoCV. Jika dimatikan, audio yang sudah disimpan dihapus."
            checked={consents.model_training}
            onChange={(value) => toggle("model_training", value)}
          />
          <ConsentRow
            title="Penilaian oleh praktisi HR (opsional)"
            description="Audio jawaban Anda boleh disimpan dan dinilai praktisi HR untuk menguji skor EchoCV."
            checked={consents.hr_rater_sharing}
            onChange={(value) => toggle("hr_rater_sharing", value)}
          />
        </fieldset>
        {consentNote && (
          <p
            role={consentNote.ok ? "status" : "alert"}
            className={`text-body-sm ${consentNote.ok ? "text-ink-success" : "text-ink-danger"}`}
          >
            {consentNote.text}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border-default pt-6">
        <h2 className="text-h2">Unduh data saya</h2>
        <p className="text-body text-ink-secondary">
          Unduh salinan resmi data akun, riwayat sesi latihan, transkrip, dan laporan evaluasi Anda dalam format terstruktur JSON (portabilitas data sesuai UU PDP No. 27/2022). Berkas rekaman tidak disertakan.
        </p>
        <a href="/api/account/export" download className={buttonVariants({ variant: "outline", className: "w-fit" })}>
          <Image src="/icons/arrow-right-dark.svg" alt="" width={20} height={20} />
          Unduh salinan data
        </a>
      </section>

      <section className="flex flex-col gap-3 border-t border-border-default pt-6">
        <h2 className="text-h2">Hapus akun</h2>
        <div className="flex items-start gap-3 bg-danger-bg px-3 py-4">
          <Image src="/icons/badge-danger.svg" alt="" width={20} height={20} className="mt-0.5 shrink-0" />
          <p className="text-[15px] leading-[23px]">
            <strong className="font-semibold">Tindakan ini tidak dapat dibatalkan.</strong>
            <br />
            Akun, riwayat sesi, rekaman dan laporan Anda akan dihapus permanen.
          </p>
        </div>
        {deleting === "closed" ? (
          <button
            type="button"
            onClick={() => setDeleting("open")}
            className={buttonVariants({ variant: "outline", className: "w-fit" })}
          >
            Hapus akun saya
          </button>
        ) : (
          <form onSubmit={remove} className="flex flex-col gap-4">
            <TextField
              label={`Ketik ${CONFIRM_WORD} untuk memastikan`}
              autoComplete="off"
              value={typed}
              error={deleteError}
              onChange={(event) => setTyped(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={deleting === "busy"}
                className={buttonVariants({ variant: "destructive" })}
              >
                {deleting === "busy" ? "Menghapus…" : "Hapus permanen"}
              </button>
              <button
                type="button"
                disabled={deleting === "busy"}
                onClick={() => {
                  setDeleting("closed");
                  setTyped("");
                  setDeleteError(null);
                }}
                className={buttonVariants({ variant: "link", size: "text" })}
              >
                Batal
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
