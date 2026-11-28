import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { amountMatches, parseNotification, paymentOutcome, type MidtransNotification } from "@/lib/db/payments";

const ALICE = "11111111-1111-4111-8111-111111111111";
const SERVER_KEY = "SB-Mid-server-test";

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let user: { id: string; email: string } | null;
let adminConfigured: boolean;
let rpcCalls: { name: string; args: Row }[];
let snapCalls: { url: string; init: RequestInit }[];
let snapReply: () => Promise<Response>;

function table(name: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" = "select";
  let payload: Row = {};
  const run = () => {
    if (op === "insert") {
      db[name].push({ status: "pending", ...payload });
      return [payload];
    }
    const matched = (db[name] ?? []).filter((row) => filters.every((f) => f(row)));
    if (op === "update") matched.forEach((row) => Object.assign(row, payload));
    return matched;
  };
  const query = {
    select: () => query,
    insert: (value: Row) => ((op = "insert"), (payload = value), query),
    update: (value: Row) => ((op = "update"), (payload = value), query),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), query),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: run(), error: null }),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) }, from: table }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (!adminConfigured) throw new Error("Missing environment variable SUPABASE_SECRET_KEY");
    return {
      from: table,
      rpc: async (name: string, args: Row) => {
        rpcCalls.push({ name, args });
        const order = db.payment_orders.find((row) => row.id === args.p_order_id);
        if (order?.status !== "pending") return { data: false, error: null };
        order.status = "paid";
        return { data: true, error: null };
      },
    };
  },
}));

const { POST: checkout } = await import("@/app/api/checkout/route");
const { POST: notify } = await import("@/app/api/payments/midtrans/route");
const { GET: currentPlan } = await import("@/app/api/plan/route");

const sign = (orderId: string, statusCode: string, gross: string, key = SERVER_KEY) =>
  createHash("sha512").update(orderId + statusCode + gross + key).digest("hex");

const notification = (overrides: Partial<MidtransNotification> = {}): MidtransNotification => {
  const base = { order_id: "o1", status_code: "200", gross_amount: "15000.00", transaction_status: "settlement", transaction_id: "t1" };
  const merged = { ...base, ...overrides };
  return { signature_key: sign(merged.order_id, merged.status_code, merged.gross_amount), ...merged };
};

