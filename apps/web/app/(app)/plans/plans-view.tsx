"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PlanCards } from "@/components/plan-cards";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  fetchCurrentPlan,
  fetchPlans,
  findPlan,
  formatPlanDate,
  INSTITUTION_NOTE,
  type ActivePlan,
  type Plan,
} from "@/lib/plans";

export function PlansView({
  initialPlans,
  initialActive,
}: {
  initialPlans: Plan[];
  initialActive: ActivePlan;
}) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [active, setActive] = useState<ActivePlan>(initialActive);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPlans(), fetchCurrentPlan()]).then(([nextPlans, currentResult]) => {
      if (cancelled) return;
      setPlans(nextPlans);
      if (currentResult.ok) {
        setActive(currentResult.plan);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeName = findPlan(plans, active.plan_id)?.name ?? active.plan_id;
  const formattedEnd = formatPlanDate(active.ends_at);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">Paket</h1>
        <p className="text-body max-w-2xl text-ink-secondary">
          Mulai gratis. Beli paket hanya saat Anda memang punya wawancara dalam waktu dekat.
        </p>
      </header>

      <p role="status" className="text-body-sm flex flex-wrap items-center gap-3 text-ink-secondary">
        {active.plan_id !== "free" ? (
          <>
            <Badge tone="success">Paket aktif: {activeName}</Badge>
            <span>
              {formattedEnd ? `Aktif sampai ${formattedEnd}. ` : ""}
              Pembayaran memakai Midtrans sandbox. Tidak ada uang sungguhan yang ditarik.
            </span>
          </>
        ) : (
          <>
            <Badge tone="accent">Paket Anda: Gratis</Badge>
            <span>Pembayaran memakai Midtrans sandbox. Tidak ada uang sungguhan yang ditarik.</span>
          </>
        )}
      </p>

      <PlanCards
        plans={plans}
        action={(plan) =>
          plan.id === "free" ? (
            <p className="text-label flex min-h-11 items-center justify-center border border-border-default text-ink-secondary">
              {active.plan_id === "free" ? "Paket Anda saat ini" : "Paket dasar"}
            </p>
          ) : (
            <Link
              href={`/plans/checkout?plan=${plan.id}`}
              className={buttonVariants({ variant: plan.featured ? "default" : "outline", className: "w-full" })}
            >
              {plan.id === active.plan_id ? `Perpanjang ${plan.name}` : plan.cta}
            </Link>
          )
        }
      />

      <section className="flex flex-col gap-2 border-t border-border-default pt-6">
        <h2 className="text-h2">Kampus dan institusi</h2>
        <p className="text-body text-ink-secondary">{INSTITUTION_NOTE}</p>
      </section>
    </div>
  );
}
