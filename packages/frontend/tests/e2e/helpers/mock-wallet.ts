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

      class MockEthereumProvider {
        private account = injectedAccount;

        private chainId = injectedChainIdHex;

        private connected = false;

        private listeners = new Map<string, Set<Listener>>();

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
