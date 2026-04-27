import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import "solidity-coverage";

import type { HardhatUserConfig } from "hardhat/config";

const sharedAccounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];
const sepoliaUrl = process.env.SEPOLIA_RPC_URL || process.env.FHENIX_TESTNET_RPC_URL;

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
    ...(sepoliaUrl
      ? {
          sepolia: {
            url: sepoliaUrl,
            accounts: sharedAccounts
          },
          fhenixTestnet: {
            url: sepoliaUrl,
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
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  },
  mocha: {
    timeout: 40000
  }
};

export default config;
