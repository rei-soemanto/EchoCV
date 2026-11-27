"use client";

import Image from "next/image";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { MINIMUM_AGE } from "@/lib/age";
import { signIn } from "@/lib/auth";

const FAILED =
  "Masuk belum berhasil. Minta tautan baru, lalu buka di peramban yang sama dengan halaman ini.";

export function SignInForm({ next, failed }: { next: string; failed: boolean }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(failed ? FAILED : null);

  async function start(by: { email: string } | { provider: "google" }) {
    setBusy(true);
    setError(null);
    const result = await signIn(by, next);
    if (result.ok && result.url) {
      window.location.assign(result.url); // stays busy while the browser leaves for Google
      return;
    }
    setBusy(false);
    if (!result.ok) setError(result.message);
    else if ("email" in by) setSentTo(by.email);
  }

  if (sentTo) {
    return (
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <h1 className="text-h1">Periksa email Anda</h1>
        <p role="status" className="text-body text-ink-secondary">
          Tautan masuk sudah dikirim ke {sentTo}. Buka tautan itu di peramban ini. Jika belum terlihat, periksa folder
          spam.
        </p>
        <button type="button" onClick={() => setSentTo(null)} className={buttonVariants({ variant: "outline" })}>
          Ganti email atau kirim ulang
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start({ email: email.trim() });
      }}
      className="flex w-full max-w-[420px] flex-col gap-6"
    >
      <h1 className="text-h1">Masuk atau daftar</h1>
      <p className="text-body text-ink-secondary">Gunakan email Anda. Kami kirim tautan masuk, tanpa kata sandi.</p>
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        required
        maxLength={254}
        placeholder="nama@email.com"
        hint="Tautan masuk dikirim ke email ini."
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {error && (
        <p role="alert" className="text-body-sm text-ink-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={buttonVariants({ className: "w-full" })}>
        <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
        {busy ? "Memproses…" : "Lanjutkan dengan email"}
      </button>
      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="h-px flex-1 bg-border-default" />
        <span className="text-body-sm text-ink-tertiary">atau</span>
        <span className="h-px flex-1 bg-border-default" />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => start({ provider: "google" })}
        className={buttonVariants({ variant: "outline", className: "w-full" })}
      >
        Lanjutkan dengan Google
      </button>
      <p className="text-body-sm text-ink-secondary">
        Dengan melanjutkan, Anda menyetujui Syarat penggunaan dan Kebijakan privasi. Pengguna harus berusia {MINIMUM_AGE}{" "}
        tahun atau lebih.
      </p>
    </form>
  );
}
