import { type Locator, type Page, expect } from "@playwright/test";

export class PracticePage {
  readonly page: Page;
  readonly setupHeading: Locator;
  readonly calibrationLink: Locator;
  readonly cameraPreview: Locator;
  readonly continueToRoomLink: Locator;
  readonly lockedStartButton: Locator;
  readonly startCalibrationButton: Locator;
  readonly faceNotFoundAlert: Locator;
  readonly roomHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.setupHeading = page.getByRole("heading", { name: "Atur sesi latihan" });
    this.calibrationLink = page.getByRole("button", { name: "Lanjut ke kalibrasi" });
    this.cameraPreview = page.getByLabel("Pratinjau kamera");
    this.continueToRoomLink = page.getByRole("link", { name: "Mulai wawancara" });
    this.lockedStartButton = page.getByRole("button", { name: "Mulai wawancara" });
    this.startCalibrationButton = page.getByRole("button", { name: "Mulai kalibrasi" });
    this.faceNotFoundAlert = page.getByRole("alert").filter({ hasText: "Wajah tidak terlihat cukup lama" });
    this.roomHeading = page.getByText(/^Pertanyaan \d+ dari \d+$/);
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

  async chooseSetup(role = "Frontend developer", level = "Fresh graduate", questionSet = "Perilaku (STAR)") {
    await this.page.getByRole("radio", { name: role }).check({ force: true });
    await this.page.getByRole("radio", { name: level }).check({ force: true });
    await this.page.getByRole("radio", { name: questionSet }).check({ force: true });
  }

  async createSession(): Promise<string> {
    await this.gotoSetup();
    await this.chooseSetup();
    await this.calibrationLink.click();
    await expect(this.page).toHaveURL(/\/practice\/check\?session=[0-9a-f-]{36}$/);
    return new URL(this.page.url()).searchParams.get("session")!;
  }

  async expectSetupLoaded() {
    await expect(this.setupHeading).toBeVisible();
  }

  async expectCalibrationReady() {
    await expect(this.cameraPreview).toBeVisible();
    await expect(this.startCalibrationButton).toBeEnabled();
    await expect(this.lockedStartButton).toBeDisabled();
  }

  async expectRoomLoaded() {
    await expect(this.roomHeading).toBeVisible();
  }
}
