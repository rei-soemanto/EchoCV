import { PlanCards } from "@/components/plan-cards";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { INSTITUTION_NOTE, PLANS } from "@/lib/plans";

export const metadata = { title: "Paket · EchoCV" };

// Figma 11 Paket. Payment comes with Life's Midtrans sandbox checkout (KAN-76); until that API exists,
// every account is on the free plan and the buy buttons are switched off.
export default function PlansPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">Paket</h1>
        <p className="text-body max-w-2xl text-ink-secondary">
          Mulai gratis. Beli paket hanya saat Anda memang punya wawancara dalam waktu dekat.
        </p>
      </header>

      <p role="status" className="text-body-sm flex flex-wrap items-center gap-3 text-ink-secondary">
        <Badge tone="accent">Paket Anda: Gratis</Badge>
        Pembayaran lewat Midtrans sedang disiapkan. Tombol beli aktif setelah itu siap.
      </p>

      <PlanCards
        plans={PLANS}
        action={(plan) =>
          plan.id === "free" ? (
            <p className="text-label flex min-h-11 items-center justify-center border border-border-default text-ink-secondary">
              Paket Anda saat ini
            </p>
          ) : (
            <button
              type="button"
              disabled
              className={buttonVariants({ variant: plan.featured ? "default" : "outline", className: "w-full" })}
            >
              {plan.cta}
            </button>
          )
        }
      />

      <section className="flex flex-col gap-2 border-t border-border-default pt-6">
        <h2 className="text-h2">Kampus dan institusi</h2>
        <p className="text-body text-ink-secondary">
          {INSTITUTION_NOTE}
        </p>
      </section>
    </div>
  );
}
