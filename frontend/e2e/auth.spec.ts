import { expect, test } from "@playwright/test";
import { DEV_ADMIN, totpNow } from "./totp";

test.describe("accounts", () => {
  test("registering shows the check-your-email screen", async ({ page }) => {
    const email = `e2e-${String(Date.now())}@example.rw`;
    await page.goto("/register");

    await page.getByLabel("Full name").fill("E2E Learner");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("a-long-unusual-passphrase-2026");
    await page.getByLabel("Age group").selectOption({ index: 1 });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });

  test("registration refuses a weak password and says why", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("E2E Learner");
    await page.getByLabel("Email", { exact: true }).fill("weak@example.rw");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toHaveCount(0);
    await expect(page.locator("[role=alert], .text-destructive").first()).toBeVisible();
  });

  test("a wrong password gives one generic message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(DEV_ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("staff console", () => {
  test("staff must pass two-step verification before the console opens", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(DEV_ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill(DEV_ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/account/);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Confirm it is you" })).toBeVisible();

    // A wrong code is refused and the console stays closed.
    await page.getByLabel("Code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("heading", { name: "Confirm it is you" })).toBeVisible();

    await page.getByLabel("Code").fill(totpNow(DEV_ADMIN.totpSecret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("heading", { name: "Confirm it is you" })).toBeHidden();
    await expect(page).toHaveURL(/\/admin/);
  });

  test("a signed-out visitor cannot see the console", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Confirm it is you" })).toHaveCount(0);
    await expect(page.getByText(/Users|Leads|Referrals/).first()).toBeHidden();
  });
});
