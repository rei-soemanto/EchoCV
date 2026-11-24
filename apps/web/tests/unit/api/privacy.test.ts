import { beforeEach, describe, expect, it, vi } from "vitest";
import { expiredUploads, isKeptAudio, keepsMedia, type StoredUpload } from "@/lib/db/retention";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-25T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let user: { id: string; email: string; created_at: string } | null;
let removed: { bucket: string; paths: string[] }[];
let failRemove: boolean;
let adminConfigured: boolean;
let signedOut: boolean;

function table(name: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "update" = "select";
  let payload: Row = {};
  let max = Infinity;
  const run = () => {
    const matched = (db[name] ?? []).filter((row) => filters.every((f) => f(row))).slice(0, max);
    if (op === "update") matched.forEach((row) => Object.assign(row, payload));
    return matched;
  };
  const query = {
    select: () => query,
    update: (value: Row) => ((op = "update"), (payload = value), query),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), query),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), query),
    is: (c: string, v: unknown) => (filters.push((r) => r[c] === v), query),
    lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), query),
    limit: (n: number) => ((max = n), query),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: run(), error: null }),
  };
  return query;
}

const storage = {
  from: (bucket: string) => ({
    remove: async (paths: string[]) => {
      if (failRemove) return { data: null, error: { message: "storage down" } };
      removed.push({ bucket, paths });
      return { data: [], error: null };
    },
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user } }),
      signOut: async () => ((signedOut = true), { error: null }),
    },
    from: table,
    storage,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (!adminConfigured) throw new Error("Missing environment variable SUPABASE_SECRET_KEY");
    return {
      from: table,
      storage,
      auth: {
        admin: {
          deleteUser: async (id: string) => {
            for (const name of Object.keys(db)) {
              db[name] = db[name].filter((row) => row.user_id !== id && row.id !== id);
            }
            return { data: {}, error: null };
          },
        },
      },
    };
  },
}));

const { GET: exportData } = await import("@/app/api/account/export/route");
const { DELETE: deleteAccount } = await import("@/app/api/account/route");
const { PATCH: changeConsent } = await import("@/app/api/consents/route");
const retention = await import("@/app/api/retention/route");

const upload = (id: string, userId: string, overrides: Partial<StoredUpload> = {}): StoredUpload => ({
  id,
  user_id: userId,
  kind: "audio",
  bucket: "answer-audio",
  storage_path: `${userId}/s/a/${id}.webm`,
  status: "processed",
  created_at: hoursAgo(48),
  deleted_at: null,
  ...overrides,
});

beforeEach(() => {
  vi.useRealTimers();
  user = { id: ALICE, email: "alice@example.test", created_at: "2026-11-20T00:00:00Z" };
  removed = [];
  failRemove = false;
  adminConfigured = true;
  signedOut = false;
  vi.stubEnv("CRON_SECRET", "cron-secret");
  db = {
    profiles: [{ id: ALICE, full_name: "Alice" }, { id: BOB, full_name: "Bob" }],
    consents: [
      { user_id: ALICE, analysis: true, model_training: true, hr_rater_sharing: false },
      { user_id: BOB, analysis: true, model_training: false, hr_rater_sharing: false },
    ],
    practice_sessions: [{ id: "s1", user_id: ALICE }, { id: "s2", user_id: BOB }],
    session_questions: [{ id: "q1", user_id: ALICE }],
    answers: [{ id: "a1", user_id: ALICE, transcript: "I built an API" }],
    uploads: [upload("u1", ALICE), upload("u2", BOB)],
    reports: [{ id: "r1", user_id: ALICE, overall_score: 70 }],
    retention_settings: [{ key: "leftover_media_hours", value: "24" }],
  };
});

describe("retention rules", () => {
  it("keeps media only with a training or HR rater consent (BR-05)", () => {
    expect(keepsMedia({ model_training: false, hr_rater_sharing: false })).toBe(false);
    expect(keepsMedia({ model_training: true, hr_rater_sharing: false })).toBe(true);
    expect(keepsMedia(null)).toBe(false);
  });

  it("keeps only analysed audio, never video, even with consent", () => {
    const consent = { model_training: true, hr_rater_sharing: true };
    expect(isKeptAudio(upload("x", ALICE), consent)).toBe(true);
    expect(isKeptAudio(upload("x", ALICE, { kind: "video", bucket: "answer-videos" }), consent)).toBe(false);
    expect(isKeptAudio(upload("x", ALICE, { status: "pending" }), consent)).toBe(false);
  });

  it("expires leftover files older than the limit and spares kept or recent ones", () => {
    const consents = new Map([[ALICE, { model_training: true, hr_rater_sharing: false }]]);
    const uploads = [
      upload("kept", ALICE),
      upload("abandoned", ALICE, { status: "pending" }),
      upload("no-consent", BOB),
      upload("recent", BOB, { created_at: hoursAgo(2) }),
      upload("gone", BOB, { deleted_at: hoursAgo(1) }),
      upload("video", ALICE, { kind: "video", bucket: "answer-videos", status: "failed" }),
    ];
    expect(expiredUploads(uploads, consents, NOW, 24).map((u) => u.id)).toEqual(["abandoned", "no-consent", "video"]);
  });
});

