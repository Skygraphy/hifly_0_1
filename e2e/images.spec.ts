import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";

test("Auswahl übernehmen führt von / zu /images und zeigt den zuletzt gewählten Standort-Namen groß an", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Niederösterreich" }).click();

  await page.getByTestId("submit-selection-link").click();
  await expect(page).toHaveURL(/\/images$/);
  await expect(page.getByTestId("last-administrative-unit-name")).toContainText("Niederösterreich");

  await page.getByTestId("back-link").click();
  await expect(page).toHaveURL("http://localhost:3000/");
});

test("Auswahl übernehmen funktioniert auch für eine gewählte Region", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" }).click();
  // Hohe Tauern ist direkt mit mehreren Bundesländern verknüpft und
  // erscheint deshalb bereits in der Bundesland-Spalte (deren niedrigster
  // gemeinsamer Vorfahre), nicht erst nach Auswahl eines einzelnen
  // Bundeslands.
  await page.locator('[data-testid^="region-option-"]', { hasText: "Hohe Tauern" }).click();

  await page.getByTestId("submit-selection-link").click();
  await expect(page).toHaveURL(/\/images$/);
  await expect(page.getByTestId("last-administrative-unit-name")).toContainText("Hohe Tauern");
});

test("/images ohne vorherige Auswahl ist nicht erreichbar (anonym) — Guard leitet auf / um", async ({ page }) => {
  await page.goto("/images");
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByText("Wähle deinen Standort")).toBeVisible();
});

test("/images ohne vorherige Auswahl ist nicht erreichbar (eingeloggt) — Guard leitet serverseitig um", async ({
  page,
}) => {
  const userEmail = "e2e-images-guard-user@example.com";
  const password = "e2e-test-password-123";
  await createFixtureUser({ email: userEmail, password, role: "user" });
  try {
    await loginWithCredentials(page, userEmail, password);
    await page.goto("/images");
    await expect(page).toHaveURL("http://localhost:3000/");
  } finally {
    await deleteFixtureUser(userEmail);
  }
});
