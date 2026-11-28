import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export type PaidPlan = { id: string; name: string; price_idr: number; duration_days: number };

export type MidtransNotification = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  transaction_id?: string;
  fraud_status?: string;
};

export type PaymentOutcome = "paid" | "failed" | "expired" | "pending";

const SANDBOX_SNAP_URL = "https://app.sandbox.midtrans.com/snap/v1/transactions";
const PRODUCTION_SNAP_URL = "https://app.midtrans.com/snap/v1/transactions";

export function midtransServerKey(): string | null {
  return process.env.MIDTRANS_SERVER_KEY || null;
}

export function snapUrl(): string {
  return process.env.MIDTRANS_IS_PRODUCTION === "true" ? PRODUCTION_SNAP_URL : SANDBOX_SNAP_URL;
}

export function newOrderId(planId: string): string {
  return `echocv-${planId}-${randomUUID().replace(/-/g, "")}`;
}

export function parsePlanRequest(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const planId = (body as Record<string, unknown>).plan_id;
  return typeof planId === "string" && /^[a-z]{1,32}$/.test(planId) ? planId : null;
}

export function parseNotification(body: unknown): MidtransNotification | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const required = ["order_id", "status_code", "gross_amount", "signature_key", "transaction_status"] as const;
  if (!required.every((key) => typeof record[key] === "string" && record[key] !== "")) return null;
  for (const key of ["transaction_id", "fraud_status"] as const) {
    if (key in record && typeof record[key] !== "string") return null;
  }
  return record as MidtransNotification;
}

export function signatureMatches(notification: MidtransNotification, serverKey: string): boolean {
  const expected = createHash("sha512")
    .update(notification.order_id + notification.status_code + notification.gross_amount + serverKey)
    .digest("hex");
  const given = Buffer.from(notification.signature_key.toLowerCase());
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export function amountMatches(grossAmount: string, amountIdr: number): boolean {
  const value = Number(grossAmount);
  return Number.isFinite(value) && value === amountIdr;
}

export function paymentOutcome(notification: MidtransNotification): PaymentOutcome {
  const { transaction_status: status, fraud_status: fraud } = notification;
  if (status === "settlement") return "paid";
  if (status === "capture") return fraud === undefined || fraud === "accept" ? "paid" : "pending";
  if (status === "expire") return "expired";
  if (status === "deny" || status === "cancel" || status === "failure") return "failed";
  return "pending";
}

export function snapRequestBody(orderId: string, plan: PaidPlan, email: string | null) {
  return {
    transaction_details: { order_id: orderId, gross_amount: plan.price_idr },
    item_details: [{ id: plan.id, price: plan.price_idr, quantity: 1, name: plan.name }],
    ...(email ? { customer_details: { email } } : {}),
  };
}

export function basicAuth(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}
