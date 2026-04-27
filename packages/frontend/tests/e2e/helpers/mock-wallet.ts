import type { Page } from "@playwright/test";

type MockWalletOptions = {
  account?: string;
  chainIdHex?: string;
};

export async function injectMockWallet(page: Page, options: MockWalletOptions = {}) {
  const account = options.account ?? "0x8A4d0000000000000000000000000000000072C1";
  const chainIdHex = options.chainIdHex ?? "0xaa36a7";

  await page.addInitScript(
    ({ injectedAccount, injectedChainIdHex }) => {
      type Listener = (...args: unknown[]) => void;
      type JsonRpcTransaction = {
        data?: string;
        from?: string;
        to?: string;
        value?: string;
      };

      const zeroAddress = "0x0000000000000000000000000000000000000000";
      const ownerOfSelector = "0x6352211e";
      const getApprovedSelector = "0x081812fc";
      const isApprovedForAllSelector = "0xe985e9c5";
      const approveSelector = "0x095ea7b3";
      const createAuctionSelector = "0x41370f0d";
      const lockEscrowSelector = "0x8e4928af";
      const cancelAuctionSelector = "0x96b5a755";
      const claimSellerProceedsSelector = "0x3f417737";
      const escrowBalancesSelector = "0x854ddc0c";
      const getAuctionSelector = "0x78bd7935";
      const previewSellerPayoutSelector = "0xab9c1b00";
      const mockNftContract = "0x1238536071E1c677A632429e3655c799b22cDA52";
      const mockTokenId = 24191n;
      const mockAuctionEndTime = 1777341600n;
      const mockAuctionCreatedAt = 1777298400n;
      const mockSellerDepositWei = 100000000000000000n;
      const zeroBytes32 = `0x${"0".repeat(64)}`;

      function encodeAddress(value: string) {
        return `0x${value.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
      }

      function encodeBool(value: boolean) {
        return `0x${value ? "1".padStart(64, "0") : "".padStart(64, "0")}`;
      }

      function encodeUint(value: bigint) {
        return `0x${value.toString(16).padStart(64, "0")}`;
      }

      function readSlot(data: string, index: number) {
        const offset = 10 + index * 64;
        return data.slice(offset, offset + 64);
      }

      function decodeAddressFromSlot(data: string, index: number) {
        const slot = readSlot(data, index);
        return `0x${slot.slice(24)}`;
      }

      function decodeUintFromSlot(data: string, index: number) {
        const slot = readSlot(data, index);
        return BigInt(`0x${slot}`);
      }

      class MockEthereumProvider {
        private account = injectedAccount;

        private chainId = injectedChainIdHex;

        private connected = false;

        private listeners = new Map<string, Set<Listener>>();

        private nextTxNumber = 1n;

        private approvedByToken = new Map<string, string>();

        private receipts = new Map<string, { logs: unknown[]; status: string; transactionHash: string }>();

        private auctionCancelled = false;

        private sellerClaimed = false;

        private sellerPayoutWei = 100000000000000000n;

        private walletEscrowWei = 0n;

        private getTxHash() {
          const hash = `0x${this.nextTxNumber.toString(16).padStart(64, "0")}`;
          this.nextTxNumber += 1n;
          return hash;
        }

        private buildReceipt(txHash: string) {
          return {
            logs: [],
            status: "0x1",
            transactionHash: txHash
          };
        }

        private handleCall(transaction: JsonRpcTransaction) {
          const data = transaction.data ?? "";
          const selector = data.slice(0, 10);

          switch (selector) {
            case ownerOfSelector:
              return encodeAddress(this.account);
            case getApprovedSelector: {
              const tokenId = decodeUintFromSlot(data, 0).toString();
              return encodeAddress(this.approvedByToken.get(tokenId) ?? zeroAddress);
            }
            case isApprovedForAllSelector:
              return encodeBool(false);
            case previewSellerPayoutSelector:
              return encodeUint(this.auctionCancelled && !this.sellerClaimed ? this.sellerPayoutWei : 0n);
            case escrowBalancesSelector:
              return encodeUint(this.walletEscrowWei);
            case getAuctionSelector:
              return [
                encodeAddress(mockNftContract).slice(2),
                encodeUint(mockTokenId).slice(2),
                encodeAddress(this.account).slice(2),
                encodeUint(mockAuctionEndTime).slice(2),
                encodeUint(mockSellerDepositWei).slice(2),
                encodeUint(this.auctionCancelled ? 4n : 1n).slice(2),
                encodeBool(true).slice(2),
                encodeUint(mockAuctionCreatedAt).slice(2),
                zeroBytes32.slice(2),
                encodeUint(0n).slice(2)
              ].join("").replace(/^/, "0x");
            default:
              throw new Error(`Unsupported mock wallet eth_call selector: ${selector}`);
          }
        }

        private handleTransaction(transaction: JsonRpcTransaction) {
          const data = transaction.data ?? "";
          const selector = data.slice(0, 10);
          const txHash = this.getTxHash();

          switch (selector) {
            case approveSelector: {
              const operator = decodeAddressFromSlot(data, 0);
              const tokenId = decodeUintFromSlot(data, 1).toString();
              this.approvedByToken.set(tokenId, operator.toLowerCase());
              this.receipts.set(txHash, this.buildReceipt(txHash));
              return txHash;
            }
            case createAuctionSelector:
              this.receipts.set(txHash, this.buildReceipt(txHash));
              return txHash;
            case lockEscrowSelector: {
              const valueHex = transaction.value ?? "0x0";
              this.walletEscrowWei += BigInt(valueHex);
              this.receipts.set(txHash, this.buildReceipt(txHash));
              return txHash;
            }
            case cancelAuctionSelector:
              this.auctionCancelled = true;
              this.receipts.set(txHash, this.buildReceipt(txHash));
              return txHash;
            case claimSellerProceedsSelector:
              this.sellerClaimed = true;
              this.receipts.set(txHash, this.buildReceipt(txHash));
              return txHash;
            default:
              this.receipts.set(txHash, this.buildReceipt(txHash));
              return txHash;
          }
        }

        async request(args: { method: string; params?: unknown[] | object }) {
          switch (args.method) {
            case "eth_accounts":
              return this.connected ? [this.account] : [];
            case "eth_requestAccounts":
              this.connected = true;
              this.emit("accountsChanged", [this.account]);
              return [this.account];
            case "eth_chainId":
              return this.chainId;
            case "wallet_switchEthereumChain": {
              const params = Array.isArray(args.params) ? args.params[0] : null;
              const nextChainId =
                typeof params === "object" && params && "chainId" in params
                  ? String((params as { chainId?: string }).chainId)
                  : this.chainId;
              this.chainId = nextChainId;
              this.emit("chainChanged", this.chainId);
              return null;
            }
            case "wallet_addEthereumChain": {
              const params = Array.isArray(args.params) ? args.params[0] : null;
              const nextChainId =
                typeof params === "object" && params && "chainId" in params
                  ? String((params as { chainId?: string }).chainId)
                  : this.chainId;
              this.chainId = nextChainId;
              this.emit("chainChanged", this.chainId);
              return null;
            }
            case "eth_call": {
              const params = Array.isArray(args.params) ? args.params[0] : null;
              if (!params || typeof params !== "object") {
                throw new Error("Missing eth_call params.");
              }
              return this.handleCall(params as JsonRpcTransaction);
            }
            case "eth_sendTransaction": {
              const params = Array.isArray(args.params) ? args.params[0] : null;
              if (!params || typeof params !== "object") {
                throw new Error("Missing eth_sendTransaction params.");
              }
              return this.handleTransaction(params as JsonRpcTransaction);
            }
            case "eth_getTransactionReceipt": {
              const params = Array.isArray(args.params) ? args.params[0] : null;
              const txHash = typeof params === "string" ? params : "";
              return this.receipts.get(txHash) ?? null;
            }
            default:
              throw new Error(`Unsupported mock wallet method: ${args.method}`);
          }
        }

        on(event: string, listener: Listener) {
          const bucket = this.listeners.get(event) ?? new Set<Listener>();
          bucket.add(listener);
          this.listeners.set(event, bucket);
        }

        removeListener(event: string, listener: Listener) {
          this.listeners.get(event)?.delete(listener);
        }

        private emit(event: string, ...args: unknown[]) {
          this.listeners.get(event)?.forEach((listener) => listener(...args));
        }
      }

      Object.defineProperty(window, "ethereum", {
        configurable: true,
        value: new MockEthereumProvider()
      });
    },
    { injectedAccount: account, injectedChainIdHex: chainIdHex }
  );
}
