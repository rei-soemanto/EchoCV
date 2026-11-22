import bank from "../../../../../shared/questions/bank.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSessionRequest, parseSessionUpdate, pickQuestions } from "@/lib/db/sessions";

const valid = {
  job_field: "IT",
  role: "Backend developer",
  level: "fresh_graduate",
  language: "id",
  question_set: "behavioral",
  mode: "live",
};

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

let calls: Call[];
let user: { id: string } | null;
let failTable: string | null;
let updateReturns: unknown;

function fakeQuery(table: string) {
  const call: Call = { table, op: "", filters: [] };
  calls.push(call);
  const result = () =>
    failTable === table
      ? { data: null, error: { message: "failed" } }
      : call.op === "insert"
        ? { data: { id: "session-1", ...(call.payload as object), status: "in_progress" }, error: null }
        : { data: updateReturns, error: null };
  const query = {
    insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), query),
    update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), query),
    delete: () => ((call.op = "delete"), query),
    select: () => query,
    eq: (column: string, value: unknown) => (call.filters.push([column, value]), query),
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (resolve: (value: unknown) => unknown) => resolve(result()),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: fakeQuery,
  }),
}));

const { POST } = await import("@/app/api/sessions/route");
const { PATCH } = await import("@/app/api/sessions/[id]/route");

const post = (body: unknown) =>
  POST(new Request("http://test/api/sessions", { method: "POST", body: JSON.stringify(body) }));
const sessionId = "33333333-3333-4333-8333-333333333333";
const patch = (id: string, body: unknown) =>
  PATCH(new Request(`http://test/api/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  calls = [];
  user = { id: "user-1" };
  failTable = null;
  updateReturns = { id: sessionId, status: "finished", ended_at: "now" };
});

describe("parseSessionRequest", () => {
  it("accepts a complete request", () => {
    expect(parseSessionRequest(valid)).toEqual({ ok: true, value: { ...valid, quick_start: false } });
  });

  it.each(["job_field", "role", "level", "language", "question_set", "mode"])("rejects a missing %s", (field) => {
    const result = parseSessionRequest({ ...valid, [field]: undefined });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining(field) });
  });

  it.each([
    ["level", "senior"],
    ["language", "fr"],
    ["mode", "video"],
    ["question_set", "behavioural"],
    ["role", "Chef"],
  ])("rejects %s = %s", (field, value) => {
    expect(parseSessionRequest({ ...valid, [field]: value }).ok).toBe(false);
  });

  it.each([null, "text", [valid], 42])("rejects a body that is not an object: %j", (body) => {
    expect(parseSessionRequest(body).ok).toBe(false);
  });

  it("does not need a question set for quick start and uses the quick start question's set", () => {
    const quickQuestion = bank.questions.find((question) => question.tags.includes("quick_start"))!;
    const result = parseSessionRequest({ ...valid, question_set: undefined, quick_start: true });
    expect(result).toMatchObject({ ok: true, value: { question_set: quickQuestion.question_set, quick_start: true } });
  });
});

describe("pickQuestions", () => {
  it("gives 3 questions for every role, level and question set (BR-03)", () => {
    for (const role of bank.enums.roles)
      for (const level of bank.enums.levels)
        for (const question_set of bank.enums.question_sets) {
          const picked = pickQuestions({ ...valid, role, level, question_set, language: "en", mode: "live", quick_start: false });
          expect(picked, `${role} ${level} ${question_set}`).toHaveLength(3);
        }
  });

  it("only picks questions that match the request, in the session language", () => {
    const picked = pickQuestions({ ...valid, language: "id", mode: "live", quick_start: false });
    expect(new Set(picked.map((question) => question.question_id)).size).toBe(3);
    for (const { question_id, question_text } of picked) {
      const question = bank.questions.find((candidate) => candidate.id === question_id)!;
      expect(question.question_set).toBe("behavioral");
      expect(question.levels).toContain("fresh_graduate");
      expect(question.roles.some((role) => role === "all" || role === "Backend developer")).toBe(true);
      expect(question_text).toBe(question.text.id);
    }
  });

  it("keeps role-specific questions to the requested role", () => {
    const picked = pickQuestions({ ...valid, role: "QA engineer", question_set: "role_specific", language: "en", mode: "live", quick_start: false });
    for (const { question_id } of picked) {
      const question = bank.questions.find((candidate) => candidate.id === question_id)!;
      expect(question.roles.includes("QA engineer") || question.roles.includes("all")).toBe(true);
    }
  });

  it("picks only the quick start question for quick start", () => {
    const picked = pickQuestions({ ...valid, language: "en", mode: "live", quick_start: true });
    expect(picked).toEqual([{ question_id: "q01", question_text: bank.questions.find((q) => q.id === "q01")!.text.en }]);
  });
});

describe("parseSessionUpdate", () => {
  it.each(["finished", "cancelled"])("accepts %s", (status) => {
    expect(parseSessionUpdate({ status })).toEqual({ ok: true, value: status });
  });

  it.each([{ status: "failed" }, { status: "in_progress" }, {}, null])("rejects %j", (body) => {
    expect(parseSessionUpdate(body).ok).toBe(false);
  });
});

describe("POST /api/sessions", () => {
  it("creates the session and its 3 questions for the signed-in user", async () => {
    const response = await post(valid);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ id: "session-1", mode: "live", language: "id", status: "in_progress" });
    expect(body.questions.map((question: { position: number }) => question.position)).toEqual([0, 1, 2]);
    expect(calls[0]).toMatchObject({ table: "practice_sessions", op: "insert", payload: { ...valid, user_id: "user-1" } });
    expect(calls[1]).toMatchObject({ table: "session_questions", op: "insert" });
    expect(calls[1].payload).toHaveLength(3);
    expect(calls[1].payload).toEqual(
      expect.arrayContaining([expect.objectContaining({ session_id: "session-1", user_id: "user-1" })]),
    );
  });

  it("rejects a signed-out visitor without writing anything", async () => {
    user = null;
    expect((await post(valid)).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("rejects an invalid request before touching the database", async () => {
    expect((await post({ ...valid, mode: "video" })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await POST(new Request("http://test/api/sessions", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
  });

  it("removes the session again when its questions cannot be saved", async () => {
    failTable = "session_questions";
    expect((await post(valid)).status).toBe(500);
    expect(calls[2]).toMatchObject({ table: "practice_sessions", op: "delete", filters: [["id", "session-1"]] });
  });
});

describe("PATCH /api/sessions/[id]", () => {
  it("finishes a session in progress", async () => {
    const response = await patch(sessionId, { status: "finished" });
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({
      table: "practice_sessions",
      op: "update",
      payload: { status: "finished" },
      filters: [["id", sessionId], ["status", "in_progress"]],
    });
  });

  it("never changes the mode or language (BR-25, BR-26)", async () => {
    await patch(sessionId, { status: "cancelled", mode: "upload", language: "en" });
    expect(Object.keys(calls[0].payload as object).sort()).toEqual(["ended_at", "status"]);
  });

  it("answers 409 when the session is not in progress or not the user's", async () => {
    updateReturns = null;
    expect((await patch(sessionId, { status: "cancelled" })).status).toBe(409);
  });

  it("answers 404 for an id that is not a uuid", async () => {
    expect((await patch("abc", { status: "finished" })).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("rejects a signed-out visitor", async () => {
    user = null;
    expect((await patch(sessionId, { status: "finished" })).status).toBe(401);
  });
});
