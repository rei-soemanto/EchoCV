import { describe, expect, it } from "vitest";

import { sessionRow } from "@/components/session-table";
import { changeConsent, deleteAccount } from "@/lib/privacy";

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const answer = (r: Response | Error) =>
  (async () => {
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;

describe("changeConsent", () => {
  it("returns the saved consents and how many recordings were removed", async () => {
    const body = { consents: { analysis: true, model_training: false, hr_rater_sharing: true }, removed_recordings: 2 };
    expect(await changeConsent({ model_training: false }, answer(reply(200, body)))).toEqual({
      ok: true,
      consents: { model_training: false, hr_rater_sharing: true },
      removed: 2,
    });
  });

  it.each([
    [reply(401, { error: "Sign in first." }), "Masuk lagi"],
    [reply(500, { error: "x" }), "belum tersimpan"],
    [new TypeError("offline"), "koneksi internet"],
  ])("explains a failure in Indonesian", async (r, text) => {
    expect(await changeConsent({ hr_rater_sharing: true }, answer(r))).toMatchObject({
      ok: false,
      message: expect.stringContaining(text),
    });
  });
});

describe("deleteAccount", () => {
  it("is done on 204 and says nothing was lost otherwise", async () => {
    expect(await deleteAccount(answer(reply(204)))).toBeNull();
    expect(await deleteAccount(answer(reply(500, { error: "x" })))).toContain("tidak ada data yang hilang");
    expect(await deleteAccount(answer(new TypeError("offline")))).toContain("koneksi internet");
  });
});

describe("sessionRow", () => {
  const session = {
    id: "s1",
    created_at: "2026-11-27T00:00:00Z",
    role: "QA engineer",
    level: "junior",
    language: "id",
    mode: "live",
    status: "finished",
    overall_score: 72 as number | null,
    content_status: "scored",
  };
  it("opens the report of a scored session, and builds a missing one", () => {
    expect(sessionRow(session)).toMatchObject({ label: "Selesai", href: "/report/s1" });
    expect(sessionRow({ ...session, overall_score: null })).toMatchObject({ action: "Buat laporan", href: "/report/s1" });
  });
  it("continues an open session in its own mode", () => {
    expect(sessionRow({ ...session, status: "in_progress" }).href).toBe("/practice/check?session=s1");
    expect(sessionRow({ ...session, status: "in_progress", mode: "upload" }).href).toBe("/upload?session=s1");
  });
  it("offers a new session after a failed or cancelled one", () => {
    expect(sessionRow({ ...session, status: "failed" })).toMatchObject({ tone: "danger", href: "/practice" });
    expect(sessionRow({ ...session, status: "cancelled" }).label).toBe("Dibatalkan");
  });
});
