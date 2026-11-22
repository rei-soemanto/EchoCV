import { type Locator, type Page, expect } from "@playwright/test";

export class LandingPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly startPracticeLink: Locator;
  readonly uploadLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "EchoCV" });
    this.startPracticeLink = page.getByRole("link", { name: "Mulai latihan" }).first();
    this.uploadLink = page.getByRole("link", { name: "Unggah rekaman" }).first();
  }

  async goto() {
    await this.page.goto("/");
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }
}
