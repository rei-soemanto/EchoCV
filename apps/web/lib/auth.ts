import { ageOn, MINIMUM_AGE } from "@/lib/age";

export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";

// Sign-in always lands on sign-up first: it asks a new user for their profile and consents, and
// sends everyone else straight on to `next`.
export function afterSignIn(next: string) {
  return `${SIGN_UP_PATH}?${new URLSearchParams({ next })}`;
}

export type SignInResult = { ok: true; url?: string } | { ok: false; message: string };

export async function signIn(
  by: { email: string } | { provider: "google" },
  next: string,
  fetcher: typeof fetch = fetch,
): Promise<SignInResult> {
  const res = await fetcher("/api/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...by, next: afterSignIn(next) }),
  }).catch(() => null);
  if (!res) return { ok: false, message: "Periksa koneksi internet, lalu coba lagi." };
  if (res.ok) {
    const body = (await res.json().catch(() => null)) as { url?: string } | null;
    return { ok: true, url: body?.url };
  }
  if (res.status === 400) return { ok: false, message: "Tulis alamat email yang benar, misalnya nama@email.com." };
  if (res.status === 429) return { ok: false, message: "Terlalu banyak permintaan. Tunggu beberapa menit, lalu coba lagi." };
  return {
    ok: false,
    message:
      "provider" in by
        ? "Masuk dengan Google belum tersedia. Gunakan email dulu."
        : "Tautan masuk belum bisa dikirim. Coba lagi sebentar lagi.",
  };
}

export async function signOut(fetcher: typeof fetch = fetch): Promise<boolean> {
  const res = await fetcher("/api/auth/sign-out", { method: "POST" }).catch(() => null);
  return Boolean(res?.ok);
}

/** Words for a date of birth that cannot sign up, or null when it can (BR-01). */
export function birthDateError(value: string, today: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today.toISOString().slice(0, 10)) {
    return "Isi tanggal lahir yang benar.";
  }
  return ageOn(value, today) < MINIMUM_AGE
    ? `EchoCV hanya untuk pengguna berusia ${MINIMUM_AGE} tahun atau lebih. Di bawah ${MINIMUM_AGE} tahun, gunakan lisensi EchoCV dari sekolah Anda.`
    : null;
}

export type ProfileForm = {
  full_name: string;
  date_of_birth: string;
  status: string;
  job_field: string;
  preferred_language: string;
  consents: { analysis: boolean; model_training: boolean; hr_rater_sharing: boolean };
};

/** POST /api/profile: null when the account is ready, else what to tell the user. */
export async function saveProfile(form: ProfileForm, fetcher: typeof fetch = fetch): Promise<string | null> {
  const res = await fetcher("/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(form),
  }).catch(() => null);
  if (!res) return "Periksa koneksi internet, lalu coba lagi.";
  if (res.ok || res.status === 409) return null; // 409: the profile is already there
  if (res.status === 401) return "Sesi masuk Anda berakhir. Masuk lagi untuk melanjutkan.";
  const body = (await res.json().catch(() => null)) as { code?: string } | null;
  if (body?.code === "under_age") {
    return `EchoCV hanya untuk pengguna berusia ${MINIMUM_AGE} tahun atau lebih.`;
  }
  if (body?.code === "consent_required") return "Izin analisis wajib agar laporan dapat dibuat.";
  return res.status === 400
    ? "Ada isian yang belum benar. Periksa lagi langkah sebelumnya."
    : "Akun belum bisa dibuat. Coba lagi sebentar lagi.";
}
