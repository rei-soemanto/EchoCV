import { expect, test } from "@playwright/test";

test("device check opens the fake camera and mic and enables the interview", async ({ page }) => {
  await page.goto("/practice/check");
  const checks = page.getByRole("listitem");
  await expect(checks.filter({ hasText: "Kamera" })).toContainText("Siap");
  await expect(checks.filter({ hasText: "Mikrofon" })).toContainText("Siap");
  await expect(checks.filter({ hasText: "Pencahayaan" })).not.toContainText("Belum diperiksa");
  await expect(page.getByLabel("Pratinjau kamera")).toBeVisible();

  // The fake mic beeps, so the meter must move at some point.
  await expect
    .poll(async () => Number(await page.getByRole("meter").getAttribute("aria-valuenow")), {
      timeout: 5000,
    })
    .toBeGreaterThan(0);

  await page.getByRole("link", { name: "Mulai wawancara" }).click();
  await expect(page).toHaveURL(/\/practice\/room$/);
});

