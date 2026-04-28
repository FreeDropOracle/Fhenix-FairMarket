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
  await expect(page.getByRole("heading", { name: "Confidential bid prepared" })).toBeVisible({ timeout: 15_000 });
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

test("create auction page wires NFT approval and market submission through the wallet", async ({ page }) => {
  await injectMockWallet(page);
  await page.goto("/marketplace/create");
  const createCard = page.locator(".create-form-card");

  await page.getByRole("textbox", { name: /NFT contract/i }).fill("0x1111111111111111111111111111111111111111");
  await page.getByRole("textbox", { name: /Token ID/i }).fill("91");
  await page.getByRole("textbox", { name: /Seller deposit \(ETH\)/i }).fill("1.25");
  await page.getByRole("textbox", { name: /^Days$/i }).fill("10");
  await page.getByRole("textbox", { name: /^Hours$/i }).fill("20");
  await page.getByRole("textbox", { name: /^Minutes$/i }).fill("30");
  await expect(page.getByText("10 days, 20 hours, 30 minutes")).toBeVisible();

  await createCard.getByRole("button", { name: /^Connect wallet$/i }).click();
  await expect(createCard.getByRole("button", { name: /Create auction/i })).toBeVisible();

  await createCard.getByRole("button", { name: /Create auction/i }).click();

  await expect(page.getByText("Auction confirmed")).toBeVisible();
  await expect(page.getByText("NFT approval was completed automatically first.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open on Etherscan/i })).toBeVisible();
});

test("seller controls render for live auctions across active and cancelled states", async ({ page }) => {
  await injectMockWallet(page, { account: "0x83b97659AB11e47B6696aA464957eD05203794f0" });
  await page.goto("/marketplace/1");
  await expect(page.getByRole("heading", { name: /Cancel the lot or close the seller payout path/i })).toBeVisible();

  const connectSellerWallet = page.getByRole("button", { name: /Connect seller wallet/i });
  if (await connectSellerWallet.isVisible().catch(() => false)) {
    await connectSellerWallet.click();
    await expect(page.getByRole("button", { name: /^Cancel auction$/i })).toBeVisible();
    return;
  }

  await expect(
    page.getByRole("button", { name: /Claim seller deposit|Seller payout claimed|No seller payout available/i })
  ).toBeVisible();
});
