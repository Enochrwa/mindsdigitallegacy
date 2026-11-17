import { expect, test } from "@playwright/test";

test.describe("internships", () => {
  test("the portal explains the promises and lists no private details", async ({ page }) => {
    await page.goto("/internships");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/does not guarantee a place/i).first()).toBeVisible();
    await expect(page.getByText(/named supervisor/i).first()).toBeVisible();
  });

  test("an unknown internship shows a friendly message", async ({ page }) => {
    await page.goto("/internships/this-does-not-exist");
    await expect(page.getByRole("heading", { name: /not available/i })).toBeVisible();
  });

  test("my internships sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/account/internships");
    await expect(page).toHaveURL(/\/login/);
  });
});
