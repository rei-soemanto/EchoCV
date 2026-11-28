import { expect, test } from "@playwright/test";

import { UploadPage } from "./pages/upload.page";

test("upload page loads with instructions", async ({ page }) => {
  const upload = new UploadPage(page);

  await upload.goto();
  await upload.expectLoaded();
});

test("report page for an id that is not a session is not found", async ({ page }) => {
  const response = await page.goto("/report/test-session-123");
  expect(response?.status()).toBe(404);
});
