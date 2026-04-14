import "@nomicfoundation/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config({ path: ".env" });

const cncMainnetRpcUrl = process.env.CNC_MAINNET_RPC_URL || "https://rpc.cncchainpro.com";
const deployerAccounts = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
      viaIR: true,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    cncMainnet: {
      url: cncMainnetRpcUrl,
      accounts: deployerAccounts,
      chainId: 50716,
    },
  },
};

export default config;
