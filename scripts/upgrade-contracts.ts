import { ethers, upgrades } from "hardhat";

type UpgradeTarget = {
  label: string;
  envKey: string;
  contractName: "IncubatorCore" | "NodeOTCMarket" | "SwapPoolManager" | "IdentityNFT";
};

function resolveProxyAddress(envKey: string): string | null {
  const value = process.env[envKey]?.trim();
  if (!value || value === "0x") {
    return null;
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`${envKey} is not a valid address: ${value}`);
  }
  return value;
}

async function main() {
  console.log("Starting contract upgrade...");

  const [deployer] = await ethers.getSigners();
  console.log(`Upgrading with account: ${deployer.address}`);

  const targets: UpgradeTarget[] = [
    { label: "IncubatorCore", envKey: "INCUBATOR_CORE_PROXY", contractName: "IncubatorCore" },
    { label: "NodeOTCMarket", envKey: "NODE_OTC_MARKET_PROXY", contractName: "NodeOTCMarket" },
    { label: "SwapPoolManager", envKey: "SWAP_POOL_MANAGER_PROXY", contractName: "SwapPoolManager" },
    { label: "IdentityNFT", envKey: "IDENTITY_NFT_PROXY", contractName: "IdentityNFT" },
  ];

  try {
    const summary: Array<{ label: string; proxy: string; implementation: string }> = [];

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const proxyAddress = resolveProxyAddress(target.envKey);
      if (!proxyAddress) {
        console.log(`- Skipping ${target.label}: ${target.envKey} not configured`);
        continue;
      }

      console.log(`\n${index + 1}. Upgrading ${target.label}...`);
      const factory = await ethers.getContractFactory(target.contractName);
      const upgraded = await upgrades.upgradeProxy(proxyAddress, factory, { kind: "uups" });
      await upgraded.waitForDeployment();
      const implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
      summary.push({ label: target.label, proxy: proxyAddress, implementation });
      console.log(`✓ ${target.label} upgraded`);
      console.log(`  Proxy: ${proxyAddress}`);
      console.log(`  Impl : ${implementation}`);
    }

    if (summary.length === 0) {
      console.log("\n⚠ No proxy addresses configured. Nothing upgraded.");
      return;
    }

    console.log("\n✅ Upgrade completed!");
    console.log("\nUpgrade Summary:");
    for (const item of summary) {
      console.log(`- ${item.label} proxy: ${item.proxy}`);
      console.log(`  implementation: ${item.implementation}`);
    }
  } catch (error) {
    console.error("❌ Upgrade failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
