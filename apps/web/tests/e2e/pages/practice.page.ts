import { type Locator, type Page, expect } from "@playwright/test";

export class PracticePage {
  readonly page: Page;
  readonly setupHeading: Locator;
  readonly calibrationLink: Locator;
  readonly cameraPreview: Locator;
  readonly continueToRoomLink: Locator;
  readonly roomHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.setupHeading = page.getByRole("heading", { name: "Atur sesi latihan" });
    this.calibrationLink = page.getByRole("link", { name: "Lanjut ke kalibrasi" });
    this.cameraPreview = page.getByLabel("Pratinjau kamera");
    this.continueToRoomLink = page.getByRole("link", { name: "Mulai wawancara" });
    this.roomHeading = page.getByRole("heading", { name: "Ruang wawancara" });
  }

  async gotoSetup() {
    await this.page.goto("/practice");
  }

  async gotoCalibration() {
    await this.page.goto("/practice/check");
  }

  async gotoRoom() {
    await this.page.goto("/practice/room");
  }

  async expectSetupLoaded() {
    await expect(this.setupHeading).toBeVisible();
  }

  async expectCalibrationReady() {
    await expect(this.cameraPreview).toBeVisible();
    await expect(this.continueToRoomLink).toBeVisible();
  }

  async expectRoomLoaded() {
    await expect(this.roomHeading).toBeVisible();
  }
}
