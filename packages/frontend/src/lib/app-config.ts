const addressPattern = /^0x[a-fA-F0-9]{40}$/;

function readEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : "";
}

function isAddressLike(value: string) {
  return addressPattern.test(value);
}

export const appConfig = {
  name: readEnv("NEXT_PUBLIC_APP_NAME") || "Fhenix-FairMarket",
  chain: {
    id: Number(readEnv("NEXT_PUBLIC_CHAIN_ID") || "11155111"),
    hexId: "0xaa36a7",
    name: readEnv("NEXT_PUBLIC_CHAIN_NAME") || "Sepolia",
    rpcUrl: readEnv("NEXT_PUBLIC_SEPOLIA_RPC_URL") || "https://rpc.sepolia.org",
    blockExplorerUrl: readEnv("NEXT_PUBLIC_BLOCK_EXPLORER_URL") || "https://sepolia.etherscan.io"
  },
  contracts: {
    marketProxyAddress: readEnv("NEXT_PUBLIC_MARKET_PROXY_ADDRESS"),
    settlementEngineAddress: readEnv("NEXT_PUBLIC_SETTLEMENT_ENGINE_ADDRESS"),
    slashedPotAddress: readEnv("NEXT_PUBLIC_SLASHED_POT_ADDRESS"),
    avsAddress: readEnv("NEXT_PUBLIC_AVS_ADDRESS"),
    get ready() {
      return (
        isAddressLike(this.marketProxyAddress) &&
        isAddressLike(this.settlementEngineAddress) &&
        isAddressLike(this.slashedPotAddress) &&
        isAddressLike(this.avsAddress)
      );
    }
  },
  coprocessor: {
    name: readEnv("NEXT_PUBLIC_COPROCESSOR_NAME") || "Fhenix Nitrogen CoFHE",
    referenceUrl:
      readEnv("NEXT_PUBLIC_COPROCESSOR_STATUS_URL") ||
      "https://cofhe-docs.fhenix.zone/get-started/introduction/compatibility",
    healthcheckUrl: readEnv("NEXT_PUBLIC_COPROCESSOR_HEALTHCHECK_URL"),
    mode: readEnv("NEXT_PUBLIC_COPROCESSOR_MODE") || "reference"
  }
} as const;

export const appRoutes = [
  { href: "/", label: "Overview" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/governance", label: "Governance" },
  { href: "/about", label: "About" }
] as const;

export function formatAddress(value: string | null | undefined) {
  if (!value) {
    return "Disconnected";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
