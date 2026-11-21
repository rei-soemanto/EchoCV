import { expect, test } from "@playwright/test";

test("landing page links to practice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Latihan wawancara kerja");
  await page.getByRole("link", { name: "Mulai latihan gratis" }).click();
  await expect(page).toHaveURL(/\/practice$/);
});

test("sidebar reaches every app page and marks the current one", async ({ page }) => {
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Navigasi utama" });
  for (const [label, path] of [
    ["Latihan baru", "/practice"],
    ["Riwayat sesi", "/history"],
    ["Kemajuan", "/progress"],
    ["Paket", "/plans"],
    ["Privasi dan data", "/privacy"],
    ["Beranda", "/dashboard"],
  ]) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("API stubs return 501", async ({ request }) => {
  const res = await request.post("/api/sessions");
  expect(res.status()).toBe(501);
});
