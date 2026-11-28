"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { estimate, ProgressBar, useElapsed } from "@/components/ui/progress-bar";
import {
  createCheckout,
  fetchCurrentPlan,
  findPlan,
  formatDurationLength,
  formatPlanDate,
  hasSubscriptionActivated,
  isMidtransUrl,
  isPaidPlanId,
  snapScriptUrl,
  type ActivePlan,
  type CheckoutOrder,
  type CheckoutStage,
  type PaidPlanId,
  type Plan,
} from "@/lib/plans";

type SnapCallbacks = {
  onSuccess?: () => void;
  onPending?: () => void;
  onError?: () => void;
  onClose?: () => void;
};

declare global {
  interface Window {
    snap?: {
      pay: (token: string, callbacks: SnapCallbacks) => void;
    };
  }
}

const BASELINE_STORAGE_KEY = "echocv-checkout-baseline";

function saveCheckoutBaseline(planId: PaidPlanId, active: ActivePlan) {
  try {
    sessionStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify({ planId, active }));
  } catch {
  }
}

function readCheckoutBaseline(planId: PaidPlanId): ActivePlan | null {
  try {
    const raw = sessionStorage.getItem(BASELINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { planId?: unknown; active?: unknown } | null;
    if (!parsed || parsed.planId !== planId || !parsed.active || typeof parsed.active !== "object") {
      return null;
    }
    const candidate = parsed.active as Record<string, unknown>;
    if (candidate.plan_id !== "free" && !isPaidPlanId(typeof candidate.plan_id === "string" ? candidate.plan_id : null)) {
      return null;
    }
    return {
      plan_id: candidate.plan_id as ActivePlan["plan_id"],
      starts_at: typeof candidate.starts_at === "string" ? candidate.starts_at : null,
      ends_at: typeof candidate.ends_at === "string" ? candidate.ends_at : null,
    };
  } catch {
    return null;
  }
}

function loadSnapScript(clientKey: string | null, isProduction: boolean): Promise<boolean> {
  if (typeof window === "undefined" || !clientKey) return Promise.resolve(false);
  if (window.snap && typeof window.snap.pay === "function") return Promise.resolve(true);

  const src = snapScriptUrl(isProduction);
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset.loaded === "true") {
    return Promise.resolve(Boolean(window.snap && typeof window.snap.pay === "function"));
  }
  if (existing?.dataset.failed === "true") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const script = existing ?? document.createElement("script");
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      resolve(ok);
    };
    const onLoad = () => {
      script.dataset.loaded = "true";
      finish(Boolean(window.snap && typeof window.snap.pay === "function"));
    };
    const onError = () => {
      script.dataset.failed = "true";
      finish(false);
    };
    const timer = window.setTimeout(() => {
      finish(Boolean(window.snap && typeof window.snap.pay === "function"));
    }, 8000);

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) {
      script.src = src;
      script.async = true;
      script.setAttribute("data-client-key", clientKey);
      document.head.appendChild(script);
    }
  });
}

function CheckoutSteps({
  hasPlan,
  stage,
  webhookConfirmed,
}: {
  hasPlan: boolean;
  stage: CheckoutStage;
  webhookConfirmed: boolean;
}) {
  const step2Done = hasPlan && stage === "success";
  const step2Active = hasPlan && !step2Done;
  const step3Done = hasPlan && stage === "success" && webhookConfirmed;
  const step3Active = hasPlan && stage === "success" && !webhookConfirmed;

  return (
    <nav aria-label="Tahap pembayaran">
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <li>
          <Link
            href="/plans"
            className={`text-body-sm inline-flex min-h-11 w-full items-center gap-2 border-t-2 pt-3 ${
              hasPlan
                ? "border-ink-primary font-medium text-ink-primary hover:text-ink-accent"
                : "border-surface-accent font-semibold text-ink-accent"
            }`}
          >
            {hasPlan && <Image src="/icons/check.svg" alt="" width={16} height={16} />}
            <span>1. Pilih paket</span>
          </Link>
        </li>
        <li
          aria-current={step2Active ? "step" : undefined}
          className={`text-body-sm flex min-h-11 items-center gap-2 border-t-2 pt-3 ${
            step2Done
              ? "border-ink-primary font-medium text-ink-primary"
              : step2Active
                ? "border-surface-accent font-semibold text-ink-accent"
                : "border-border-default text-ink-tertiary"
          }`}
        >
          {step2Done && <Image src="/icons/check.svg" alt="" width={16} height={16} />}
          <span>2. Pembayaran</span>
        </li>
        <li
          aria-current={step3Active ? "step" : undefined}
          className={`text-body-sm flex min-h-11 items-center gap-2 border-t-2 pt-3 ${
            step3Done
              ? "border-ink-primary font-medium text-ink-primary"
              : step3Active
                ? "border-surface-accent font-semibold text-ink-accent"
                : "border-border-default text-ink-tertiary"
          }`}
        >
          {step3Done && <Image src="/icons/check.svg" alt="" width={16} height={16} />}
          <span>3. Konfirmasi</span>
        </li>
      </ol>
    </nav>
  );
}

