import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => { localStorage.clear(); await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase("values-tool"); request.onsuccess = () => resolve(); request.onerror = () => resolve(); request.onblocked = () => resolve(); }); });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("imports values, completes comparisons, and inspects rankings and history", async ({ page }) => {
  const card = page.locator(".preset-row").filter({ hasText: "Editable values card sort" });
  await card.getByRole("button", { name: "Use set" }).click();
  await expect(page.getByText("Current top values")).toBeVisible();

  await page.locator('a[href="#compare"]').first().click();
  await page.getByLabel("Method").selectOption("exact");
  await page.getByLabel("Session name").fill("E2E priorities");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByText("1/20 placed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Left wins/ }).click();
  await expect(page.getByText("2/20 placed", { exact: true })).toBeVisible();

  await page.locator('a[href="#rankings"]').first().click();
  await expect(page.getByRole("heading", { name: "Estimated ordering" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(20);

  await page.locator('a[href="#history"]').first().click();
  await expect(page.getByText("1 comparison events")).toBeVisible();
  await expect(page.getByText("Selected source record")).toBeVisible();
});

test("persists the SQLite database in IndexedDB across reloads", async ({ page }) => {
  const card = page.locator(".preset-row").filter({ hasText: "Schwartz 10 broad basic values" });
  await card.getByRole("button", { name: "Use set" }).click();
  await expect(page.getByText("Current top values")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Current top values")).toBeVisible();
  await page.locator('a[href="#values"]').first().click();
  await expect(page.getByText("Schwartz 10 broad basic values").first()).toBeVisible();
});

test("lets a new session choose among multiple value sets", async ({ page }) => {
  await page.locator(".preset-row").filter({ hasText: "Editable values card sort" }).getByRole("button", { name: "Use set" }).click();
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

test("starts a new session directly from a preset", async ({ page }) => {
  await page.locator(".preset-row").filter({ hasText: "Editable values card sort" }).getByRole("button", { name: "Use set" }).click();
  await page.locator('a[href="#compare"]').first().click();
  await page.getByLabel("Session name").fill("First session");
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByLabel("Value set").selectOption("preset:schwartz-10");
  await expect(page.getByText("This session will compare Schwartz 10 broad basic values.")).toBeVisible();
  await page.getByLabel("Session name").fill("Preset session");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("heading", { name: "Preset session" })).toBeVisible();
  await expect(page.getByText("1/8", { exact: true })).toBeVisible();
  await expect(page.locator(".rapid-rank-row")).toHaveCount(5);
  await page.getByRole("button", { name: "Use this order" }).click();
  await expect(page.getByText("2/8", { exact: true })).toBeVisible();
});

test("shares a read-only ranking snapshot by URL", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser project is sufficient for link portability");
  await page.locator(".preset-row").filter({ hasText: "Schwartz 10 broad basic values" }).getByRole("button", { name: "Use set" }).click();
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
  const card = page.locator(".preset-row").filter({ hasText: "Editable values card sort" });
  await card.getByRole("button", { name: "Use set" }).click();
  await page.locator('a[href="#compare"]').first().click();
  await page.getByLabel("Method").selectOption("exact");
  await page.getByLabel("Session name").fill("Mobile session");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: /Left wins/ })).toBeVisible();
  await page.waitForTimeout(100);
  await page.keyboard.press("1");
  await expect(page.getByText("2/20 placed", { exact: true })).toBeVisible();
  const body = await page.locator("body").boundingBox();
  expect(body?.width).toBeLessThanOrEqual(420);
  await expect(page.locator(".sidebar")).toBeVisible();
});

test("includes the broad and Miller value catalogs", async ({ page }) => {
  const cards = page.locator(".preset-row");
  await expect(cards.filter({ hasText: "Broad 100 personal values" })).toContainText("100");
  await expect(cards.filter({ hasText: "Miller Personal Values Card Sort" })).toContainText("83");
});

test("exports a self-contained HTML tier report", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One download check is sufficient");
  const card = page.locator(".preset-row").filter({ hasText: "Schwartz 10 broad basic values" });
  await card.getByRole("button", { name: "Use set" }).click();
  await page.locator('a[href="#reports"]').first().click();
  await expect(page.getByRole("heading", { name: "Stable tiers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Definitely above or below" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "HTML" }).click();
  const report = await downloadPromise;
  expect(report.suggestedFilename()).toMatch(/\.html$/);
});

test("stores hosted scenario credentials only for the browser tab", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One settings check is sufficient");
  await page.locator('a[href="#settings"]').first().click();
  await page.getByLabel("Generator").selectOption("openrouter");
  await page.getByLabel(/API key/).fill("test-session-key");
  await page.getByLabel("Model").fill("openrouter/free");
  await page.locator(".panel").filter({ has: page.getByRole("heading", { name: "Decision scenarios" }) }).getByRole("button", { name: "Save", exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem("scenario-api-key"))).toBe("test-session-key");
  expect(await page.evaluate(() => localStorage.getItem("scenario-provider"))).toBe("openrouter");
  let scenarioRequests = 0;
  await page.route("https://openrouter.ai/api/v1/chat/completions", (route) => {
    scenarioRequests += 1;
    const body = route.request().postDataJSON() as {
      max_tokens: number;
      response_format: { type: string; json_schema: { strict: boolean } };
      plugins: { id: string }[];
      provider: { require_parameters: boolean };
    };
    expect(body.max_tokens).toBe(1_400);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.plugins).toEqual([{ id: "response-healing" }]);
    expect(body.provider.require_parameters).toBe(true);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        scenario: "You must choose between a secure familiar role and a risky opportunity to build something meaningful with people you trust.",
        choices: [
          { id: "A", action: "Accept the secure role and protect time for a smaller independent project." },
          { id: "B", action: "Join the risky project and create a concrete fallback plan with your collaborators." },
          { id: "C", action: "Negotiate a short trial that delays the permanent choice until you have direct evidence." },
        ],
      }) } }] }),
    });
  });
  await page.locator('a[href="#compare"]').first().click();
  await page.getByLabel("Value set").selectOption("preset:schwartz-10");
  await page.getByLabel("Session name").fill("Generated scenarios");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByText(/secure familiar role/)).toBeVisible();
  await expect(page.locator(".scenario-choice")).toHaveCount(3);
  await page.getByRole("button", { name: "None fit" }).click();
  await expect.poll(() => scenarioRequests).toBe(2);
  await expect(page.getByText("1/8", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Accept the secure role/ }).click();
  await expect(page.getByText("Who is least like you?")).toBeVisible();
  await page.getByRole("button", { name: /Negotiate a short trial/ }).click();
  await expect(page.getByText("2/8", { exact: true })).toBeVisible();
});

test("resets ranking evidence while preserving the value set", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One destructive-flow check is sufficient");
  await page.locator(".preset-row").filter({ hasText: "Schwartz 10 broad basic values" }).getByRole("button", { name: "Use set" }).click();
  await page.locator('a[href="#compare"]').first().click();
  await page.getByLabel("Method").selectOption("exact");
  await page.getByLabel("Session name").fill("Evidence to reset");
  await page.getByRole("button", { name: "Start session" }).click();
  await page.getByRole("button", { name: /Left wins/ }).click();
  await page.locator('a[href="#settings"]').first().click();
  await page.getByLabel("Type RESET Schwartz 10 broad basic values").fill("RESET Schwartz 10 broad basic values");
  await page.getByRole("button", { name: "Reset this value set" }).click();
  await page.locator('a[href="#history"]').first().click();
  await expect(page.getByText("0 comparison events")).toBeVisible();
  await page.locator('a[href="#values"]').first().click();
  await expect(page.getByText("Schwartz 10 broad basic values").first()).toBeVisible();
});
