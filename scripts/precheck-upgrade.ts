import { ethers, upgrades } from "hardhat";

type UpgradeTarget = {
  label: string;
  envKey: string;
};

type CheckResult = {
  label: string;
  envKey: string;
  proxy: string;
  implementation: string;
  owner: string | null;
  ownerMatchesDeployer: boolean | null;
};

function parseProxyAddress(envKey: string): string | null {
  const value = process.env[envKey]?.trim();
  if (!value || value === "0x") {
    return null;
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`${envKey} is not a valid address: ${value}`);
  }
  return value;
}

async function readOwner(address: string): Promise<string | null> {
  try {
    const contract = await ethers.getContractAt(
      ["function owner() view returns (address)"],
      address,
    );
    const owner = await contract.owner();
    return owner;
  } catch {
    return null;
  }
}

async function main() {
  console.log("Starting upgrade precheck...");

  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();

  console.log(`Network: ${network.name} (chainId=${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const targets: UpgradeTarget[] = [
    { label: "IncubatorCore", envKey: "INCUBATOR_CORE_PROXY" },
    { label: "NodeOTCMarket", envKey: "NODE_OTC_MARKET_PROXY" },
    { label: "SwapPoolManager", envKey: "SWAP_POOL_MANAGER_PROXY" },
    { label: "IdentityNFT", envKey: "IDENTITY_NFT_PROXY" },
  ];

  const results: CheckResult[] = [];
  const warnings: string[] = [];

  for (const target of targets) {
    const proxy = parseProxyAddress(target.envKey);
    if (!proxy) {
      warnings.push(`${target.label}: ${target.envKey} not configured`);
      continue;
    }

    const proxyCode = await ethers.provider.getCode(proxy);
    if (!proxyCode || proxyCode === "0x") {
      throw new Error(`${target.label}: proxy address has no contract code (${proxy})`);
    }

    let implementation: string;
    try {
      implementation = await upgrades.erc1967.getImplementationAddress(proxy);
    } catch (error) {
      throw new Error(
        `${target.label}: failed to resolve ERC1967 implementation for proxy ${proxy}. ` +
          `Make sure this is a UUPS/ERC1967 proxy.`,
      );
    }

    const implementationCode = await ethers.provider.getCode(implementation);
    if (!implementationCode || implementationCode === "0x") {
      throw new Error(
        `${target.label}: implementation address has no contract code (${implementation})`,
      );
    }

    const owner = await readOwner(proxy);
    const ownerMatchesDeployer = owner
      ? owner.toLowerCase() === deployer.address.toLowerCase()
      : null;

    if (owner && !ownerMatchesDeployer) {
      warnings.push(
        `${target.label}: deployer is not owner (owner=${owner}, deployer=${deployer.address})`,
      );
    }

    results.push({
      label: target.label,
      envKey: target.envKey,
      proxy,
      implementation,
      owner,
      ownerMatchesDeployer,
    });
  }

  console.log("\nPrecheck Summary:");
  if (results.length === 0) {
    console.log("- No proxies configured. Nothing to validate.");
  } else {
    for (const item of results) {
      console.log(`- ${item.label}`);
      console.log(`  env key         : ${item.envKey}`);
      console.log(`  proxy           : ${item.proxy}`);
      console.log(`  implementation  : ${item.implementation}`);
      if (item.owner) {
        console.log(`  owner           : ${item.owner}`);
        console.log(
          `  owner match     : ${item.ownerMatchesDeployer ? "yes" : "no"}`,
        );
      } else {
        console.log("  owner           : not readable");
      }
    }
  }

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("\n✅ Upgrade precheck finished.");
}

main().catch((error) => {
  console.error("❌ Upgrade precheck failed:", error);
  process.exitCode = 1;
});
