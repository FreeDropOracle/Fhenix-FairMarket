"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import { useWallet } from "@/components/wallet-provider";
import { appConfig, formatAddress } from "@/lib/app-config";
import type { StatusPillTone } from "@/components/status-pill";

const pollIntervalMs = 30_000;
const weiPerEth = 10n ** 18n;

type ContractDescriptor = {
  key: "market" | "settlement" | "slashedPot" | "avs";
  label: string;
  address: string;
};

export type RuntimeContractCheck = ContractDescriptor & {
  bytecodeReady: boolean;
  bytecodeLength: number;
  error: string | null;
};

type CoprocessorProbe = {
  label: string;
  tone: StatusPillTone;
  note: string;
  live: boolean;
};

type RuntimeSnapshot = {
  checkedAt: number | null;
  isRefreshing: boolean;
  walletBalanceLabel: string | null;
  walletValue: string;
  walletTone: StatusPillTone;
  walletNote: string;
  registryLabel: string;
  registryTone: StatusPillTone;
  registryNote: string;
  contracts: RuntimeContractCheck[];
  avsLabel: string;
  avsTone: StatusPillTone;
  avsNote: string;
  coprocessor: CoprocessorProbe;
};

type RpcEnvelope<T> = {
  result?: T;
  error?: {
    message?: string;
  };
};

const contractDescriptors: ContractDescriptor[] = [
  {
    key: "market",
    label: "Market proxy",
    address: appConfig.contracts.marketProxyAddress
  },
  {
    key: "settlement",
    label: "Settlement engine",
    address: appConfig.contracts.settlementEngineAddress
  },
  {
    key: "slashedPot",
    label: "Slashed pot",
    address: appConfig.contracts.slashedPotAddress
  },
  {
    key: "avs",
    label: "AVS relay",
    address: appConfig.contracts.avsAddress
  }
];

const emptyContracts: RuntimeContractCheck[] = contractDescriptors.map((contract) => ({
  ...contract,
  bytecodeReady: false,
  bytecodeLength: 0,
  error: null
}));

const initialSnapshot: RuntimeSnapshot = {
  checkedAt: null,
  isRefreshing: false,
  walletBalanceLabel: null,
  walletValue: "Awaiting connection",
  walletTone: "warning",
  walletNote: "Connect on Sepolia to surface a live wallet balance and route state.",
  registryLabel: "Awaiting contract probe",
  registryTone: "warning",
  registryNote: "Registry verification will begin as soon as the runtime probe starts.",
  contracts: emptyContracts,
  avsLabel: "AVS checkpoint pending",
  avsTone: "warning",
  avsNote: "The proof-verification lane will turn live once the AVS contract bytecode is confirmed.",
  coprocessor: {
    label: "External status reference",
    tone: "neutral",
    note: "A dedicated public coprocessor health probe is not configured yet.",
    live: false
  }
};

async function rpcCall<T>(method: string, params: unknown[]) {
  const response = await fetch(appConfig.chain.rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: method,
      method,
      params
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`RPC responded with ${response.status}.`);
  }

  const payload = (await response.json()) as RpcEnvelope<T>;

  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }

  if (typeof payload.result === "undefined") {
    throw new Error(`RPC ${method} returned no result.`);
  }

  return payload.result;
}

