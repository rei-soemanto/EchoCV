import { expect, test } from "@playwright/test";

test("home page links to practice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "EchoCV" })).toBeVisible();
  await page.getByRole("link", { name: "Start practice" }).click();
  await expect(page).toHaveURL(/\/practice$/);
});

test("API stubs return 501", async ({ request }) => {
  const res = await request.post("/api/sessions");
  expect(res.status()).toBe(501);
});
