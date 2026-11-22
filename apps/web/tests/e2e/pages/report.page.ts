import { type Locator, type Page, expect } from "@playwright/test";

export class ReportPage {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Laporan sesi" });
  }

  async goto(sessionId: string) {
    await this.page.goto(`/report/${sessionId}`);
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
  }
}
