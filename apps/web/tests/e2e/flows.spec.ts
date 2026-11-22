import { expect, test } from "@playwright/test";

import { ReportPage } from "./pages/report.page";
import { UploadPage } from "./pages/upload.page";

test("upload page loads with instructions", async ({ page }) => {
  const upload = new UploadPage(page);

  await upload.goto();
  await upload.expectLoaded();
});

test("report page displays session placeholder for given id", async ({ page }) => {
  const report = new ReportPage(page);

  await report.goto("test-session-123");
  await report.expectLoaded();
  await expect(page.getByText("test-session-123")).toBeVisible();
});
