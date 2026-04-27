import { expect, test } from "@playwright/test";

import { injectMockWallet } from "./helpers/mock-wallet";

test("mock wallet can drive escrow and confidential bid actions", async ({ page }) => {
  await injectMockWallet(page);
  await page.goto("/marketplace/aurora-vault-091");

  await page.locator(".wallet-control").getByRole("button", { name: /Connect wallet/i }).click();
  await expect(page.getByRole("button", { name: /Sepolia/i })).toBeVisible();

  await expect(page.getByRole("button", { name: /Add escrow/i })).toBeVisible();
  await page.getByRole("textbox", { name: /Escrow amount in ETH/i }).fill("5.00");
  await page.getByRole("button", { name: /Add escrow/i }).click();

  await expect(page.getByText("Escrow added")).toBeVisible();
  await expect(page.getByRole("button", { name: /Seal bid/i })).toBeVisible();

  await page.getByRole("textbox", { name: /Bid amount in ETH/i }).fill("3.50");
  await page.getByRole("button", { name: /Seal bid/i }).click();
  await expect(page.getByRole("heading", { name: "Confidential bid prepared" })).toBeVisible();
  await expect(page.getByText(/Latest activity/i)).toBeVisible();
});

test("wrong-network session surfaces a one-click switch path", async ({ page }) => {
  await injectMockWallet(page, { chainIdHex: "0x1" });
  await page.goto("/governance");

  await page.locator(".wallet-control").getByRole("button", { name: /Connect wallet/i }).click();
  await page.locator(".wallet-control").getByRole("button", { name: /Review/i }).click();
  await page.getByRole("button", { name: /Switch to Sepolia/i }).click();

  await expect(page.getByText("Session ready")).toBeVisible();
});
