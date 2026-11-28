import { expect, test } from "@playwright/test";

import { SIGNED_OUT_STATE } from "./auth-state";
import { PracticePage } from "./pages/practice.page";

const BASELINE = { yaw: 0, pitch: 0, irisX: 0, irisY: 0, smile: 0 };

test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT_STATE });

  test("the interview room sends a visitor to sign-in and keeps the session in next", async ({ page }) => {
    const id = "00000000-0000-4000-8000-000000000000";
    await page.goto(`/practice/room?session=${id}`);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(`/practice/room?session=${id}`)}$`));
  });
});

test("the room asks for calibration when this tab has none", async ({ page }) => {
  const id = await new PracticePage(page).createSession();
  await page.goto(`/practice/room?session=${id}`);
  await expect(page.getByRole("heading", { name: "Kalibrasi dulu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ke kalibrasi" })).toHaveAttribute("href", `/practice/check?session=${id}`);
});

test("a room link without a valid session goes back to setup", async ({ page }) => {
  await page.goto("/practice/room?session=not-a-session");
  await expect(page).toHaveURL(/\/practice$/);
});

test("an unfinished session has no report yet and links back to the room", async ({ page }) => {
  const id = await new PracticePage(page).createSession();
  await page.goto(`/report/${id}`);
  await expect(page.getByRole("heading", { name: "Sesi belum selesai" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lanjutkan sesi" })).toHaveAttribute("href", `/practice/room?session=${id}`);
});

test("skipping every question finishes the session, a reload resumes, and the report says nothing was analysed", async ({ page }) => {
  test.setTimeout(90_000);
  const practice = new PracticePage(page);
  const id = await practice.createSession();
  await page.addInitScript((baseline) => {
    sessionStorage.setItem("echocv.calibration.baseline", JSON.stringify(baseline));
  }, BASELINE);

  await page.goto(`/practice/room?session=${id}`);
  await expect(page.getByText("Pertanyaan 1 dari 3")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Saya mengerti, mulai" }).click();
  await page.getByRole("button", { name: "Lewati pertanyaan" }).click();
  await expect(page.getByText("Pertanyaan 2 dari 3")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Pertanyaan 2 dari 3")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Saya mengerti, mulai" })).toHaveCount(0);

  await page.getByRole("button", { name: "Lewati pertanyaan" }).click();
  await expect(page.getByText("Pertanyaan 3 dari 3")).toBeVisible();
  await page.getByRole("button", { name: "Lewati pertanyaan" }).click();

  await expect(page).toHaveURL(new RegExp(`/report/${id}$`), { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /^Laporan sesi, / })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Belum ada jawaban yang selesai dianalisis" })).toBeVisible({
    timeout: 30_000,
  });
});
