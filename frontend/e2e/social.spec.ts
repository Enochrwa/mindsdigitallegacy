import { expect, test } from "@playwright/test";

/**
 * Uses the demo providers the in-memory dev API switches on (no keys, no internet): clicking a button skips the
 * provider's page and returns a fixed demo person. See docs/11-social-sign-in-setup.md, section 9.
 */
test.describe("social sign-in", () => {
  test("sign-in and sign-up pages offer every provider", async ({ page }) => {
    for (const path of ["/login", "/register"]) {
      await page.goto(path);
      for (const name of ["Google", "Microsoft", "GitHub", "Facebook", "LinkedIn"]) {
        await expect(page.getByRole("link", { name: new RegExp(`with ${name}`) })).toBeVisible();
      }
    }
  });

  test("a new person signs up with GitHub and lands in their account", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /Sign in with GitHub/ }).click();
    await expect(page).toHaveURL(/\/auth\/complete/);
    await expect(page.getByRole("heading", { name: "Finish signing up" })).toBeVisible();
    await expect(page.getByText("github.demo@example.rw")).toBeVisible();

    await page.getByLabel("Age group").selectOption("16_plus");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByRole("heading", { name: "Sign-in methods" })).toBeVisible();
  });

  test("Microsoft asks for a mailbox code before creating the account", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: /Sign up with Microsoft/ }).click();
    await expect(page).toHaveURL(/\/auth\/complete/);
    await page.getByLabel("Age group").selectOption("16_plus");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send me a code" }).click();
    await expect(page.getByLabel("Confirmation code")).toBeVisible();
    await page.getByLabel("Confirmation code").fill("00000000");
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page.getByText(/not right/i)).toBeVisible();
  });

  test("a failed provider trip shows a calm message, not provider text", async ({ page }) => {
    await page.goto("/login?error=oauth_account_exists&provider=google");
    await expect(page.getByText(/already exists/i)).toBeVisible();
    await page.goto("/login?error=oauth_%3Cscript%3E");
    await expect(page.getByText("<script>")).toHaveCount(0);
  });
});
