export type PaidPlanId = "sprint" | "premium" | "yearly";

export type PlanId = "free" | PaidPlanId;

export type Plan = {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  durationDays?: number;
  features: string[];
  cta: string;
  featured?: boolean;
};

export type ServerPlan = {
  id: string;
  name: string;
  price_idr: number;
  duration_days: number;
};

export type ActivePlan = {
  plan_id: PlanId;
  starts_at: string | null;
  ends_at: string | null;
};

export type CheckoutOrder = {
  order_id: string;
  token: string;
  redirect_url: string;
};

export type CheckoutResult =
  | { ok: true; order: CheckoutOrder }
  | { ok: false; message: string; status?: number };

export type CheckoutStage = "review" | "pending" | "success" | "failed";

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Gratis",
    price: "Rp 0",
    period: "per bulan",
    features: ["3 sesi latihan per bulan", "Laporan dengan stempel waktu", "Kuota kembali setiap tanggal 1"],
    cta: "Mulai gratis",
  },
  {
    id: "sprint",
    name: "Sprint Pass",
    price: "Rp 15.000",
    period: "untuk 7 hari",
    durationDays: 7,
    features: ["Sesi latihan selama 7 hari", "Tidak diperpanjang otomatis", "Cocok sebelum hari wawancara"],
    cta: "Beli Sprint Pass",
  },
  {
    id: "premium",
    name: "Premium",
    price: "Rp 29.000",
    period: "per bulan",
    durationDays: 30,
    features: [
      "Laporan lengkap dan perbandingan percobaan",
      "Percobaan ulang dalam satu sesi tanpa kuota tambahan",
      "Perpanjangan otomatis hanya jika Anda setuju",
    ],
    cta: "Pilih Premium",
    featured: true,
  },
  {
    id: "yearly",
    name: "Tahunan",
    price: "Rp 299.000",
    period: "per tahun",
    durationDays: 365,
    features: ["Semua fitur Premium selama setahun", "Hemat sekitar 14% dibanding bulanan", "Perpanjangan otomatis hanya jika Anda setuju"],
    cta: "Pilih Tahunan",
  },
];

export const INSTITUTION_NOTE = "Untuk kampus dan institusi: Rp 50.000 per mahasiswa per tahun.";

const FREE_ACTIVE_PLAN: ActivePlan = { plan_id: "free", starts_at: null, ends_at: null };

export function formatRupiah(amountIdr: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID").format(amountIdr)}`;
}

export function formatDurationPeriod(durationDays: number): string {
  if (durationDays === 7) return "untuk 7 hari";
  if (durationDays === 30) return "per bulan";
  if (durationDays === 365) return "per tahun";
  return `untuk ${durationDays} hari`;
}

export function formatDurationLength(durationDays: number): string {
  if (durationDays === 7) return "7 hari";
  if (durationDays === 30) return "30 hari";
  if (durationDays === 365) return "365 hari";
  return `${durationDays} hari`;
}

export function isPaidPlanId(value: string | null | undefined): value is PaidPlanId {
  return value === "sprint" || value === "premium" || value === "yearly";
}

export function mergeServerPlans(serverPlans: ServerPlan[]): Plan[] {
  const freePlan = PLANS.find((plan) => plan.id === "free") ?? PLANS[0];
  const paidPlans: Plan[] = [];
  for (const serverPlan of serverPlans) {
    if (!serverPlan || !isPaidPlanId(serverPlan.id)) continue;
    const base = PLANS.find((plan) => plan.id === serverPlan.id);
    if (!base) continue;
    paidPlans.push({
      ...base,
      name: serverPlan.name,
      price: formatRupiah(serverPlan.price_idr),
      period: formatDurationPeriod(serverPlan.duration_days),
      durationDays: serverPlan.duration_days,
    });
  }
  return paidPlans.length > 0 ? [freePlan, ...paidPlans] : PLANS;
}

export function findPlan(plans: Plan[], id: string | null | undefined): Plan | null {
  if (!id) return null;
  return plans.find((plan) => plan.id === id) ?? null;
}

export function formatPlanDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function normalizeActivePlan(
  subscription: { plan_id?: unknown; starts_at?: unknown; ends_at?: unknown } | null | undefined,
  nowMs = Date.now(),
): ActivePlan {
  if (!subscription || typeof subscription.plan_id !== "string" || !isPaidPlanId(subscription.plan_id)) {
    return FREE_ACTIVE_PLAN;
  }
  const endsAt = typeof subscription.ends_at === "string" ? subscription.ends_at : null;
  const endsMs = endsAt ? new Date(endsAt).getTime() : NaN;
  if (!endsAt || Number.isNaN(endsMs) || endsMs <= nowMs) {
    return FREE_ACTIVE_PLAN;
  }
  return {
    plan_id: subscription.plan_id,
    starts_at: typeof subscription.starts_at === "string" ? subscription.starts_at : null,
    ends_at: endsAt,
  };
}

