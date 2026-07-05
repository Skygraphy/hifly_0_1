import { test, expect } from "@playwright/test";

test("startseite zeigt HiFly", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "HiFly" })).toBeVisible();
});
