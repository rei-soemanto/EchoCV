import { expect, test } from "@playwright/test";

import { PracticePage } from "./pages/practice.page";

test("device calibration detects fake media devices and navigates to room", async ({ page }) => {
  const practice = new PracticePage(page);

  await practice.gotoSetup();
  await practice.expectSetupLoaded();

  await practice.calibrationLink.click();
  await expect(page).toHaveURL(/\/practice\/check$/);

  await practice.expectCalibrationReady();

  await practice.continueToRoomLink.click();
  await expect(page).toHaveURL(/\/practice\/room$/);
  await practice.expectRoomLoaded();
});
