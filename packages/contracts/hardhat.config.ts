import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import "solidity-coverage";

import type { HardhatUserConfig } from "hardhat/config";

const sharedAccounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.25",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    localhost: {
      url: process.env.RPC_URL || "http://127.0.0.1:8545",
      accounts: sharedAccounts
    },
    ...(process.env.FHENIX_TESTNET_RPC_URL
      ? {
          fhenixTestnet: {
            url: process.env.FHENIX_TESTNET_RPC_URL,
            accounts: sharedAccounts
          }
        }
      : {})
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD"
  },
  mocha: {
    timeout: 40000
  }
};

export default config;
