const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const defaultContracts = {
  avsAddress: "0x6375c4Ba25582b56e2D9A6037B5C156293f9381E",
  marketProxyAddress: "0xfB94EF623956301B89aa8546244A0F1839Dd390A",
  settlementEngineAddress: "0x77b0988469db94422B9439ab1e702b75Ed4683B5",
  slashedPotAddress: "0x59c0F68E387639BeA0d011D89F627Fdc1B46A236"
} as const;

function readEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : "";
}

export function isAddressLike(value: string) {
  return addressPattern.test(value);
}

export const appConfig = {
  name: readEnv("NEXT_PUBLIC_APP_NAME") || "Fhenix-FairMarket",
  chain: {
    id: Number(readEnv("NEXT_PUBLIC_CHAIN_ID") || "11155111"),
    hexId: "0xaa36a7",
    name: readEnv("NEXT_PUBLIC_CHAIN_NAME") || "Sepolia",
    rpcUrl: readEnv("NEXT_PUBLIC_SEPOLIA_RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com",
    blockExplorerUrl: readEnv("NEXT_PUBLIC_BLOCK_EXPLORER_URL") || "https://sepolia.etherscan.io"
  },
  contracts: {
    marketProxyAddress: readEnv("NEXT_PUBLIC_MARKET_PROXY_ADDRESS") || defaultContracts.marketProxyAddress,
    settlementEngineAddress: readEnv("NEXT_PUBLIC_SETTLEMENT_ENGINE_ADDRESS") || defaultContracts.settlementEngineAddress,
    slashedPotAddress: readEnv("NEXT_PUBLIC_SLASHED_POT_ADDRESS") || defaultContracts.slashedPotAddress,
    avsAddress: readEnv("NEXT_PUBLIC_AVS_ADDRESS") || defaultContracts.avsAddress,
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
  { href: "/", label: "Overview", priority: "primary" },
  { href: "/marketplace", label: "Marketplace", priority: "primary" },
  { href: "/portfolio", label: "Portfolio", priority: "primary" },
  { href: "/governance", label: "Governance", priority: "secondary" },
  { href: "/about", label: "About", priority: "secondary" }
] as const;

export function formatAddress(value: string | null | undefined) {
  if (!value) {
    return "Disconnected";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