function formatBalance(hexWei: string) {
  const wei = BigInt(hexWei);
  const whole = wei / weiPerEth;
  const fractional = wei % weiPerEth;
  const trimmedFractional = Number((fractional * 10_000n) / weiPerEth) / 10_000;
  const amount = Number(whole) + trimmedFractional;

  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: amount >= 1 ? 2 : 4,
    maximumFractionDigits: amount >= 1 ? 4 : 6
  })} ETH`;
}

function buildWalletSnapshot(
  account: string | null,
  balanceLabel: string | null,
  hasProvider: boolean,
  isConnected: boolean,
  isSupportedNetwork: boolean
) {
  if (!hasProvider) {
    return {
      value: "No injected wallet",
      tone: "danger" as const,
      note: "Install a wallet before any settlement, bid, or claim surface can unlock."
    };
  }

  if (!isConnected) {
    return {
      value: "Awaiting connection",
      tone: "warning" as const,
      note: "The shell is ready, but the session is not yet bound to a wallet."
    };
  }

  if (!isSupportedNetwork) {
    return {
      value: `${formatAddress(account)} / switch required`,
      tone: "warning" as const,
      note: "The session is live, but still off the Sepolia release lane."
    };
  }

  return {
    value: balanceLabel ? `${formatAddress(account)} · ${balanceLabel}` : formatAddress(account),
    tone: "success" as const,
    note: "Wallet, settlement network, and runtime route are all aligned."
  };
}

export function useRuntimeReadiness() {
  const wallet = useWallet();
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(initialSnapshot);

  const runProbe = useCallback(async () => {
    startTransition(() => {
      setSnapshot((current) => ({
        ...current,
        isRefreshing: true
      }));
    });

    const contractPromises = contractDescriptors.map(async (contract) => {
      if (!contract.address) {
        return {
          ...contract,
          bytecodeReady: false,
          bytecodeLength: 0,
          error: "Address missing"
        } satisfies RuntimeContractCheck;
      }

      try {
        const bytecode = await rpcCall<string>("eth_getCode", [contract.address, "latest"]);
        return {
          ...contract,
          bytecodeReady: bytecode !== "0x",
          bytecodeLength: bytecode.length,
          error: bytecode === "0x" ? "No bytecode returned" : null
        } satisfies RuntimeContractCheck;
      } catch (error) {
        return {
          ...contract,
          bytecodeReady: false,
          bytecodeLength: 0,
          error: error instanceof Error ? error.message : "Unable to verify bytecode"
        } satisfies RuntimeContractCheck;
      }
    });

    const balancePromise =
      wallet.account && wallet.isSupportedNetwork
        ? rpcCall<string>("eth_getBalance", [wallet.account, "latest"]).catch(() => null)
        : Promise.resolve(null);

    const healthcheckPromise = appConfig.coprocessor.healthcheckUrl
      ? fetch(appConfig.coprocessor.healthcheckUrl, {
          method: "GET",
          cache: "no-store"
        })
          .then((response) => response.ok)
          .catch(() => false)
      : Promise.resolve(null);

    const [contracts, balanceHex, coprocessorLive] = await Promise.all([
      Promise.all(contractPromises),
      balancePromise,
      healthcheckPromise
    ]);

    const walletSnapshot = buildWalletSnapshot(
      wallet.account,
      balanceHex ? formatBalance(balanceHex) : null,
      wallet.hasProvider,
      wallet.isConnected,
      wallet.isSupportedNetwork
    );

    const verifiedContracts = contracts.filter((contract) => contract.bytecodeReady).length;
    const missingContracts = contracts.filter((contract) => contract.error === "Address missing").length;
    const registryTone: StatusPillTone =
      verifiedContracts === contracts.length
        ? "success"
        : verifiedContracts > 0 || missingContracts < contracts.length
          ? "warning"
          : "danger";
    const registryLabel =
      verifiedContracts === contracts.length
        ? "Contract bytecode verified"
        : verifiedContracts > 0
          ? `Verifying contract bytecode... ${verifiedContracts}/${contracts.length}`
          : "Contract registry still incomplete";
    const registryNote =
      verifiedContracts === contracts.length
        ? "All live addresses returned bytecode on Sepolia and are safe to expose as execution surfaces."
        : missingContracts === contracts.length
          ? "At least one required address is still unset, so the registry cannot be treated as live."
          : "Some addresses are live, but the registry should stay guarded until every contract returns bytecode.";

    const avsReady = contracts.find((contract) => contract.key === "avs")?.bytecodeReady ?? false;
    const avsTone: StatusPillTone = avsReady ? "success" : "warning";
    const avsLabel = avsReady ? "EigenLayer AVS checkpoint live" : "AVS checkpoint awaiting proof lane";
    const avsNote = avsReady
      ? "The AVS contract responds on Sepolia, so the proof-verification checkpoint is no longer a static promise."
      : "The proof-verification lane should remain guarded until the AVS address returns live bytecode.";

    let coprocessor: CoprocessorProbe;
    if (coprocessorLive === true) {
      coprocessor = {
        label: "Live coprocessor probe",
        tone: "success",
        note: "The configured public coprocessor healthcheck responded successfully.",
        live: true
      };
    } else if (appConfig.coprocessor.healthcheckUrl) {
      coprocessor = {
        label: "Coprocessor probe unavailable",
        tone: "warning",
        note: "A live coprocessor probe is configured, but it is not responding from the public surface yet.",
        live: false
      };
    } else {
      coprocessor = {
        label: "External status reference",
        tone: "neutral",
        note: "A dedicated public healthcheck is not configured yet, so the UI links to the official CoFHE reference surface instead.",
        live: false
      };
    }

    startTransition(() => {
      setSnapshot({
        checkedAt: Date.now(),
        isRefreshing: false,
        walletBalanceLabel: balanceHex ? formatBalance(balanceHex) : null,
        walletValue: walletSnapshot.value,
        walletTone: walletSnapshot.tone,
        walletNote: walletSnapshot.note,
        registryLabel,
        registryTone,
        registryNote,
        contracts,
        avsLabel,
        avsTone,
        avsNote,
        coprocessor
      });
    });
  }, [
    wallet.account,
    wallet.hasProvider,
    wallet.isConnected,
    wallet.isSupportedNetwork
  ]);

  useEffect(() => {
    void runProbe();

    const intervalId = window.setInterval(() => {
      void runProbe();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [runProbe]);

  return useMemo(
    () => ({
      ...snapshot,
      contractCount: snapshot.contracts.length,
      verifiedContractCount: snapshot.contracts.filter((contract) => contract.bytecodeReady).length,
      explorerAddressHref(address: string) {
        return `${appConfig.chain.blockExplorerUrl}/address/${address}`;
      }
    }),
    [snapshot]
  );
}
