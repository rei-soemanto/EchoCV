import { requireProfile } from "@/lib/db/current-profile";
import {
  initialCheckoutStage,
  isPaidPlanId,
  mergeServerPlans,
  normalizeActivePlan,
  PLANS,
  type ActivePlan,
  type PaidPlanId,
  type ServerPlan,
} from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";

import { CheckoutFlow } from "./checkout-flow";

export const metadata = { title: "Pembayaran · EchoCV" };

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function planIdFromOrderId(orderId: string | undefined): PaidPlanId | null {
  if (!orderId) return null;
  const match = /^echocv-(sprint|premium|yearly)-/.exec(orderId);
  return match && isPaidPlanId(match[1]) ? match[1] : null;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string | string[];
    status?: string | string[];
    order_id?: string | string[];
    transaction_status?: string | string[];
  }>;
}) {
  const [account, params, supabase] = await Promise.all([
    requireProfile(),
    searchParams,
    createClient(),
  ]);

  const [{ data: planRows }, { data: auth }] = await Promise.all([
    supabase
      .from("plans")
      .select("id, name, price_idr, duration_days")
      .eq("active", true)
      .order("price_idr", { ascending: true }),
    supabase.auth.getUser(),
  ]);

  const plans =
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

  const planParam = firstParam(params.plan);
  const statusParam = firstParam(params.status);
  const transactionStatusParam = firstParam(params.transaction_status);
  const rawOrderId = firstParam(params.order_id)?.trim();
  const initialOrderId = rawOrderId ? rawOrderId : null;
  const initialStage = initialCheckoutStage({
    status: statusParam,
    transaction_status: transactionStatusParam,
  });

  const selectedPlanId = isPaidPlanId(planParam)
    ? planParam
    : !planParam && initialStage !== "review"
      ? planIdFromOrderId(rawOrderId)
      : null;

  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY?.trim() || null;
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";

  return (
    <CheckoutFlow
      plans={plans}
      initialActive={initialActive}
      selectedPlanId={selectedPlanId}
      initialStage={initialStage}
      initialOrderId={initialOrderId}
      email={account.email}
      clientKey={clientKey}
      isProduction={isProduction}
    />
  );
}
