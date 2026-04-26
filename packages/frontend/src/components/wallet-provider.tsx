"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";

import { appConfig } from "@/lib/app-config";
import type { Eip1193Provider } from "@/lib/eip1193";

type WalletContextValue = {
  account: string | null;
  chainId: number | null;
  chainName: string | null;
  error: string | null;
  hasProvider: boolean;
  isClient: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isDismissed: boolean;
  isSupportedNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToSepolia: () => Promise<void>;
};

const walletSessionDismissKey = "ffm.wallet.session.dismissed";
const WalletContext = createContext<WalletContextValue | null>(null);

function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.ethereum ?? null;
}

function parseChainId(chainId: string | null | undefined) {
  if (!chainId) {
    return null;
  }

  return Number.parseInt(chainId, 16);
}

function readDismissedState() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(walletSessionDismissKey) === "1";
}

function persistDismissedState(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  if (value) {
    window.localStorage.setItem(walletSessionDismissKey, "1");
    return;
  }

  window.localStorage.removeItem(walletSessionDismissKey);
}

async function getWalletSnapshot(provider: Eip1193Provider) {
  const [accounts, chainId] = await Promise.all([
    provider.request({ method: "eth_accounts" }) as Promise<string[]>,
    provider.request({ method: "eth_chainId" }) as Promise<string>
  ]);

  return {
    account: accounts[0] ?? null,
    chainId: parseChainId(chainId)
  };
}

export function WalletProvider({ children }: PropsWithChildren) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismissedRef = useRef(false);

  const applyDismissedState = useCallback((value: boolean) => {
    dismissedRef.current = value;
    setIsDismissed(value);
    persistDismissedState(value);
  }, []);

  const syncSnapshot = useCallback(async () => {
    const provider = getProvider();
    const dismissed = readDismissedState();

    setIsClient(true);
    setHasProvider(Boolean(provider));
    dismissedRef.current = dismissed;
    setIsDismissed(dismissed);

    if (!provider) {
      setAccount(null);
      setChainId(null);
      return;
    }

    try {
      const snapshot = await getWalletSnapshot(provider);
      setChainId(snapshot.chainId);
      setAccount(dismissed ? null : snapshot.account);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to inspect wallet state.");
    }
  }, []);

  useEffect(() => {
    void syncSnapshot();

    const provider = getProvider();
    if (!provider?.on) {
      return;
    }

    const handleAccountsChanged = (accounts: string[]) => {
      const nextAccount = accounts[0] ?? null;

      if (!nextAccount) {
        setAccount(null);
        setError(null);
        return;
      }

      if (!dismissedRef.current) {
        setAccount(nextAccount);
      }

      setError(null);
    };

    const handleChainChanged = (value: string) => {
      setChainId(parseChainId(value));
      setError(null);
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [syncSnapshot]);

  const connect = useCallback(async () => {
    const provider = getProvider();
    setIsClient(true);
    setHasProvider(Boolean(provider));

    if (!provider) {
      setError("No injected wallet was found.");
      return;
    }

    try {
      setIsConnecting(true);
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const nextChain = (await provider.request({ method: "eth_chainId" })) as string;
      applyDismissedState(false);
      setAccount(accounts[0] ?? null);
      setChainId(parseChainId(nextChain));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Wallet connection failed.");
    } finally {
      setIsConnecting(false);
    }
  }, [applyDismissedState]);

  const disconnect = useCallback(() => {
    applyDismissedState(true);
    setAccount(null);
    setError(null);
  }, [applyDismissedState]);

  const switchToSepolia = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setError("No injected wallet was found.");
      return;
    }

    try {
      setIsConnecting(true);
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: appConfig.chain.hexId }]
      });

      const nextChain = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(parseChainId(nextChain));
      setError(null);
    } catch (nextError) {
      const walletError = nextError as { code?: number; message?: string };

      if (walletError.code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: appConfig.chain.hexId,
                chainName: appConfig.chain.name,
                rpcUrls: [appConfig.chain.rpcUrl],
                blockExplorerUrls: [appConfig.chain.blockExplorerUrl],
                nativeCurrency: {
                  name: "Sepolia Ether",
                  symbol: "ETH",
                  decimals: 18
                }
              }
            ]
          });

          const nextChain = (await provider.request({ method: "eth_chainId" })) as string;
          setChainId(parseChainId(nextChain));
          setError(null);
        } catch (nestedError) {
          setError(nestedError instanceof Error ? nestedError.message : "Unable to add Sepolia to wallet.");
        }
      } else {
        setError(walletError.message ?? "Unable to switch network.");
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const value = useMemo<WalletContextValue>(() => {
    const supported = chainId === appConfig.chain.id;

    return {
      account,
      chainId,
      chainName: chainId ? (supported ? appConfig.chain.name : `Chain ${chainId}`) : null,
      error,
      hasProvider,
      isClient,
      isConnected: Boolean(account) && !isDismissed,
      isConnecting,
      isDismissed,
      isSupportedNetwork: supported,
      connect,
      disconnect,
      switchToSepolia
    };
  }, [account, chainId, connect, disconnect, error, hasProvider, isClient, isConnecting, isDismissed, switchToSepolia]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider.");
  }

  return context;
}
