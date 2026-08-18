import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * The journey Phase 5 is measured by: empty database to a scored customer with an explanation,
 * without being told what to click.
 *
 * The assertions are deliberately about what a stranger would look for — "Three steps to a scored
 * customer", "Who to call first", "Why they're at risk" — rather than test ids. If the copy that
 * guides someone through this stops existing, this test should fail.
 */

// 220 rows, the same fixture the backend's own scoring tests use: enough to train a real model
// and rank a real list, small enough that the whole journey runs in under a minute.
const CUSTOMERS_CSV = path.join(__dirname, "../../backend/tests/fixtures/train_fixture.csv");

async function uploadTo(page: Page, dropZoneLabel: string, file: string) {
  // The drop zone hides its input, which is right for the UI and awkward for a test — attaching
  // the file directly is how Playwright drives an <input type="file"> either way.
  await page.getByRole("button", { name: dropZoneLabel }).locator("input[type=file]").setInputFiles(file);
}

test("a stranger can go from an empty database to an explained customer", async ({ page }) => {
  // 1. The empty state has to say what to do next, not apologise for having no data.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Three steps to a scored customer" })).toBeVisible();
  await page.getByRole("link", { name: "Upload a dataset" }).click();

  // 2. Upload customer data. The app profiles it and lands on the dataset page.
  await expect(page).toHaveURL(/\/datasets$/);
  await uploadTo(page, "Upload a CSV dataset", CUSTOMERS_CSV);
  await expect(page.getByRole("heading", { name: /train_fixture/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Column profile")).toBeVisible();

  // 3. Train a model on it. One algorithm, untuned — this test is about the path, not the podium.
  await page.getByRole("link", { name: "Model runs" }).first().click();
  await page.getByLabel("Dataset").selectOption({ index: 1 });
  for (const algorithm of ["Random Forest", "XGBoost", "LightGBM"]) {
    await page.getByRole("checkbox", { name: algorithm }).uncheck();
  }
  await page.getByRole("button", { name: "Start training run" }).click();

  // 4. Wait for it. The run page polls itself; the test just watches for the verdict.
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+$/);
  await expect(page.getByText("succeeded")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Model comparison")).toBeVisible();

  // 5. Score a file of customers against it.
  await page.getByRole("link", { name: "Predict" }).first().click();
  await page.getByRole("button", { name: "A file of customers" }).click();
  await uploadTo(page, "Upload a CSV of customers to score", CUSTOMERS_CSV);

  await expect(page).toHaveURL(/\/predict\/batches\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Who to call first" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Revenue at risk over the next year")).toBeVisible();

  // 6. Open the customer at the top of the list and read why they're at risk.
  const firstCustomer = page.getByRole("button", { name: /^Open / }).first();
  await firstCustomer.click();

  const drawer = page.getByRole("dialog", { name: "Customer detail" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Why they're at risk")).toBeVisible();
  await expect(drawer.getByText("What they're worth")).toBeVisible();
  // The explanation is a real one: at least one driver, named.
  await expect(drawer.getByRole("listitem").first()).not.toBeEmpty();

  // 7. And that customer has an address of their own, for anyone they get forwarded to.
  await drawer.getByRole("link", { name: /Open as a page you can share/ }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/);
  await expect(page.getByText("Why they're at risk")).toBeVisible();
  await expect(page.getByText("Lifetime value", { exact: true })).toBeVisible();
});

test("the overview reports the portfolio once customers have been scored", async ({ page }) => {
  // Runs after the journey above, against the same scratch database, so there is money to report.
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Retention overview" })).toBeVisible();
  await expect(page.getByText("Revenue at risk over the next year")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where the risk sits" })).toBeVisible();

  // The assumptions are live inputs, not a footnote: dropping the save rate has to move the money.
  const worthRecovering = page
    .locator("dt", { hasText: "Worth recovering" })
    .locator("xpath=following-sibling::dd[1]");
  const before = await worthRecovering.innerText();

  await page.getByLabel("Customers saved when contacted").fill("0.05");

  await expect(page.getByText(/this is a what-if/)).toBeVisible();
  await expect(worthRecovering).not.toHaveText(before);
});
