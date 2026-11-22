import { type Locator, type Page, expect } from "@playwright/test";

export class UploadPage {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Unggah rekaman" });
  }

  async goto() {
    await this.page.goto("/upload");
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }
}
