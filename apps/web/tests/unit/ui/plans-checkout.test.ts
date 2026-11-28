import { describe, expect, it, vi } from "vitest";

import {
  createCheckout,
  fetchCurrentPlan,
  fetchPlans,
  findPlan,
  formatDurationLength,
  formatDurationPeriod,
  formatPlanDate,
  formatRupiah,
  hasSubscriptionActivated,
  initialCheckoutStage,
  isMidtransUrl,
  isPaidPlanId,
  mergeServerPlans,
  normalizeActivePlan,
  PLANS,
  snapScriptUrl,
  type ActivePlan,
} from "@/lib/plans";

function reply(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function fakeFetch(responseOrError: Response | Error) {
  const fn = vi.fn(async () => {
    if (responseOrError instanceof Error) throw responseOrError;
    return responseOrError;
  });
  return fn as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

describe("formatting and plan lookup helpers", () => {
  it("formats rupiah amounts in Indonesian locale", () => {
    expect(formatRupiah(0)).toBe("Rp 0");
    expect(formatRupiah(15000)).toBe("Rp 15.000");
    expect(formatRupiah(29000)).toBe("Rp 29.000");
    expect(formatRupiah(299000)).toBe("Rp 299.000");
  });

  it("formats duration period and length", () => {
    expect(formatDurationPeriod(7)).toBe("untuk 7 hari");
    expect(formatDurationPeriod(30)).toBe("per bulan");
    expect(formatDurationPeriod(365)).toBe("per tahun");
    expect(formatDurationPeriod(14)).toBe("untuk 14 hari");

    expect(formatDurationLength(7)).toBe("7 hari");
    expect(formatDurationLength(30)).toBe("30 hari");
    expect(formatDurationLength(365)).toBe("365 hari");
    expect(formatDurationLength(14)).toBe("14 hari");
  });

  it("identifies paid plan ids and finds plans", () => {
    expect(isPaidPlanId("sprint")).toBe(true);
    expect(isPaidPlanId("premium")).toBe(true);
    expect(isPaidPlanId("yearly")).toBe(true);
    expect(isPaidPlanId("free")).toBe(false);
    expect(isPaidPlanId("enterprise")).toBe(false);
    expect(isPaidPlanId(null)).toBe(false);
    expect(isPaidPlanId(undefined)).toBe(false);

    expect(findPlan(PLANS, "premium")?.name).toBe("Premium");
    expect(findPlan(PLANS, "free")?.name).toBe("Gratis");
    expect(findPlan(PLANS, "unknown")).toBeNull();
    expect(findPlan(PLANS, null)).toBeNull();
  });

  it("merges server plans while keeping free first and server order", () => {
    const merged = mergeServerPlans([
      { id: "yearly", name: "Tahunan Promo", price_idr: 250000, duration_days: 365 },
      { id: "unknown", name: "Unknown", price_idr: 999999, duration_days: 10 },
      { id: "sprint", name: "Sprint Baru", price_idr: 19000, duration_days: 7 },
    ]);

    expect(merged.map((plan) => plan.id)).toEqual(["free", "yearly", "sprint"]);
    expect(merged[0]).toEqual(PLANS[0]);
    expect(merged[1]).toMatchObject({
      id: "yearly",
      name: "Tahunan Promo",
      price: "Rp 250.000",
      period: "per tahun",
      durationDays: 365,
      cta: "Pilih Tahunan",
      features: PLANS[3].features,
    });
    expect(merged[2]).toMatchObject({
      id: "sprint",
      name: "Sprint Baru",
      price: "Rp 19.000",
      period: "untuk 7 hari",
      durationDays: 7,
      cta: "Beli Sprint Pass",
    });
  });

  it("falls back to PLANS when no valid paid server plans match", () => {
    expect(mergeServerPlans([])).toBe(PLANS);
    expect(
      mergeServerPlans([{ id: "free", name: "Free", price_idr: 0, duration_days: 30 }]),
    ).toBe(PLANS);
  });

  it("formats Indonesian long dates and rejects invalid dates", () => {
    const iso = "2026-12-05T10:00:00Z";
    const expected = new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));

    expect(formatPlanDate(iso)).toBe(expected);
    expect(formatPlanDate(null)).toBeNull();
    expect(formatPlanDate("")).toBeNull();
    expect(formatPlanDate("not-a-date")).toBeNull();
  });

  it("normalizes subscription rows safely", () => {
    const now = new Date("2026-11-28T00:00:00Z").getTime();
    expect(normalizeActivePlan(null, now)).toEqual({
      plan_id: "free",
      starts_at: null,
      ends_at: null,
    });
    expect(
      normalizeActivePlan(
        { plan_id: "unknown", starts_at: "2026-11-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z" },
        now,
      ),
    ).toEqual({ plan_id: "free", starts_at: null, ends_at: null });
    expect(
      normalizeActivePlan(
        { plan_id: "sprint", starts_at: "2026-11-20T00:00:00Z", ends_at: "2026-11-27T00:00:00Z" },
        now,
      ),
    ).toEqual({ plan_id: "free", starts_at: null, ends_at: null });
    expect(
      normalizeActivePlan(
        { plan_id: "premium", starts_at: "2026-11-20T00:00:00Z", ends_at: "2026-12-20T00:00:00Z" },
        now,
      ),
    ).toEqual({
      plan_id: "premium",
      starts_at: "2026-11-20T00:00:00Z",
      ends_at: "2026-12-20T00:00:00Z",
    });
  });
});