const post = (body: unknown) =>
  notify(new Request("http://app.test/api/payments/midtrans", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  user = { id: ALICE, email: "alice@example.test" };
  adminConfigured = true;
  rpcCalls = [];
  snapCalls = [];
  snapReply = async () => Response.json({ token: "snap-token", redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/x" }, { status: 201 });
  vi.stubEnv("MIDTRANS_SERVER_KEY", SERVER_KEY);
  vi.stubEnv("MIDTRANS_IS_PRODUCTION", "");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    snapCalls.push({ url, init });
    return snapReply();
  });
  db = {
    plans: [
      { id: "sprint", name: "Sprint Pass", price_idr: 15000, duration_days: 7, active: true },
      { id: "premium", name: "Premium", price_idr: 29000, duration_days: 30, active: true },
    ],
    payment_orders: [{ id: "o1", user_id: ALICE, plan_id: "sprint", amount_idr: 15000, status: "pending" }],
    subscriptions: [],
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("payment rules", () => {
  it("counts settlement and accepted captures as paid", () => {
    expect(paymentOutcome(notification())).toBe("paid");
    expect(paymentOutcome(notification({ transaction_status: "capture", fraud_status: "accept" }))).toBe("paid");
    expect(paymentOutcome(notification({ transaction_status: "capture", fraud_status: "challenge" }))).toBe("pending");
    expect(paymentOutcome(notification({ transaction_status: "expire" }))).toBe("expired");
    expect(paymentOutcome(notification({ transaction_status: "deny" }))).toBe("failed");
    expect(paymentOutcome(notification({ transaction_status: "pending" }))).toBe("pending");
  });

  it("compares Midtrans' decimal amount with the stored whole rupiah", () => {
    expect(amountMatches("15000.00", 15000)).toBe(true);
    expect(amountMatches("1500.00", 15000)).toBe(false);
    expect(amountMatches("abc", 15000)).toBe(false);
  });

  it.each([null, [], {}, { order_id: "o1" }, { ...notification(), transaction_id: 5 }])("rejects the notification %j", (body) => {
    expect(parseNotification(body)).toBeNull();
  });
});

describe("POST /api/checkout", () => {
  const buy = (body: unknown) =>
    checkout(new Request("http://app.test/api/checkout", { method: "POST", body: JSON.stringify(body) }));

  it("creates a pending order at the stored price and returns the Snap token", async () => {
    const response = await buy({ plan_id: "sprint" });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token).toBe("snap-token");
    expect(body.order_id).toMatch(/^echocv-sprint-/);
    expect(db.payment_orders.at(-1)).toMatchObject({ id: body.order_id, user_id: ALICE, amount_idr: 15000, status: "pending" });
    expect(snapCalls[0].url).toBe("https://app.sandbox.midtrans.com/snap/v1/transactions");
    const sent = JSON.parse(String(snapCalls[0].init.body));
    expect(sent.transaction_details).toEqual({ order_id: body.order_id, gross_amount: 15000 });
    expect(new Headers(snapCalls[0].init.headers).get("authorization")).toBe(`Basic ${Buffer.from(`${SERVER_KEY}:`).toString("base64")}`);
  });

  it("never trusts a price sent by the browser", async () => {
    await buy({ plan_id: "sprint", price_idr: 1 });
    expect(JSON.parse(String(snapCalls[0].init.body)).transaction_details.gross_amount).toBe(15000);
  });

  it("marks the order failed when Midtrans refuses it", async () => {
    snapReply = async () => Response.json({ error_messages: ["bad"] }, { status: 401 });
    expect((await buy({ plan_id: "sprint" })).status).toBe(502);
    expect(db.payment_orders.at(-1)?.status).toBe("failed");
  });

  it.each([{}, { plan_id: 3 }, { plan_id: "../x" }, null])("rejects %j", async (body) => {
    expect((await buy(body)).status).toBe(400);
  });

  it("answers 404 for an unknown plan", async () => {
    expect((await buy({ plan_id: "free" })).status).toBe(404);
  });

  it("refuses when payments are not configured", async () => {
    vi.stubEnv("MIDTRANS_SERVER_KEY", "");
    expect((await buy({ plan_id: "sprint" })).status).toBe(503);
    adminConfigured = false;
    vi.stubEnv("MIDTRANS_SERVER_KEY", SERVER_KEY);
    expect((await buy({ plan_id: "sprint" })).status).toBe(503);
    expect(snapCalls).toEqual([]);
  });

  it("rejects a signed-out visitor", async () => {
    user = null;
    expect((await buy({ plan_id: "sprint" })).status).toBe(401);
  });
});

describe("POST /api/payments/midtrans", () => {
  it("activates the plan for a correctly signed settlement", async () => {
    expect((await post(notification())).status).toBe(200);
    expect(rpcCalls).toEqual([{ name: "complete_payment", args: { p_order_id: "o1", p_transaction_id: "t1" } }]);
    expect(db.payment_orders[0].status).toBe("paid");
  });

  it("is safe to receive the same notification twice", async () => {
    await post(notification());
    expect((await post(notification())).status).toBe(200);
    expect(db.payment_orders[0].status).toBe("paid");
  });

  it("refuses a forged signature and changes nothing", async () => {
    const forged = { ...notification(), signature_key: sign("o1", "200", "15000.00", "wrong-key") };
    expect((await post(forged)).status).toBe(401);
    expect(rpcCalls).toEqual([]);
  });

  it("refuses a signed notification whose amount differs from the order", async () => {
    expect((await post(notification({ gross_amount: "1500.00" }))).status).toBe(400);
    expect(rpcCalls).toEqual([]);
  });

  it("closes the order when the payment expires", async () => {
    await post(notification({ transaction_status: "expire", status_code: "407" }));
    expect(db.payment_orders[0].status).toBe("expired");
    expect(rpcCalls).toEqual([]);
  });

  it("leaves a paid order paid when a late failure arrives", async () => {
    db.payment_orders[0].status = "paid";
    await post(notification({ transaction_status: "cancel" }));
    expect(db.payment_orders[0].status).toBe("paid");
  });

  it("answers 404 for an unknown order and 400 for junk", async () => {
    expect((await post(notification({ order_id: "nope" }))).status).toBe(404);
    expect((await post({ hello: "world" })).status).toBe(400);
    const junk = await notify(new Request("http://app.test/api/payments/midtrans", { method: "POST", body: "{" }));
    expect(junk.status).toBe(400);
  });

  it("refuses oversized bodies", async () => {
    const big = await notify(new Request("http://app.test/api/payments/midtrans", { method: "POST", body: "x".repeat(20_000) }));
    expect(big.status).toBe(413);
  });
});

describe("GET /api/plan", () => {
  it("is free without a subscription", async () => {
    expect(await (await currentPlan()).json()).toEqual({ plan_id: "free", starts_at: null, ends_at: null });
  });

  it("returns the active plan and its end date", async () => {
    const endsAt = new Date(Date.now() + 86_400_000).toISOString();
    db.subscriptions.push({ user_id: ALICE, plan_id: "premium", starts_at: new Date().toISOString(), ends_at: endsAt });
    expect(await (await currentPlan()).json()).toMatchObject({ plan_id: "premium", ends_at: endsAt });
  });

  it("falls back to free once the plan has ended", async () => {
    db.subscriptions.push({ user_id: ALICE, plan_id: "sprint", starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-01-08T00:00:00Z" });
    expect((await (await currentPlan()).json()).plan_id).toBe("free");
  });

  it("rejects a signed-out visitor", async () => {
    user = null;
    expect((await currentPlan()).status).toBe(401);
  });
});
