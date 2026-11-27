import { describe, expect, it, vi } from "vitest";

import { afterSignIn, birthDateError, saveProfile, signIn, type ProfileForm } from "@/lib/auth";
import { safeNextPath } from "@/lib/supabase/proxy";

function fakeFetch(reply: Response | Error) {
  const fn = vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { fetch: fn as unknown as typeof fetch, body: () => JSON.parse(String((fn.mock.calls as unknown as [string, RequestInit][])[0][1].body)) };
}
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

describe("signIn", () => {
  it("comes back through sign-up, which keeps the page the user wanted", async () => {
    const f = fakeFetch(reply(200, { sent: true }));
    expect(await signIn({ email: "a@b.co" }, "/practice?x=1", f.fetch)).toEqual({ ok: true, url: undefined });
    expect(f.body()).toEqual({ email: "a@b.co", next: "/sign-up?next=%2Fpractice%3Fx%3D1" });
    expect(safeNextPath(afterSignIn("/practice"))).toBe("/sign-up?next=%2Fpractice");
  });

  it("hands back the Google address", async () => {
    const f = fakeFetch(reply(200, { url: "https://accounts.example/x" }));
    expect(await signIn({ provider: "google" }, "/dashboard", f.fetch)).toEqual({ ok: true, url: "https://accounts.example/x" });
  });

  it.each([
    [400, "alamat email"],
    [429, "Terlalu banyak"],
    [502, "belum bisa dikirim"],
  ])("explains status %i in Indonesian", async (status, text) => {
    const result = await signIn({ email: "a@b.co" }, "/dashboard", fakeFetch(reply(status, { error: "English" })).fetch);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining(text) });
  });

  it("explains a dropped connection", async () => {
    expect(await signIn({ email: "a@b.co" }, "/", fakeFetch(new TypeError("offline")).fetch)).toMatchObject({ ok: false });
  });
});

describe("birthDateError", () => {
  const today = new Date("2026-11-24T10:00:00Z");
  it("accepts an 18th birthday today and refuses the day after", () => {
    expect(birthDateError("2008-11-24", today)).toBeNull();
    expect(birthDateError("2008-11-25", today)).toContain("18 tahun");
  });
  it.each(["", "2027-01-01", "2001-02-31"])("refuses %j", (value) => {
    expect(birthDateError(value, today)).toBe("Isi tanggal lahir yang benar.");
  });
});

describe("saveProfile", () => {
  const form: ProfileForm = {
    full_name: "A",
    date_of_birth: "2000-01-01",
    status: "student",
    job_field: "IT",
    preferred_language: "id",
    consents: { analysis: true, model_training: false, hr_rater_sharing: false },
  };
  it.each([201, 409])("is done on %i", async (status) => {
    expect(await saveProfile(form, fakeFetch(reply(status)).fetch)).toBeNull();
  });
  it.each([
    [403, { code: "under_age" }, "18 tahun"],
    [403, { code: "consent_required" }, "Izin analisis"],
    [401, {}, "Masuk lagi"],
    [400, { code: "invalid" }, "belum benar"],
    [500, {}, "belum bisa dibuat"],
  ])("explains %i %j", async (status, body, text) => {
    expect(await saveProfile(form, fakeFetch(reply(status, body)).fetch)).toContain(text);
  });
});