describe("GET /api/account/export", () => {
  it("downloads only the signed-in user's data as a JSON file", async () => {
    const response = await exportData();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="echocv-data-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.profile).toEqual({ id: ALICE, full_name: "Alice" });
    expect(body.practice_sessions).toEqual([{ id: "s1", user_id: ALICE }]);
    expect(body.answers[0].transcript).toBe("I built an API");
    expect(JSON.stringify(body)).not.toContain(BOB);
  });

  it("rejects a signed-out visitor", async () => {
    user = null;
    expect((await exportData()).status).toBe(401);
  });
});

describe("DELETE /api/account (UC-10 A2)", () => {
  const remove = (body: unknown) =>
    deleteAccount(new Request("http://app.test/api/account", { method: "DELETE", body: JSON.stringify(body) }));

  it("deletes stored recordings, every row of the account, and signs out", async () => {
    expect((await remove({ confirm: "DELETE" })).status).toBe(204);
    expect(removed).toEqual([{ bucket: "answer-audio", paths: [`${ALICE}/s/a/u1.webm`] }]);
    for (const name of Object.keys(db)) {
      expect(JSON.stringify(db[name])).not.toContain(ALICE);
    }
    expect(db.practice_sessions).toEqual([{ id: "s2", user_id: BOB }]);
    expect(signedOut).toBe(true);
  });

  it("needs an explicit confirmation", async () => {
    expect((await remove({})).status).toBe(400);
    expect((await remove({ confirm: "yes" })).status).toBe(400);
    expect(db.profiles).toHaveLength(2);
  });

  it("keeps the account when the recordings cannot be deleted", async () => {
    failRemove = true;
    expect((await remove({ confirm: "DELETE" })).status).toBe(500);
    expect(db.profiles).toHaveLength(2);
  });

  it("deletes nothing when the server has no secret key", async () => {
    adminConfigured = false;
    expect((await remove({ confirm: "DELETE" })).status).toBe(500);
    expect(removed).toEqual([]);
    expect(db.profiles).toHaveLength(2);
  });

  it("rejects a signed-out visitor", async () => {
    user = null;
    expect((await remove({ confirm: "DELETE" })).status).toBe(401);
  });
});

describe("PATCH /api/consents (UC-10 A1, BR-11)", () => {
  const change = (body: unknown) =>
    changeConsent(new Request("http://app.test/api/consents", { method: "PATCH", body: JSON.stringify(body) }));

  it("withdrawing the last keeping consent deletes the audio kept so far", async () => {
    const response = await change({ model_training: false });
    expect(await response.json()).toEqual({
      consents: { user_id: ALICE, analysis: true, model_training: false, hr_rater_sharing: false },
      removed_recordings: 1,
    });
    expect(removed).toEqual([{ bucket: "answer-audio", paths: [`${ALICE}/s/a/u1.webm`] }]);
    expect(db.uploads[0]).toMatchObject({ status: "deleted" });
    expect(db.uploads[1]).toMatchObject({ status: "processed" });
  });

  it("keeps the audio while another keeping consent is still on", async () => {
    const response = await change({ model_training: false, hr_rater_sharing: true });
    expect((await response.json()).removed_recordings).toBe(0);
    expect(removed).toEqual([]);
  });

  it("refuses to withdraw the required analysis consent", async () => {
    expect((await change({ analysis: false })).status).toBe(400);
    expect(db.consents[0].analysis).toBe(true);
  });

  it.each([{}, { model_training: "no" }, null])("rejects %j", async (body) => {
    expect((await change(body)).status).toBe(400);
  });

  it("rejects a signed-out visitor", async () => {
    user = null;
    expect((await change({ model_training: false })).status).toBe(401);
  });
});

describe("/api/retention", () => {
  const call = (authorization?: string) =>
    retention.POST(new Request("http://app.test/api/retention", { method: "POST", headers: authorization ? { authorization } : {} }));

  it("deletes expired leftover files across users and keeps consented audio", async () => {
    db.uploads.push(upload("u3", ALICE, { status: "pending" }), upload("u4", BOB, { created_at: new Date().toISOString() }));
    const response = await call("Bearer cron-secret");
    expect(await response.json()).toEqual({ deleted: 2, checked: 3, more: false });
    expect(removed.flatMap((r) => r.paths).sort()).toEqual([`${ALICE}/s/a/u3.webm`, `${BOB}/s/a/u2.webm`]);
    expect(db.uploads.find((u) => u.id === "u1")).toMatchObject({ deleted_at: null });
    expect(db.uploads.find((u) => u.id === "u2")).toMatchObject({ status: "deleted" });
  });

  it.each([undefined, "Bearer wrong", "cron-secret"])("refuses the caller with authorization %s", async (header) => {
    expect((await call(header)).status).toBe(401);
    expect(removed).toEqual([]);
  });

  it("refuses everyone when no CRON_SECRET is set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("answers the scheduler's GET the same way", async () => {
    const response = await retention.GET(new Request("http://app.test/api/retention", { headers: { authorization: "Bearer cron-secret" } }));
    expect(response.status).toBe(200);
  });
});
