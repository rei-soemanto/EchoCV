import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ageOn, parseProfileRequest } from "@/lib/db/profile";

const today = new Date("2026-11-23T10:00:00Z");
const valid = {
  full_name: "Test User",
  date_of_birth: "2000-05-01",
  status: "fresh_graduate",
  job_field: "IT",
  preferred_language: "id",
  consents: { analysis: true },
};

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };
let calls: Call[];
let user: { id: string } | null;
let claims: object | null;
let insertError: Record<string, { code?: string; message: string }>;
let rows: Record<string, unknown>;
let auth: Record<string, ReturnType<typeof vi.fn>>;

function fakeQuery(table: string) {
  const call: Call = { table, op: "select", filters: [] };
  calls.push(call);
  const result = () =>
    call.op === "insert" && insertError[table]
      ? { data: null, error: insertError[table] }
      : { data: call.op === "select" ? (rows[table] ?? null) : null, error: null };
  const query = {
    insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), query),
    delete: () => ((call.op = "delete"), query),
    select: () => query,
    eq: (column: string, value: unknown) => (call.filters.push([column, value]), query),
    maybeSingle: async () => result(),
    then: (resolve: (value: unknown) => unknown) => resolve(result()),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth, from: fakeQuery }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: async () => ({ data: claims ? { claims } : null }) } }),
}));

const { POST: saveProfile, GET: readProfile } = await import("@/app/api/profile/route");
const { GET: callback } = await import("@/app/api/auth/callback/route");
const { POST: signIn } = await import("@/app/api/auth/sign-in/route");
const { isProtected, safeNextPath, updateSession } = await import("@/lib/supabase/proxy");

