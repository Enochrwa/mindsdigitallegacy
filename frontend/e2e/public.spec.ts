import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/courses", "/internships", "/about", "/privacy", "/login", "/register"];

test.describe("public pages", () => {
  for (const path of PAGES) {
    test(`${path} loads and has no serious accessibility violations`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("main, [role=main]").first()).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(blocking.map((v) => `${v.id}: ${v.help} (${String(v.nodes.length)} node(s))`)).toEqual(
        [],
      );
      expect(errors).toEqual([]);
    });
  }

  test("security headers are present on the HTML document", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(
      headers["content-security-policy"] ?? headers["content-security-policy-report-only"],
    ).toContain("frame-ancestors 'none'");
  });

  test("an unknown page shows a friendly not-found screen, not a stack trace", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/at .*\.(ts|tsx|js):\d+/)).toHaveCount(0);
  });
});
