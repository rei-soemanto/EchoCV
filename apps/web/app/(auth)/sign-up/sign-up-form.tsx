"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ConsentRow } from "@/components/ui/consent-row";
import { DateFields } from "@/components/ui/date-fields";
import { TextField } from "@/components/ui/text-field";
import { MINIMUM_AGE } from "@/lib/age";
import { birthDateError, saveProfile, SIGN_IN_PATH, signOut, type ProfileForm } from "@/lib/auth";

// Figma 03 Daftar. The values are the ones POST /api/profile accepts; the labels are ours.
// Sign-in already created the account, so the design's email and password step asks for the date
// of birth instead, which the API needs (BR-01).
const STEPS = [
  { title: "Siapa nama Anda?", intro: "Nama ini tampil di laporan latihan Anda." },
  { title: "Kapan Anda lahir?", intro: "Kami memakainya hanya untuk memastikan usia Anda." },
  { title: "Ceritakan sedikit tentang Anda", intro: "Kami memakai ini untuk memilih pertanyaan latihan yang sesuai." },
  { title: "Bahasa dan privasi", intro: "Pilih bahasa wawancara, lalu setujui pemrosesan rekaman latihan Anda." },
];
const STATUSES: [string, string][] = [
  ["student", "Mahasiswa"],
  ["fresh_graduate", "Lulusan baru"],
  ["employed", "Sudah bekerja"],
  ["looking_for_work", "Mencari kerja"],
];
const JOB_FIELDS: [string, string][] = [["IT", "Teknologi informasi"]];
const LANGUAGES: [string, string][] = [
  ["id", "Bahasa Indonesia"],
  ["en", "English"],
];

export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProfileForm>({
    full_name: "",
    date_of_birth: "",
    status: "",
    job_field: "IT",
    preferred_language: "id",
    consents: { analysis: false, model_training: false, hr_rater_sharing: false },
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  // Moving between steps replaces the form, so take keyboard and screen reader users to its heading.
  useEffect(() => {
    if (firstStep.current) firstStep.current = false;
    else heading.current?.focus();
  }, [step]);

  const set = (changes: Partial<ProfileForm>) => {
    setError(null);
    setForm((f) => ({ ...f, ...changes }));
  };
  const consent = (key: keyof ProfileForm["consents"]) => (checked: boolean) =>
    set({ consents: { ...form.consents, [key]: checked } });

  function problem(): string | null {
    if (step === 0) return form.full_name.trim() ? null : "Isi nama Anda.";
    if (step === 1) return birthDateError(form.date_of_birth);
    if (step === 2) return form.status ? null : "Pilih status Anda.";
    return form.consents.analysis ? null : "Izin analisis wajib agar laporan dapat dibuat.";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const message = problem();
    setError(message);
    if (message) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    const failure = await saveProfile(form);
    if (failure) {
      setBusy(false);
      setError(failure);
      return;
    }
    router.replace(next);
  }

  async function back() {
    setError(null);
    if (step > 0) {
      setStep(step - 1);
      return;
    }
    // Back from the first step means another account: sign out, or sign-in would return here.
    if (await signOut()) router.replace(SIGN_IN_PATH);
    else setError("Belum bisa keluar. Coba lagi.");
  }

  const fieldError = step < 2 ? error : null;

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-[640px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.title} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-surface-accent" : "bg-border-default"}`} />
          ))}
        </div>
        <p className="text-body-sm text-ink-secondary">
          Langkah {step + 1} dari {STEPS.length}
        </p>
      </div>
      <h1 ref={heading} tabIndex={-1} className="text-h1 outline-none">
        {STEPS[step].title}
      </h1>
      <p className="text-body text-ink-secondary">{STEPS[step].intro}</p>

      {step === 0 && (
        <TextField
          label="Nama"
          name="name"
          autoComplete="name"
          placeholder="Nama lengkap"
          maxLength={100}
          hint="Nama ini tampil di laporan Anda."
          error={fieldError}
          value={form.full_name}
          onChange={(event) => set({ full_name: event.target.value })}
        />
      )}
      {step === 1 && (
        <DateFields
          label="Tanggal lahir"
          hint={`Pengguna harus berusia ${MINIMUM_AGE} tahun atau lebih.`}
          error={fieldError}
          onChange={(date_of_birth) => set({ date_of_birth })}
        />
      )}
      {step === 2 && (
        <>
          <ChoiceGroup
            name="status"
            label="Status Anda"
            options={STATUSES}
            value={form.status}
            onChange={(status) => set({ status })}
          />
          <ChoiceGroup
            name="job_field"
            label="Bidang atau industri"
            hint="Saat ini EchoCV baru punya pertanyaan untuk bidang ini."
            options={JOB_FIELDS}
            value={form.job_field}
            onChange={(job_field) => set({ job_field })}
          />
        </>
      )}
      {step === 3 && (
        <>
          <ChoiceGroup
            name="preferred_language"
            label="Bahasa wawancara"
            options={LANGUAGES}
            value={form.preferred_language}
            onChange={(preferred_language) => set({ preferred_language })}
          />
          <div className="flex flex-col gap-2">
            <h2 className="text-h3">Privasi Anda</h2>
            <ConsentRow
              title="Analisis jawaban latihan (wajib)"
              description="Agar laporan dapat dibuat. Mode Live: video Anda dianalisis di perangkat dan tidak dikirim ke server."
              checked={form.consents.analysis}
              onChange={consent("analysis")}
            />
            <ConsentRow
              title="Pelatihan model (opsional)"
              description="Audio jawaban Anda boleh disimpan untuk melatih model EchoCV. Tanpa izin ini, audio dihapus setelah laporan dibuat."
              checked={form.consents.model_training}
              onChange={consent("model_training")}
            />
            <ConsentRow
              title="Penilaian oleh praktisi HR (opsional)"
              description="Audio jawaban Anda boleh disimpan dan dinilai praktisi HR untuk menguji skor EchoCV."
              checked={form.consents.hr_rater_sharing}
              onChange={consent("hr_rater_sharing")}
            />
          </div>
        </>
      )}

      {error && step >= 2 && (
        <p role="alert" className="text-body-sm text-ink-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className={buttonVariants()}>
          <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
          {step < STEPS.length - 1 ? "Lanjut" : busy ? "Membuat akun…" : "Buat akun"}
        </button>
        <button type="button" disabled={busy} onClick={back} className={buttonVariants({ variant: "link", size: "text" })}>
          Kembali
        </button>
      </div>
    </form>
  );
}