const jsonRequest = (url: string, body: unknown) =>
  new Request(url, { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  calls = [];
  user = { id: "user-1" };
  claims = { sub: "user-1" };
  insertError = {};
  rows = {};
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
  auth = {
    getUser: vi.fn(async () => ({ data: { user } })),
    exchangeCodeForSession: vi.fn(async (code: string) => ({ error: code === "good" ? null : { message: "bad" } })),
    signInWithOAuth: vi.fn(async () => ({ data: { url: "https://accounts.google.test/auth" }, error: null })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
  };
});

describe("ageOn", () => {
  it.each([
    ["2008-11-23", 18],
    ["2008-11-24", 17],
    ["2008-12-01", 17],
    ["2008-10-30", 18],
    ["2000-02-29", 26],
  ])("someone born %s is %i on 23 Nov 2026", (dateOfBirth, age) => {
    expect(ageOn(dateOfBirth, today)).toBe(age);
  });
});

describe("parseProfileRequest", () => {
  it("accepts a complete first sign-in and keeps optional consents off by default (BR-02)", () => {
    expect(parseProfileRequest(valid, today)).toEqual({
      ok: true,
      value: {
        profile: { full_name: "Test User", date_of_birth: "2000-05-01", status: "fresh_graduate", job_field: "IT", preferred_language: "id" },
        consents: { analysis: true, model_training: false, hr_rater_sharing: false },
      },
    });
  });

  it("keeps optional consents the user turned on", () => {
    const result = parseProfileRequest({ ...valid, consents: { analysis: true, model_training: true } }, today);
    expect(result).toMatchObject({ ok: true, value: { consents: { model_training: true, hr_rater_sharing: false } } });
  });

  it.each([{ analysis: false }, {}, { analysis: "yes" }, undefined])(
    "refuses the account without the analysis consent: %j",
    (consents) => {
      expect(parseProfileRequest({ ...valid, consents }, today)).toMatchObject({ ok: false, code: "consent_required" });
    },
  );

  it("refuses someone under 18 (BR-01) and accepts someone who turns 18 today", () => {
    expect(parseProfileRequest({ ...valid, date_of_birth: "2008-11-24" }, today)).toMatchObject({ ok: false, code: "under_age" });
    expect(parseProfileRequest({ ...valid, date_of_birth: "2008-11-23" }, today).ok).toBe(true);
  });

  it.each([
    ["an empty name", { full_name: "   " }],
    ["a name over 100 characters", { full_name: "a".repeat(101) }],
    ["an impossible date", { date_of_birth: "2000-02-30" }],
    ["a future date", { date_of_birth: "2030-01-01" }],
    ["a date in another format", { date_of_birth: "01/05/2000" }],
    ["an unknown status", { status: "retired" }],
    ["an unknown job field", { job_field: "Astronaut" }],
    ["an unknown language", { preferred_language: "fr" }],
    ["a consent that is not a boolean", { consents: { analysis: true, hr_rater_sharing: "true" } }],
  ])("rejects %s", (_name, change) => {
    expect(parseProfileRequest({ ...valid, ...change }, today)).toMatchObject({ ok: false, code: "invalid" });
  });

  it.each([null, "text", [valid]])("rejects a body that is not an object: %j", (body) => {
    expect(parseProfileRequest(body, today)).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/practice?mode=live", "/practice?mode=live"],
    [null, "/dashboard"],
    ["https://evil.test", "/dashboard"],
    ["//evil.test", "/dashboard"],
    ["/\\evil.test", "/dashboard"],
    ["dashboard", "/dashboard"],
  ])("turns %s into %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });
});

describe("isProtected", () => {
  it.each(["/dashboard", "/practice/room", "/report/abc", "/privacy"])("protects %s", (path) => {
    expect(isProtected(path)).toBe(true);
  });

  it.each(["/", "/api/sessions", "/practiceroom", "/models/yolo.onnx"])("leaves %s open", (path) => {
    expect(isProtected(path)).toBe(false);
  });
});

describe("updateSession", () => {
  it("sends a signed-out visitor from a protected page to sign in, remembering where they were", async () => {
    claims = null;
    const response = await updateSession(new NextRequest("http://app.test/practice/room?mode=live"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("next")).toBe("/practice/room?mode=live");
  });

  it("lets a signed-in user through", async () => {
    const response = await updateSession(new NextRequest("http://app.test/dashboard"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets a signed-out visitor see open pages", async () => {
    claims = null;
    const response = await updateSession(new NextRequest("http://app.test/"));
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("GET /api/auth/callback", () => {
  it("signs in with the code and goes to the next page", async () => {
    const response = await callback(new Request("http://app.test/api/auth/callback?code=good&next=/practice"));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("good");
    expect(response.headers.get("location")).toBe("http://app.test/practice");
  });

  it("never redirects to another site", async () => {
    const response = await callback(new Request("http://app.test/api/auth/callback?code=good&next=//evil.test"));
    expect(response.headers.get("location")).toBe("http://app.test/dashboard");
  });

  it.each(["code=bad", "error=access_denied"])("goes back to sign in with an error when %s (UC-01 E1)", async (query) => {
    const response = await callback(new Request(`http://app.test/api/auth/callback?${query}`));
    expect(response.headers.get("location")).toBe("http://app.test/?auth_error=1");
  });
});

describe("POST /api/auth/sign-in", () => {
  it("returns the Google URL with the callback and next page", async () => {
    const response = await signIn(jsonRequest("http://app.test/api/auth/sign-in", { provider: "google", next: "/practice" }));
    expect(await response.json()).toEqual({ url: "https://accounts.google.test/auth" });
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://app.test/api/auth/callback?next=%2Fpractice", skipBrowserRedirect: true },
    });
  });

  it("emails a sign-in link", async () => {
    const response = await signIn(jsonRequest("http://app.test/api/auth/sign-in", { email: " user@example.test " }));
    expect(response.status).toBe(200);
    expect(auth.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "user@example.test" }));
  });

  it.each([{ email: "not-an-email" }, {}, { provider: "github" }])("rejects %j", async (body) => {
    expect((await signIn(jsonRequest("http://app.test/api/auth/sign-in", body))).status).toBe(400);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("passes on rate limiting", async () => {
    auth.signInWithOtp.mockResolvedValueOnce({ error: { status: 429, message: "slow down" } });
    expect((await signIn(jsonRequest("http://app.test/api/auth/sign-in", { email: "user@example.test" }))).status).toBe(429);
  });
});

describe("POST /api/profile", () => {
  const post = (body: unknown) => saveProfile(jsonRequest("http://app.test/api/profile", body));

  it("saves the profile and consents for the signed-in user", async () => {
    const response = await post(valid);
    expect(response.status).toBe(201);
    expect(calls[0]).toMatchObject({ table: "profiles", op: "insert", payload: { id: "user-1", full_name: "Test User" } });
    expect(calls[1]).toMatchObject({
      table: "consents",
      op: "insert",
      payload: { user_id: "user-1", analysis: true, model_training: false, hr_rater_sharing: false },
    });
  });

  it("does not create the account without the analysis consent (UC-01 E2)", async () => {
    const response = await post({ ...valid, consents: { analysis: false } });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "consent_required" });
    expect(calls).toEqual([]);
  });

  it("does not create the account for someone under 18 (UC-01 E3)", async () => {
    const response = await post({ ...valid, date_of_birth: `${new Date().getUTCFullYear() - 17}-01-01` });
    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("rejects a signed-out visitor", async () => {
    user = null;
    expect((await post(valid)).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("answers 409 when the profile already exists", async () => {
    insertError.profiles = { code: "23505", message: "duplicate" };
    expect((await post(valid)).status).toBe(409);
  });

  it("removes the profile again when the consents cannot be saved", async () => {
    insertError.consents = { message: "failed" };
    expect((await post(valid)).status).toBe(500);
    expect(calls[2]).toMatchObject({ table: "profiles", op: "delete", filters: [["id", "user-1"]] });
  });
});

describe("GET /api/profile", () => {
  it("answers 404 on first sign-in so the app can ask for the profile", async () => {
    expect((await readProfile()).status).toBe(404);
  });

  it("returns the saved profile and consents", async () => {
    rows = { profiles: { full_name: "Test User" }, consents: { analysis: true } };
    const response = await readProfile();
    expect(await response.json()).toEqual({ profile: { full_name: "Test User" }, consents: { analysis: true } });
  });

  it("rejects a signed-out visitor", async () => {
    user = null;
    expect((await readProfile()).status).toBe(401);
  });
});
