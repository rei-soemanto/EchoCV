// Privacy page calls to Life's KAN-62 API, with the reply in words the user reads.

export type OptionalConsents = { model_training: boolean; hr_rater_sharing: boolean };

const OFFLINE = "Periksa koneksi internet, lalu coba lagi.";

export async function changeConsent(
  changes: Partial<OptionalConsents>,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; consents: OptionalConsents; removed: number } | { ok: false; message: string }> {
  const res = await fetcher("/api/consents", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(changes),
  }).catch(() => null);
  if (!res) return { ok: false, message: OFFLINE };
  if (res.status === 401) return { ok: false, message: "Sesi masuk Anda berakhir. Masuk lagi untuk melanjutkan." };
  const body = (await res.json().catch(() => null)) as {
    consents?: OptionalConsents;
    removed_recordings?: number;
  } | null;
  if (!res.ok || !body?.consents) return { ok: false, message: "Persetujuan belum tersimpan. Coba lagi sebentar lagi." };
  return {
    ok: true,
    consents: {
      model_training: Boolean(body.consents.model_training),
      hr_rater_sharing: Boolean(body.consents.hr_rater_sharing),
    },
    removed: body.removed_recordings ?? 0,
  };
}

/** null when the account is gone, else what to tell the user. */
export async function deleteAccount(fetcher: typeof fetch = fetch): Promise<string | null> {
  const res = await fetcher("/api/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm: "DELETE" }),
  }).catch(() => null);
  if (!res) return OFFLINE;
  if (res.ok) return null;
  if (res.status === 401) return "Sesi masuk Anda berakhir. Masuk lagi, lalu ulangi.";
  return "Akun belum bisa dihapus, dan tidak ada data yang hilang. Coba lagi sebentar lagi.";
}