export function CheckoutFlow({
  plans,
  initialActive,
  selectedPlanId,
  initialStage,
  initialOrderId,
  email,
  clientKey,
  isProduction,
}: {
  plans: Plan[];
  initialActive: ActivePlan;
  selectedPlanId: PaidPlanId | null;
  initialStage: CheckoutStage;
  initialOrderId: string | null;
  email: string;
  clientKey: string | null;
  isProduction: boolean;
}) {
  const selectedPlan = findPlan(plans, selectedPlanId);
  const paidPlanId: PaidPlanId | null =
    selectedPlan && isPaidPlanId(selectedPlan.id) ? selectedPlan.id : null;

  const [stage, setStage] = useState<CheckoutStage>(initialStage);
  const [activePlan, setActivePlan] = useState<ActivePlan>(initialActive);
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [orderId, setOrderId] = useState<string | null>(initialOrderId);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snapClosed, setSnapClosed] = useState(false);
  const [webhookConfirmed, setWebhookConfirmed] = useState(false);
  const [pollExhausted, setPollExhausted] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const baselineRef = useRef<ActivePlan>(initialActive);
  const waitingForConfirmation =
    Boolean(paidPlanId) && (stage === "pending" || (stage === "success" && !webhookConfirmed && !pollExhausted));
  const elapsedMs = useElapsed(waitingForConfirmation);

  useEffect(() => {
    if (!paidPlanId || initialStage === "review") return;
    const saved = readCheckoutBaseline(paidPlanId);
    if (saved) {
      baselineRef.current = saved;
    }
  }, [paidPlanId, initialStage]);

  useEffect(() => {
    if (!paidPlanId) return;
    const shouldPoll = stage === "pending" || (stage === "success" && !webhookConfirmed);
    if (!shouldPoll || pollExhausted) return;

    const intervalMs = stage === "pending" ? 4000 : 2500;
    const maxAttempts = stage === "pending" ? 30 : 10;
    let cancelled = false;
    let attempts = 0;
    let timerId: number | undefined;

    const runPoll = async () => {
      attempts += 1;
      const result = await fetchCurrentPlan();
      if (cancelled) return;
      if (result.ok) {
        setActivePlan(result.plan);
        if (hasSubscriptionActivated(result.plan, baselineRef.current, paidPlanId)) {
          setWebhookConfirmed(true);
          setPollExhausted(false);
          setStatusFeedback(null);
          setStage("success");
          return;
        }
      }
      if (attempts >= maxAttempts) {
        setPollExhausted(true);
        return;
      }
      timerId = window.setTimeout(runPoll, intervalMs);
    };

    timerId = window.setTimeout(runPoll, stage === "success" ? 0 : intervalMs);

    return () => {
      cancelled = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [paidPlanId, stage, webhookConfirmed, pollExhausted]);

  function openSnapPopup(nextOrder: CheckoutOrder): boolean {
    if (!window.snap || typeof window.snap.pay !== "function") return false;
    try {
      window.snap.pay(nextOrder.token, {
        onSuccess: () => {
          setSnapClosed(false);
          setPollExhausted(false);
          setStatusFeedback(null);
          setStage("success");
        },
        onPending: () => {
          setSnapClosed(false);
          setPollExhausted(false);
          setStatusFeedback(null);
          setStage("pending");
        },
        onError: () => {
          setSnapClosed(false);
          setPollExhausted(false);
          setStatusFeedback(null);
          setStage("failed");
        },
        onClose: () => {
          setSnapClosed(true);
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  function fallbackToHostedCheckout(nextOrder: CheckoutOrder) {
    if (!isMidtransUrl(nextOrder.redirect_url)) {
      setErrorMessage("Alamat pembayaran Midtrans tidak valid. Coba lagi sebentar lagi.");
      return;
    }
    const popup = window.open(nextOrder.redirect_url, "_blank", "noopener,noreferrer");
    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      window.location.href = nextOrder.redirect_url;
      return;
    }
    setSnapClosed(false);
    setPollExhausted(false);
    setStatusFeedback(null);
    setStage("pending");
  }

  async function handlePay() {
    if (!paidPlanId || loadingCheckout) return;
    setLoadingCheckout(true);
    setErrorMessage(null);
    setSnapClosed(false);
    setStatusFeedback(null);
    setPollExhausted(false);
    setWebhookConfirmed(false);

    baselineRef.current = activePlan;
    saveCheckoutBaseline(paidPlanId, activePlan);

    const result = await createCheckout(paidPlanId);
    if (!result.ok) {
      setLoadingCheckout(false);
      setErrorMessage(result.message);
      return;
    }

    setOrder(result.order);
    setOrderId(result.order.order_id);

    const snapReady = await loadSnapScript(clientKey, isProduction);
    setLoadingCheckout(false);

    if (snapReady && openSnapPopup(result.order)) {
      return;
    }
    fallbackToHostedCheckout(result.order);
  }

  async function handleReopenSnap() {
    if (!order) return;
    setErrorMessage(null);
    const snapReady = await loadSnapScript(clientKey, isProduction);
    if (snapReady && openSnapPopup(order)) {
      setSnapClosed(false);
      return;
    }
    fallbackToHostedCheckout(order);
  }

  async function handleManualCheck() {
    if (!paidPlanId || checkingStatus) return;
    setCheckingStatus(true);
    setStatusFeedback(null);
    const result = await fetchCurrentPlan();
    setCheckingStatus(false);
    if (!result.ok) {
      setStatusFeedback(result.message);
      return;
    }
    setActivePlan(result.plan);
    if (hasSubscriptionActivated(result.plan, baselineRef.current, paidPlanId)) {
      setWebhookConfirmed(true);
      setPollExhausted(false);
      setStatusFeedback(null);
      setStage("success");
      return;
    }
    setStatusFeedback("Paket belum aktif. Jika Anda baru saja membayar, tunggu sebentar lalu periksa lagi.");
  }

  function handleRetry() {
    setErrorMessage(null);
    setSnapClosed(false);
    setStatusFeedback(null);
    setPollExhausted(false);
    setWebhookConfirmed(false);
    setOrder(null);
    setOrderId(null);
    setStage("review");
  }

  const activeName = findPlan(plans, activePlan.plan_id)?.name ?? activePlan.plan_id;
  const activeEndsText = formatPlanDate(activePlan.ends_at);
  const verifiedRedirectUrl = order && isMidtransUrl(order.redirect_url) ? order.redirect_url : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar note={isProduction ? "Pembayaran" : "Pembayaran sandbox"} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pt-8 pb-16 md:px-12 md:pt-12">
        <CheckoutSteps hasPlan={Boolean(selectedPlan && paidPlanId)} stage={stage} webhookConfirmed={webhookConfirmed} />

        {!isProduction && (
          <div className="text-body-sm flex flex-wrap items-center gap-3 border-t border-border-default pt-4 text-ink-secondary">
            <Badge tone="neutral">Mode sandbox</Badge>
            <span>Transaksi ini memakai Midtrans sandbox untuk uji coba. Tidak ada uang sungguhan yang ditarik.</span>
          </div>
        )}

        {!selectedPlan || !paidPlanId ? (
          <section className="flex flex-col gap-6 border-t border-ink-primary pt-6">
            <h1 className="text-h1">Pilih paket terlebih dahulu</h1>
            <p className="text-body text-ink-secondary">
              Pilih paket berbayar dulu sebelum melanjutkan pembayaran.
            </p>
            <div>
              <Link href="/plans" className={buttonVariants()}>
                Kembali ke daftar paket
              </Link>
            </div>
          </section>
        ) : stage === "review" ? (
          <section className="flex flex-col gap-6 border-t border-ink-primary pt-6">
            <header className="flex flex-col gap-2">
              <h1 className="text-h1">Ringkasan pembayaran</h1>
              <p className="text-body text-ink-secondary">
                Periksa rincian paket sebelum melanjutkan pembayaran di Midtrans.
              </p>
            </header>

            <dl className="border-t border-border-default">
              <div className="flex flex-col gap-1 border-b border-border-default py-4 sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="text-label text-ink-secondary">Paket</dt>
                <dd className="text-body font-medium text-ink-primary">{selectedPlan.name}</dd>
              </div>
              <div className="flex flex-col gap-1 border-b border-border-default py-4 sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="text-label text-ink-secondary">Harga</dt>
                <dd className="flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-[28px] leading-[34px] tabular-nums text-ink-primary">
                    {selectedPlan.price}
                  </span>
                  <span className="text-body-sm text-ink-secondary">{selectedPlan.period}</span>
                </dd>
              </div>
              <div className="flex flex-col gap-1 border-b border-border-default py-4 sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="text-label text-ink-secondary">Masa aktif</dt>
                <dd className="text-body text-ink-primary">
                  {selectedPlan.durationDays ? formatDurationLength(selectedPlan.durationDays) : selectedPlan.period}
                </dd>
              </div>
              <div className="flex flex-col gap-1 border-b border-border-default py-4 sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="text-label text-ink-secondary">Akun</dt>
                <dd className="text-body break-all text-ink-primary">{email || "Akun EchoCV"}</dd>
              </div>
              <div className="flex flex-col gap-1 border-b border-border-default py-4 sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="text-label text-ink-secondary">Metode pembayaran</dt>
                <dd className="text-body text-ink-primary">Midtrans (QRIS, virtual account, e-wallet, kartu)</dd>
              </div>
            </dl>

            {activePlan.plan_id !== "free" && (
              <p className="text-body-sm border-l-2 border-surface-accent bg-surface-accent-subtle px-4 py-3 text-ink-primary">
                Paket {activeName} Anda masih aktif{activeEndsText ? ` sampai ${activeEndsText}` : ""}. Masa aktif
                paket baru akan ditambahkan setelah pembayaran terkonfirmasi.
              </p>
            )}

            {errorMessage && (
              <div role="alert" className="text-body-sm flex items-start gap-3 bg-danger-bg px-4 py-3 text-ink-danger">
                <Image src="/icons/badge-danger.svg" alt="" width={18} height={18} className="mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {snapClosed && (
              <div role="status" className="text-body-sm flex flex-col gap-3 border-t border-border-default pt-4 text-ink-secondary">
                <p>Jendela pembayaran ditutup sebelum selesai. Anda dapat membukanya kembali atau menyelesaikan lewat tautan Midtrans.</p>
                <div className="flex flex-wrap items-center gap-3">
                  {order && clientKey && (
                    <button
                      type="button"
                      onClick={handleReopenSnap}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      Buka lagi jendela pembayaran
                    </button>
                  )}
                  {verifiedRedirectUrl && (
                    <a
                      href={verifiedRedirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: "outline" })}
                    >
                      Buka halaman pembayaran Midtrans
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                disabled={loadingCheckout}
                onClick={handlePay}
                className={buttonVariants()}
              >
                {loadingCheckout ? "Menyiapkan pembayaran…" : "Bayar dengan Midtrans"}
                <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
              </button>
              <Link href="/plans" className={buttonVariants({ variant: "outline" })}>
                Kembali ke daftar paket
              </Link>
            </div>
          </section>
        ) : stage === "pending" ? (
          <section className="flex flex-col gap-6 border-t border-ink-primary pt-6">
            <div className="flex flex-col items-start gap-3">
              <Badge tone="warning">Menunggu pembayaran</Badge>
              <h1 className="text-h1">Menunggu konfirmasi pembayaran</h1>
              <p className="text-body text-ink-secondary">
                Selesaikan pembayaran Anda di Midtrans. Halaman ini memeriksa status aktivasi paket secara otomatis.
              </p>
            </div>

            {orderId && (
              <p className="text-body-sm text-ink-secondary">
                Nomor pesanan:{" "}
                <span className="font-mono break-all text-ink-primary">{orderId}</span>
              </p>
            )}

            {!pollExhausted ? (
              <div className="flex flex-col gap-2">
                <ProgressBar label="Menunggu konfirmasi pembayaran" value={estimate(elapsedMs, 60_000)} />
                <p role="status" className="text-body-sm text-ink-secondary">
                  Memeriksa konfirmasi dari server…
                </p>
              </div>
            ) : (
              <p role="status" className="text-body-sm text-ink-secondary">
                Pemeriksaan otomatis berhenti sementara. Jika Anda sudah membayar, tekan tombol periksa status di bawah.
              </p>
            )}

            {statusFeedback && (
              <p role="status" className="text-body-sm text-ink-secondary">
                {statusFeedback}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                disabled={checkingStatus}
                onClick={handleManualCheck}
                className={buttonVariants()}
              >
                {checkingStatus ? "Memeriksa status…" : "Periksa status paket"}
              </button>
              {verifiedRedirectUrl && (
                <a
                  href={verifiedRedirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline" })}
                >
                  Buka halaman pembayaran Midtrans
                </a>
              )}
              <Link href="/plans" className={buttonVariants({ variant: "outline" })}>
                Kembali ke paket
              </Link>
            </div>
          </section>
        ) : stage === "success" ? (
          webhookConfirmed ? (
            <section className="flex flex-col gap-6 border-t border-ink-primary pt-6">
              <div className="flex flex-col items-start gap-3">
                <Badge tone="success">Pembayaran berhasil</Badge>
                <h1 className="text-h1">Paket {selectedPlan.name} sudah aktif</h1>
                <p className="text-body text-ink-secondary">
                  Langganan Anda sudah terkonfirmasi dan siap dipakai untuk latihan wawancara.
                </p>
              </div>

              <dl className="border-t border-border-default">
                <div className="flex flex-col gap-1 border-b border-border-default py-4 sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="text-label text-ink-secondary">Paket aktif</dt>
                  <dd className="text-body font-medium text-ink-primary">{selectedPlan.name}</dd>
                </div>
                <div className="flex flex-col gap-1 border-b border-border-default py-4 sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="text-label text-ink-secondary">Berlaku sampai</dt>
                  <dd className="text-body text-ink-primary">{activeEndsText ?? "Aktif"}</dd>
                </div>
                {orderId && (
                  <div className="flex flex-col gap-1 border-b border-border-default py-4 sm:flex-row sm:items-baseline sm:justify-between">
                    <dt className="text-label text-ink-secondary">Nomor pesanan</dt>
                    <dd className="text-body-sm font-mono break-all text-ink-primary">{orderId}</dd>
                  </div>
                )}
              </dl>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link href="/practice" className={buttonVariants()}>
                  Mulai latihan
                  <Image src="/icons/arrow-right.svg" alt="" width={20} height={20} />
                </Link>
                <Link href="/plans" className={buttonVariants({ variant: "outline" })}>
                  Lihat halaman paket
                </Link>
              </div>
            </section>
          ) : (
            <section className="flex flex-col gap-6 border-t border-ink-primary pt-6">
              <div className="flex flex-col items-start gap-3">
                <Badge tone="accent">Mengaktifkan paket</Badge>
                <h1 className="text-h1">Pembayaran diterima, menunggu konfirmasi server</h1>
              </div>

              {!pollExhausted ? (
                <div className="flex flex-col gap-3">
                  <p className="text-body text-ink-secondary">
                    Kami sedang menunggu konfirmasi resmi dari Midtrans untuk mengaktifkan paket {selectedPlan.name}.
                  </p>
                  <ProgressBar label="Mengaktifkan paket" value={estimate(elapsedMs, 15_000)} />
                </div>
              ) : (
                <p role="status" className="text-body text-ink-secondary">
                  Konfirmasi server membutuhkan waktu sedikit lebih lama. Anda bisa memeriksa status paket kembali
                  atau melihat halaman paket Anda.
                </p>
              )}

              {orderId && (
                <p className="text-body-sm text-ink-secondary">
                  Nomor pesanan:{" "}
                  <span className="font-mono break-all text-ink-primary">{orderId}</span>
                </p>
              )}

              {statusFeedback && (
                <p role="status" className="text-body-sm text-ink-secondary">
                  {statusFeedback}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  disabled={checkingStatus}
                  onClick={handleManualCheck}
                  className={buttonVariants()}
                >
                  {checkingStatus ? "Memeriksa status…" : "Periksa status paket"}
                </button>
                <Link href="/plans" className={buttonVariants({ variant: "outline" })}>
                  Lihat halaman paket
                </Link>
                {pollExhausted && (
                  <Link href="/practice" className={buttonVariants({ variant: "outline" })}>
                    Ke halaman latihan
                  </Link>
                )}
              </div>
            </section>
          )
        ) : (
          <section className="flex flex-col gap-6 border-t border-ink-primary pt-6">
            <div className="flex flex-col items-start gap-3">
              <Badge tone="danger">Pembayaran gagal</Badge>
              <h1 className="text-h1">Pembayaran belum berhasil</h1>
              <p className="text-body text-ink-secondary">
                Paket Anda tidak berubah dan tidak ada biaya yang ditarik.
              </p>
            </div>

            {orderId && (
              <p className="text-body-sm text-ink-secondary">
                Nomor pesanan:{" "}
                <span className="font-mono break-all text-ink-primary">{orderId}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button type="button" onClick={handleRetry} className={buttonVariants()}>
                Coba bayar lagi
              </button>
              <Link href="/plans" className={buttonVariants({ variant: "outline" })}>
                Pilih paket lain
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
