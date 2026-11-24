import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeHistory, type HistoryReport, type HistorySession } from "@/lib/scoring/history";

const session = (id: string, day: number, status = "finished"): HistorySession => ({
  id,
  created_at: `2026-11-${String(day).padStart(2, "0")}T08:00:00Z`,
  role: "Backend developer",
  level: "fresh_graduate",
  language: "id",
  mode: "live",
  status,
});

const report = (sessionId: string, overall: number | string | null, scores: Record<string, number>, contentStatus = "scored"): HistoryReport => ({
  session_id: sessionId,
  overall_score: overall,
  report: { dimensionScores: Object.entries(scores).map(([id, score]) => ({ id, score })), contentStatus },
});

describe("summarizeHistory", () => {
  const sessions = [session("s3", 22), session("s1", 20), session("s2", 21), session("s4", 23, "cancelled")];
  const reports = [
    report("s1", "60.00", { eye_contact: 50, fillers: 80, smile: 10, content: 60 }),
    report("s2", 70, { eye_contact: 70, fillers: 60, smile: 5, content: 75 }),
    report("s3", 75.5, { eye_contact: 90, fillers: 70, smile: 0 }, "pending"),
  ];
  const summary = summarizeHistory(sessions, reports);

  it("lists sessions newest first with their overall score, including ones without a report", () => {
    expect(summary.sessions.map((s) => [s.id, s.overall_score, s.content_status])).toEqual([
      ["s4", null, null],
      ["s3", 75.5, "pending"],
      ["s2", 70, "scored"],
      ["s1", 60, "scored"],
    ]);
  });

  it("gives score trends oldest first for the overall score and each dimension", () => {
    expect(summary.trends.overall.map((p) => p.score)).toEqual([60, 70, 75.5]);
    expect(summary.trends.dimensions.eye_contact.map((p) => p.session_id)).toEqual(["s1", "s2", "s3"]);
    expect(summary.trends.dimensions.content.map((p) => p.score)).toEqual([60, 75]);
    expect(summary.trends.dimensions.pace).toEqual([]);
  });

  it("averages each dimension over the sessions that have it", () => {
    expect(summary.averages).toEqual({ eye_contact: 70, fillers: 70, smile: 5, content: 67.5 });
  });

  it("names the weakest scored aspect and never picks smile (BR-09)", () => {
    expect(summary.weakest).toMatchObject({ id: "content", score: 67.5 });
    expect(summary.weakest?.label).toEqual({ en: expect.any(String), id: expect.any(String) });
  });

  it("reports the change from the first to the latest scored session", () => {
    expect(summary.change).toBe(15.5);
  });

  it("returns an empty state for a new user", () => {
    expect(summarizeHistory([], [])).toEqual({
      sessions: [],
      trends: { overall: [], dimensions: expect.objectContaining({ eye_contact: [] }) },
      averages: {},
      weakest: null,
      change: null,
    });
  });

  it("has no change with only one scored session", () => {
    expect(summarizeHistory([session("s1", 20)], [report("s1", 60, { eye_contact: 50 })]).change).toBeNull();
  });
});

type Row = Record<string, unknown>;
let user: { id: string } | null;
let rows: Record<string, Row[]>;
let calls: { table: string; filters: [string, unknown][]; limit?: number }[];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      const call: (typeof calls)[number] = { table, filters: [] };
      calls.push(call);
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => (call.filters.push([column, value]), query),
        in: (column: string, values: unknown[]) => (call.filters.push([column, values]), query),
        order: () => query,
        limit: (n: number) => ((call.limit = n), query),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null }),
      };
      return query;
    },
  }),
}));

const { GET } = await import("@/app/api/history/route");
const get = (query = "") => GET(new Request(`http://app.test/api/history${query}`));

describe("GET /api/history", () => {
  beforeEach(() => {
    user = { id: "user-1" };
    calls = [];
    rows = { practice_sessions: [session("s1", 20)], reports: [report("s1", 60, { eye_contact: 50 })] };
  });

  it("returns the signed-in user's own history, 20 sessions by default", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect((await response.json()).sessions[0]).toMatchObject({ id: "s1", overall_score: 60 });
    expect(calls[0]).toMatchObject({ table: "practice_sessions", filters: [["user_id", "user-1"]], limit: 20 });
    expect(calls[1]).toMatchObject({ table: "reports", filters: [["session_id", ["s1"]]] });
  });

  it("skips the reports query for a user with no sessions", async () => {
    rows = {};
    const body = await (await get()).json();
    expect(body.sessions).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it.each(["?limit=0", "?limit=101", "?limit=abc", "?limit=2.5"])("rejects %s", async (query) => {
    expect((await get(query)).status).toBe(400);
  });

  it("rejects a signed-out visitor", async () => {
    user = null;
    expect((await get()).status).toBe(401);
  });
});
