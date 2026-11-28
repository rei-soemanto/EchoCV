import { amountMatches, midtransServerKey, parseNotification, paymentOutcome, signatureMatches } from "@/lib/db/payments";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request) {
  const serverKey = midtransServerKey();
  if (!serverKey) return Response.json({ error: "Payments are not set up on this server." }, { status: 503 });

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "Too large." }, { status: 413 });
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const notification = parseNotification(raw);
  if (!notification) return Response.json({ error: "Not a Midtrans notification." }, { status: 400 });
  if (!signatureMatches(notification, serverKey)) return Response.json({ error: "Bad signature." }, { status: 401 });

  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("payment_orders")
    .select("id, amount_idr, status")
    .eq("id", notification.order_id)
    .maybeSingle();
  if (error) return Response.json({ error: "Could not read the order." }, { status: 500 });
  if (!order) return Response.json({ error: "Unknown order." }, { status: 404 });
  if (!amountMatches(notification.gross_amount, order.amount_idr)) {
    return Response.json({ error: "The amount does not match the order." }, { status: 400 });
  }

  const outcome = paymentOutcome(notification);
  if (outcome === "paid") {
    const { error: payError } = await admin.rpc("complete_payment", {
      p_order_id: order.id,
      p_transaction_id: notification.transaction_id ?? null,
    });
    if (payError) return Response.json({ error: "Could not activate the plan." }, { status: 500 });
  } else if (outcome !== "pending" && order.status === "pending") {
    const { error: closeError } = await admin
      .from("payment_orders")
      .update({ status: outcome })
      .eq("id", order.id)
      .eq("status", "pending");
    if (closeError) return Response.json({ error: "Could not update the order." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
