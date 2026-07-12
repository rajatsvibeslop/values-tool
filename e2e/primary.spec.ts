import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => { localStorage.clear(); await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase("values-tool"); request.onsuccess = () => resolve(); request.onerror = () => resolve(); request.onblocked = () => resolve(); }); });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("imports values, completes comparisons, and inspects rankings and history", async ({ page }) => {
  const card = page.locator(".grid.three-col > .panel-body").filter({ hasText: "Editable values card sort" });
  await card.getByRole("button", { name: "Import preset" }).click();
  await expect(page.getByText("Current top values")).toBeVisible();

  await page.locator('a[href="#compare"]').first().click();
  await page.getByLabel("Session name").fill("E2E priorities");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByText("0 done · 20 left")).toBeVisible();
  await page.getByRole("button", { name: /Left wins/ }).click();
  await expect(page.getByText("1 done · 19 left")).toBeVisible();

  await page.locator('a[href="#rankings"]').first().click();
  await expect(page.getByRole("heading", { name: "Posterior ordering" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(20);

  await page.locator('a[href="#history"]').first().click();
  await expect(page.getByText("1 comparison events")).toBeVisible();
  await expect(page.getByText("Selected source record")).toBeVisible();
});

test("persists the SQLite database in IndexedDB across reloads", async ({ page }) => {
  const card = page.locator(".grid.three-col > .panel-body").filter({ hasText: "Schwartz 10 broad basic values" });
  await card.getByRole("button", { name: "Import preset" }).click();
  await expect(page.getByText("Current top values")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Current top values")).toBeVisible();
  await page.locator('a[href="#values"]').first().click();
  await expect(page.getByText("Schwartz 10 broad basic values").first()).toBeVisible();
});

test("lets a new session choose among multiple value sets", async ({ page }) => {
  await page.locator(".grid.three-col > .panel-body").filter({ hasText: "Editable values card sort" }).getByRole("button", { name: "Import preset" }).click();
  await page.locator('a[href="#values"]').first().click();
  const presetPanel = page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Import built-in preset" }) });
  const schwartz = presetPanel.locator(".spread").filter({ hasText: "Schwartz 10 broad basic values" });
  await schwartz.getByRole("button", { name: "Import" }).click();
  await page.locator('a[href="#compare"]').first().click();
  await expect(page.getByLabel("Value set")).toHaveValue(/.+/);
  const cardSetId = await page.getByLabel("Value set").locator("option").filter({ hasText: "Editable values card sort" }).getAttribute("value");
  await page.getByLabel("Value set").selectOption(cardSetId!);
  await expect(page.getByText("This session will compare Editable values card sort.")).toBeVisible();
  await page.getByLabel("Session name").fill("Chosen set session");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("heading", { name: "Chosen set session" })).toBeVisible();
});

test("shares a read-only ranking snapshot by URL", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser project is sufficient for link portability");
  await page.locator(".grid.three-col > .panel-body").filter({ hasText: "Schwartz 10 broad basic values" }).getByRole("button", { name: "Import preset" }).click();
  await page.locator('a[href="#rankings"]').first().click();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Share results" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("#rankings?share=");
  const recipient = await browser.newContext();
  const sharedPage = await recipient.newPage();
  await sharedPage.goto(link);
  await expect(sharedPage.getByRole("heading", { name: "Schwartz 10 broad basic values" })).toBeVisible();
  await expect(sharedPage.getByText("Read-only snapshot")).toBeVisible();
  await recipient.close();
});

test("supports keyboard decisions and mobile navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-specific layout check");
  const card = page.locator(".grid.three-col > .panel-body").filter({ hasText: "Editable values card sort" });
  await card.getByRole("button", { name: "Import preset" }).click();
  await page.locator('a[href="#compare"]').first().click();
  await page.getByLabel("Session name").fill("Mobile session");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: /Left wins/ })).toBeVisible();
  await page.waitForTimeout(100);
  await page.keyboard.press("1");
  await expect(page.getByText("1 done · 19 left")).toBeVisible();
  const body = await page.locator("body").boundingBox();
  expect(body?.width).toBeLessThanOrEqual(420);
  await expect(page.locator(".sidebar")).toBeVisible();
});
