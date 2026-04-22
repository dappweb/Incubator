import "@nomicfoundation/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config({ path: ".env" });

const cncMainnetRpcUrl = process.env.CNC_MAINNET_RPC_URL || "https://rpc.cncchainpro.com";
const optimizerRuns = Number(process.env.SOLC_OPTIMIZER_RUNS ?? "0");
const viaIREnabled = process.env.SOLC_VIA_IR !== "false";
const deployerAccounts = process.env.DEPLOYER_PRIVATE_KEY
  ? [process.env.DEPLOYER_PRIVATE_KEY]
  : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: Number.isFinite(optimizerRuns) ? optimizerRuns : 0,
      },
      evmVersion: "paris",
      viaIR: viaIREnabled,
      metadata: {
        bytecodeHash: "none",
        appendCBOR: false,
      },
      debug: {
        revertStrings: "strip",
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    reporter: process.env.MOCHA_REPORTER || "spec",
    reporterOptions: {
      reportDir: "reports",
      reportFilename: "test-report",
      reportTitle: "Incubator 合约测试报告",
      reportPageTitle: "Test Results",
      charts: true,
      embeddedScreenshots: true,
      inlineAssets: true,
      quiet: false,
    },
    timeout: 120000,
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    cncMainnet: {
      url: cncMainnetRpcUrl,
      accounts: deployerAccounts,
      chainId: 50716,
    },
  },
};

export default config;