describe("Midtrans and checkout helpers", () => {
  it("validates Midtrans URLs strictly", () => {
    expect(isMidtransUrl("https://app.sandbox.midtrans.com/snap/v4/redirection/abc")).toBe(true);
    expect(isMidtransUrl("https://app.midtrans.com/snap/v4/redirection/abc")).toBe(true);
    expect(isMidtransUrl("http://app.sandbox.midtrans.com/snap/v4/redirection/abc")).toBe(false);
    expect(isMidtransUrl("https://app.sandbox.midtrans.com.evil.example/x")).toBe(false);
    expect(isMidtransUrl("https://example.com/pay")).toBe(false);
    expect(isMidtransUrl("javascript:alert(1)")).toBe(false);
    expect(isMidtransUrl("not-a-url")).toBe(false);
  });

  it("picks sandbox or production Snap script URL", () => {
    expect(snapScriptUrl(false)).toBe("https://app.sandbox.midtrans.com/snap/snap.js");
    expect(snapScriptUrl(true)).toBe("https://app.midtrans.com/snap/snap.js");
  });

  it("detects subscription activation across free and renewal baselines", () => {
    const freeBaseline: ActivePlan = { plan_id: "free", starts_at: null, ends_at: null };
    const sprintActive: ActivePlan = {
      plan_id: "sprint",
      starts_at: "2026-11-28T00:00:00Z",
      ends_at: "2026-12-05T00:00:00Z",
    };

    expect(hasSubscriptionActivated(freeBaseline, freeBaseline, "sprint")).toBe(false);
    expect(
      hasSubscriptionActivated({ plan_id: "sprint", starts_at: null, ends_at: null }, freeBaseline, "sprint"),
    ).toBe(false);
    expect(hasSubscriptionActivated(sprintActive, freeBaseline, "sprint")).toBe(true);
    expect(hasSubscriptionActivated(sprintActive, freeBaseline, "premium")).toBe(false);

    expect(hasSubscriptionActivated(sprintActive, sprintActive, "sprint")).toBe(false);
    expect(
      hasSubscriptionActivated(
        { ...sprintActive, ends_at: "2026-12-12T00:00:00Z" },
        sprintActive,
        "sprint",
      ),
    ).toBe(true);

    expect(
      hasSubscriptionActivated(
        { plan_id: "premium", starts_at: null, ends_at: "2026-12-28T00:00:00Z" },
        { plan_id: "sprint", starts_at: null, ends_at: null },
        "premium",
      ),
    ).toBe(true);
  });

  it("maps initial checkout stage from status and transaction_status", () => {
    expect(initialCheckoutStage({ status: "success" })).toBe("success");
    expect(initialCheckoutStage({ status: "pending" })).toBe("pending");
    expect(initialCheckoutStage({ status: "failed" })).toBe("failed");

    expect(initialCheckoutStage({ transaction_status: "settlement" })).toBe("success");
    expect(initialCheckoutStage({ transaction_status: "capture" })).toBe("success");
    expect(initialCheckoutStage({ transaction_status: "pending" })).toBe("pending");
    expect(initialCheckoutStage({ transaction_status: "deny" })).toBe("failed");
    expect(initialCheckoutStage({ transaction_status: "cancel" })).toBe("failed");
    expect(initialCheckoutStage({ transaction_status: "expire" })).toBe("failed");
    expect(initialCheckoutStage({ transaction_status: "failure" })).toBe("failed");

    expect(initialCheckoutStage({})).toBe("review");
    expect(initialCheckoutStage({ status: "other", transaction_status: "unknown" })).toBe("review");
  });
});

