import {
  mergeServerPlans,
  normalizeActivePlan,
  PLANS,
  type ActivePlan,
  type ServerPlan,
} from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";

import { PlansView } from "./plans-view";

export const metadata = { title: "Paket · EchoCV" };

export default async function PlansPage() {
  const supabase = await createClient();
  const [{ data: planRows }, { data: auth }] = await Promise.all([
    supabase
      .from("plans")
      .select("id, name, price_idr, duration_days")
      .eq("active", true)
      .order("price_idr", { ascending: true }),
    supabase.auth.getUser(),
  ]);

  const initialPlans =
    Array.isArray(planRows) && planRows.length > 0
      ? mergeServerPlans(planRows as ServerPlan[])
      : PLANS;

  let initialActive: ActivePlan = { plan_id: "free", starts_at: null, ends_at: null };
  if (auth.user) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("plan_id, starts_at, ends_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    initialActive = normalizeActivePlan(subscription);
  }

  return <PlansView initialPlans={initialPlans} initialActive={initialActive} />;
}
