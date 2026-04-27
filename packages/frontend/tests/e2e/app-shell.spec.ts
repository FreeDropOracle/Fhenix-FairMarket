import { expect, test } from "@playwright/test";

test("home route exposes skip link and core navigation", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();

  await skipLink.click();
  await expect(page.locator("#main-content")).toBeFocused();

  await expect(page.getByRole("heading", { level: 1, name: /Math-Based Integrity/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Marketplace" })).toHaveAttribute("href", "/marketplace");

  await page.goto("/marketplace");
  await expect(page).toHaveURL(/\/marketplace/);
  await expect(page.getByRole("heading", { level: 2, name: /Filter the surface/i })).toBeVisible();
});

test("portfolio and governance surfaces render their release-ready sections", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { level: 2, name: /Unified claim surface/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Activity trail/i })).toBeVisible();

  await page.goto("/governance");
  await expect(page.getByRole("heading", { level: 1, name: /If something slows down/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /Signals users can trust/i })).toBeVisible();
});
