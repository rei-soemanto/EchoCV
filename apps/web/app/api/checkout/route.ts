import { basicAuth, midtransServerKey, newOrderId, parsePlanRequest, snapRequestBody, snapUrl, type PaidPlan } from "@/lib/db/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SNAP_TIMEOUT_MS = 15_000;

export async function POST(request: Request) {
  const planId = parsePlanRequest(await request.json().catch(() => null));
  if (!planId) return Response.json({ error: "Send { \"plan_id\": \"sprint\" | \"premium\" | \"yearly\" }." }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Sign in first." }, { status: 401 });

  const serverKey = midtransServerKey();
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json({ error: "Payments are not set up on this server." }, { status: 503 });
  }
  if (!serverKey) return Response.json({ error: "Payments are not set up on this server." }, { status: 503 });

  const { data: plan } = await supabase
    .from("plans")
    .select("id, name, price_idr, duration_days")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle();
  if (!plan) return Response.json({ error: "That plan does not exist." }, { status: 404 });

  const orderId = newOrderId(plan.id);
  const { error: orderError } = await admin
    .from("payment_orders")
    .insert({ id: orderId, user_id: auth.user.id, plan_id: plan.id, amount_idr: plan.price_idr });
  if (orderError) return Response.json({ error: "Could not start the payment. Try again." }, { status: 500 });

  let snap: Response;
  try {
    snap = await fetch(snapUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: basicAuth(serverKey) },
      body: JSON.stringify(snapRequestBody(orderId, plan as PaidPlan, auth.user.email ?? null)),
      signal: AbortSignal.timeout(SNAP_TIMEOUT_MS),
    });
  } catch {
    await admin.from("payment_orders").update({ status: "failed" }).eq("id", orderId);
    return Response.json({ error: "The payment service did not answer. Try again." }, { status: 502 });
  }
  const body = (await snap.json().catch(() => null)) as { token?: unknown; redirect_url?: unknown } | null;
  if (!snap.ok || typeof body?.token !== "string" || typeof body.redirect_url !== "string") {
    await admin.from("payment_orders").update({ status: "failed" }).eq("id", orderId);
    return Response.json({ error: "The payment service refused the order. Try again." }, { status: 502 });
  }

  return Response.json({ order_id: orderId, token: body.token, redirect_url: body.redirect_url }, { status: 201 });
}
