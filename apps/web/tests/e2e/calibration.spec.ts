import { expect, test } from "@playwright/test";

import { PracticePage } from "./pages/practice.page";

test("device calibration detects fake media devices and keeps the room locked", async ({ page }) => {
  const practice = new PracticePage(page);

  await practice.gotoSetup();
  await practice.expectSetupLoaded();

  await practice.calibrationLink.click();
  await expect(page).toHaveURL(/\/practice\/check$/);

  await practice.expectCalibrationReady();
});

// Chrome's fake camera shows a test pattern, not a face, so calibration must fail cleanly (UC-03).
// The success path needs a real face: checked by hand with a webcam.
test("calibration with no face reports it and keeps the room locked", async ({ page, request }) => {
  const model = await request.get("/models/face_landmarker.task");
  test.skip(!model.ok(), "face model not in public/models (git-ignored, see apps/web/README.md)");

  const practice = new PracticePage(page);
  await practice.gotoCalibration();
  await practice.expectCalibrationReady();

  await practice.startCalibrationButton.click();
  await expect(page.getByRole("progressbar", { name: "Kemajuan kalibrasi" })).toBeVisible();
  await expect(practice.faceNotFoundAlert).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Ulangi kalibrasi" })).toBeEnabled();
  await expect(practice.lockedStartButton).toBeDisabled();
});
