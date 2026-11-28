"use client";

import session from "@echocv/shared/session.json";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { levelExplanation, questionSetExplanation, roleExplanation } from "@/lib/practice/setup";

const LANGUAGES: Record<string, string> = { id: "Bahasa Indonesia", en: "English" };
const MODES: Record<string, string> = { live: "Live: rekam sekarang", upload: "Unggah: rekaman video" };

type Field = "role" | "level" | "question_set" | "language" | "mode";
type Choices = Partial<Record<Field, string>>;

function SummaryItem({ label, value }: { label: string; value?: string }) {
  return (
    <div className="text-body-sm flex justify-between gap-4 border-b border-border-default pb-3">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="text-right">{value ?? "Belum dipilih"}</dd>
    </div>
  );
}

export type SetupEnums = { roles: string[]; levels: string[]; question_sets: string[] };

export function SetupForm({ enums, quick, language }: { enums: SetupEnums; quick: boolean; language: string }) {
  const router = useRouter();
  const [choices, setChoices] = useState<Choices>({ language, mode: "live" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: Field) => (value: string) => setChoices((c) => ({ ...c, [field]: value }));
  const missing = !choices.role || !choices.level || (!quick && !choices.question_set);
  const questions = quick ? session.quickStartQuestions : session.questionsPerSession;
  const minutes = Math.ceil((questions * (session.prepSeconds + session.maxAnswerSeconds)) / 60);
  const selectedRole = roleExplanation(choices.role, "id");
  const selectedLevel = levelExplanation(choices.level, "id");
  const selectedSet = questionSetExplanation(choices.question_set, choices.role, "id");

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (missing) {
      setError(quick ? "Pilih peran dan tingkat pengalaman dulu." : "Pilih peran, tingkat pengalaman dan set pertanyaan dulu.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job_field: "IT", ...choices, quick_start: quick }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: string } | null;
    if (!res?.ok || !body?.id) {
      setBusy(false);
      setError(
        res?.status === 401
          ? "Sesi masuk Anda berakhir. Masuk lagi untuk melanjutkan."
          : res?.status === 422
            ? "Belum ada pertanyaan untuk pilihan ini. Coba set pertanyaan atau tingkat lain."
            : "Sesi belum bisa dibuat. Periksa koneksi internet, lalu coba lagi.",
      );
      return;
    }
    router.push(choices.mode === "live" ? `/practice/check?session=${body.id}` : `/upload?session=${body.id}`);
  }

  return (
    <form onSubmit={start} className="flex flex-col gap-16 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <div className="flex flex-col gap-3">
          <ChoiceGroup
            name="role"
            label="Peran yang dilamar"
            options={enums.roles.map((r) => [r, roleExplanation(r, "id")?.label ?? r])}
            value={choices.role}
            onChange={set("role")}
          />
          {selectedRole && (
            <div className="text-body-sm flex flex-col gap-1 border-l-2 border-border-strong pl-4 text-ink-secondary">
              <p>{selectedRole.description}</p>
              <p>Cocok untuk: {selectedRole.best_for}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <ChoiceGroup
            name="level"
            label="Tingkat pengalaman"
            options={enums.levels.map((l) => [l, levelExplanation(l, "id")?.label ?? l])}
            value={choices.level}
            onChange={set("level")}
          />
          {selectedLevel && (
            <div className="text-body-sm flex flex-col gap-1 border-l-2 border-border-strong pl-4 text-ink-secondary">
              <p>{selectedLevel.description}</p>
              <p>Cocok untuk: {selectedLevel.best_for}</p>
            </div>
          )}
        </div>
        {!quick && (
          <div className="flex flex-col gap-3">
            <ChoiceGroup
              name="question_set"
              label="Set pertanyaan"
              hint="Pertanyaan disusun sesuai peran dan tingkat Anda."
              options={enums.question_sets.map((q) => {
                const copy = questionSetExplanation(q, choices.role, "id");
                return [q, copy?.label ?? q, copy?.description];
              })}
              value={choices.question_set}
              onChange={set("question_set")}
            />
            {selectedSet && (
              <p className="text-body-sm border-l-2 border-border-strong pl-4 text-ink-secondary">
                Cocok untuk: {selectedSet.best_for}
              </p>
            )}
          </div>
        )}
        <ChoiceGroup
          name="language"
          label="Bahasa"
          options={Object.entries(LANGUAGES)}
          value={choices.language}
          onChange={set("language")}
        />
        <ChoiceGroup
          name="mode"
          label="Mode latihan"
          hint="Mode Live memakai kamera dan mikrofon. Mode Unggah memakai rekaman yang sudah Anda punya."
          options={Object.entries(MODES)}
          value={choices.mode}
          onChange={set("mode")}
        />
      </div>

      <aside className="flex flex-col gap-4 self-start border-t border-ink-primary pt-4 lg:sticky lg:top-12 lg:w-[340px]">
        <h2 className="text-h2">Ringkasan sesi</h2>
        <dl className="flex flex-col gap-3">
          <SummaryItem label="Peran" value={selectedRole?.label ?? choices.role} />
          <SummaryItem label="Tingkat" value={selectedLevel?.label} />
          <SummaryItem label="Set" value={quick ? "Perkenalan diri" : selectedSet?.label} />
          <SummaryItem label="Bahasa" value={choices.language && LANGUAGES[choices.language]} />
          <SummaryItem label="Mode" value={choices.mode === "live" ? "Live" : "Unggah"} />
          <SummaryItem label="Perkiraan durasi" value={`${questions} pertanyaan, maks. ${minutes} menit`} />
        </dl>
        {error && (
          <p role="alert" className="text-body-sm text-ink-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={buttonVariants({ className: "w-full" })}>
          <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
          {busy ? "Menyiapkan sesi…" : choices.mode === "upload" ? "Lanjut ke unggah" : "Lanjut ke kalibrasi"}
        </button>
        <p className="text-body-sm text-ink-secondary">
          Sesi baru dihitung setelah analisis selesai. Analisis yang gagal tidak mengurangi kuota.
        </p>
      </aside>
    </form>
  );
}