export function isMidtransUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "app.sandbox.midtrans.com" || parsed.hostname === "app.midtrans.com")
    );
  } catch {
    return false;
  }
}

export function snapScriptUrl(isProduction: boolean): string {
  return isProduction
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";
}

export function hasSubscriptionActivated(
  current: ActivePlan,
  baseline: ActivePlan,
  expectedPlanId: PaidPlanId,
): boolean {
  if (current.plan_id === "free" || !current.ends_at) return false;
  if (baseline.plan_id === "free") return current.plan_id === expectedPlanId;
  if (baseline.ends_at) {
    return new Date(current.ends_at).getTime() > new Date(baseline.ends_at).getTime();
  }
  return current.plan_id === expectedPlanId;
}

export function initialCheckoutStage(params: {
  status?: string;
  transaction_status?: string;
}): CheckoutStage {
  const status = params.status?.toLowerCase();
  if (status === "success" || status === "pending" || status === "failed") {
    return status;
  }
  const txStatus = params.transaction_status?.toLowerCase();
  if (txStatus === "settlement" || txStatus === "capture") return "success";
  if (txStatus === "pending") return "pending";
  if (txStatus === "deny" || txStatus === "cancel" || txStatus === "expire" || txStatus === "failure") {
    return "failed";
  }
  return "review";
}

export async function fetchPlans(fetcher: typeof fetch = fetch): Promise<Plan[]> {
  const res = await fetcher("/api/plans").catch(() => null);
  if (!res || !res.ok) return PLANS;
  const body = (await res.json().catch(() => null)) as { plans?: unknown } | null;
  if (!body || !Array.isArray(body.plans)) return PLANS;
  return mergeServerPlans(body.plans as ServerPlan[]);
}

export async function fetchCurrentPlan(
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; plan: ActivePlan } | { ok: false; message: string }> {
  const res = await fetcher("/api/plan", { cache: "no-store" }).catch(() => null);
  if (!res) return { ok: false, message: "Koneksi terputus. Periksa internet Anda, lalu coba lagi." };
  if (res.status === 401) {
    return { ok: false, message: "Sesi masuk Anda berakhir. Masuk lagi untuk melihat paket Anda." };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) return { ok: false, message: "Status paket belum bisa dimuat. Coba lagi sebentar lagi." };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Data paket dari server tidak terbaca. Coba lagi sebentar lagi." };
  }
  const rawId = typeof body.plan_id === "string" ? body.plan_id : null;
  const planId: PlanId = isPaidPlanId(rawId) ? rawId : "free";
  return {
    ok: true,
    plan:
      planId === "free"
        ? FREE_ACTIVE_PLAN
        : {
            plan_id: planId,
            starts_at: typeof body.starts_at === "string" ? body.starts_at : null,
            ends_at: typeof body.ends_at === "string" ? body.ends_at : null,
          },
  };
}

export async function createCheckout(
  planId: PaidPlanId,
  fetcher: typeof fetch = fetch,
): Promise<CheckoutResult> {
  const res = await fetcher("/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan_id: planId }),
  }).catch(() => null);
  if (!res) {
    return { ok: false, message: "Koneksi terputus. Periksa internet Anda, lalu coba lagi." };
  }
  if (res.status === 401) {
    return { ok: false, status: 401, message: "Sesi masuk Anda berakhir. Masuk lagi untuk melanjutkan pembayaran." };
  }
  if (res.status === 400 || res.status === 404) {
    return { ok: false, status: res.status, message: "Paket yang dipilih tidak tersedia. Pilih paket lain." };
  }
  if (res.status === 503) {
    return { ok: false, status: 503, message: "Pembayaran sandbox Midtrans belum diaktifkan di server ini." };
  }
  if (res.status === 502) {
    return { ok: false, status: 502, message: "Layanan pembayaran Midtrans belum merespons. Coba lagi sebentar lagi." };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !res.ok ||
    !body ||
    typeof body.order_id !== "string" ||
    body.order_id === "" ||
    typeof body.token !== "string" ||
    body.token === "" ||
    typeof body.redirect_url !== "string" ||
    body.redirect_url === ""
  ) {
    return {
      ok: false,
      status: res.status,
      message: "Pembayaran belum bisa dimulai. Coba lagi sebentar lagi.",
    };
  }
  return {
    ok: true,
    order: {
      order_id: body.order_id,
      token: body.token,
      redirect_url: body.redirect_url,
    },
  };
}
