import type { Plan } from "@/lib/plans";

export function PlanCards({ plans, action }: { plans: Plan[]; action: (plan: Plan) => React.ReactNode }) {
  return (
    <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => (
        <div key={plan.id} className="flex flex-col gap-4">
          <div
            className={`flex flex-1 flex-col gap-3 border-t py-6 ${plan.featured ? "border-surface-accent bg-surface-accent-subtle px-4" : "border-ink-primary"}`}
          >
            <h3 className="text-label text-ink-secondary">{plan.name}</h3>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-[44px] leading-[48px]">{plan.price}</span>
              <span className="text-body-sm text-ink-secondary">{plan.period}</span>
            </p>
            <ul className="text-body-sm flex flex-col gap-1 text-ink-secondary">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
          {action(plan)}
        </div>
      ))}
    </div>
  );
}