describe("plans and checkout fetch clients", () => {
  it("fetches server plans and falls back on errors", async () => {
    const okFetch = fakeFetch(
      reply(200, {
        plans: [{ id: "premium", name: "Premium Live", price_idr: 35000, duration_days: 30 }],
      }),
    );
    const loaded = await fetchPlans(okFetch);
    expect(okFetch).toHaveBeenCalledWith("/api/plans");
    expect(loaded.map((plan) => plan.id)).toEqual(["free", "premium"]);
    expect(loaded[1]).toMatchObject({ name: "Premium Live", price: "Rp 35.000" });

    expect(await fetchPlans(fakeFetch(reply(500, { error: "fail" })))).toBe(PLANS);
    expect(await fetchPlans(fakeFetch(reply(200, { plans: "invalid" })))).toBe(PLANS);
    expect(await fetchPlans(fakeFetch(new Response("{bad", { status: 200 })))).toBe(PLANS);
    expect(await fetchPlans(fakeFetch(new TypeError("offline")))).toBe(PLANS);
  });

  it("fetches current plan with no-store and normalizes responses", async () => {
    const okFetch = fakeFetch(
      reply(200, {
        plan_id: "sprint",
        starts_at: "2026-11-28T00:00:00Z",
        ends_at: "2026-12-05T00:00:00Z",
      }),
    );
    expect(await fetchCurrentPlan(okFetch)).toEqual({
      ok: true,
      plan: {
        plan_id: "sprint",
        starts_at: "2026-11-28T00:00:00Z",
        ends_at: "2026-12-05T00:00:00Z",
      },
    });
    expect(okFetch).toHaveBeenCalledWith("/api/plan", { cache: "no-store" });

    expect(await fetchCurrentPlan(fakeFetch(reply(200, { plan_id: "unknown" })))).toEqual({
      ok: true,
      plan: { plan_id: "free", starts_at: null, ends_at: null },
    });

    expect(await fetchCurrentPlan(fakeFetch(reply(401, { error: "Sign in first." })))).toEqual({
      ok: false,
      message: "Sesi masuk Anda berakhir. Masuk lagi untuk melihat paket Anda.",
    });
    expect(await fetchCurrentPlan(fakeFetch(reply(500, { error: "DB error" })))).toEqual({
      ok: false,
      message: "Status paket belum bisa dimuat. Coba lagi sebentar lagi.",
    });
    expect(await fetchCurrentPlan(fakeFetch(new Response("not json", { status: 200 })))).toEqual({
      ok: false,
      message: "Data paket dari server tidak terbaca. Coba lagi sebentar lagi.",
    });
    expect(await fetchCurrentPlan(fakeFetch(new TypeError("offline")))).toEqual({
      ok: false,
      message: "Koneksi terputus. Periksa internet Anda, lalu coba lagi.",
    });
  });

  it("creates checkout with plan_id only and handles all error statuses", async () => {
    const okFetch = fakeFetch(
      reply(201, {
        order_id: "echocv-premium-123",
        token: "snap-token-123",
        redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/abc",
      }),
    );
    const result = await createCheckout("premium", okFetch);
    expect(result).toEqual({
      ok: true,
      order: {
        order_id: "echocv-premium-123",
        token: "snap-token-123",
        redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/abc",
      },
    });
    expect(okFetch.mock.calls[0][0]).toBe("/api/checkout");
    const init = okFetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ plan_id: "premium" });

    expect(
      await createCheckout("sprint", fakeFetch(reply(201, { order_id: "o1" }))),
    ).toEqual({
      ok: false,
      status: 201,
      message: "Pembayaran belum bisa dimulai. Coba lagi sebentar lagi.",
    });

    const errorCases: [number, string][] = [
      [401, "Sesi masuk Anda berakhir. Masuk lagi untuk melanjutkan pembayaran."],
      [400, "Paket yang dipilih tidak tersedia. Pilih paket lain."],
      [404, "Paket yang dipilih tidak tersedia. Pilih paket lain."],
      [503, "Pembayaran sandbox Midtrans belum diaktifkan di server ini."],
      [502, "Layanan pembayaran Midtrans belum merespons. Coba lagi sebentar lagi."],
      [500, "Pembayaran belum bisa dimulai. Coba lagi sebentar lagi."],
    ];
    for (const [status, message] of errorCases) {
      expect(await createCheckout("sprint", fakeFetch(reply(status, { error: "err" })))).toEqual({
        ok: false,
        status,
        message,
      });
    }

    expect(await createCheckout("yearly", fakeFetch(new TypeError("offline")))).toEqual({
      ok: false,
      message: "Koneksi terputus. Periksa internet Anda, lalu coba lagi.",
    });
  });
});
