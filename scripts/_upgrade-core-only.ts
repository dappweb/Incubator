import { ethers, upgrades } from "hardhat";

function readAddressEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`${key} is not a valid address: ${value}`);
  }
  return value;
}

async function deployCoreLibraries() {
  const libraries: Record<string, string> = {};
  for (const name of ["LeaderboardLib", "NodePoolLib", "PoolSettleLib"] as const) {
    const factory = await ethers.getContractFactory(name);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    libraries[name] = await contract.getAddress();
    console.log(`  ✓ ${name}: ${libraries[name]}`);
  }
  return libraries;
}

async function main() {
  const proxyAddress = readAddressEnv("INCUBATOR_CORE_PROXY");
  const [signer] = await ethers.getSigners();

  console.log("Starting IncubatorCore-only upgrade...");
  console.log(`Signer: ${signer.address}`);
  console.log(`Proxy : ${proxyAddress}`);

  console.log("Deploying linked libraries...");
  const libraries = await deployCoreLibraries();

  console.log("Upgrading proxy implementation...");
  const factory = await ethers.getContractFactory("IncubatorCore", { libraries });
  const upgraded = await upgrades.upgradeProxy(proxyAddress, factory, {
    kind: "uups",
    unsafeAllow: ["constructor", "external-library-linking"],
  });
  await upgraded.waitForDeployment();

  const implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`✓ Upgraded IncubatorCore implementation: ${implementation}`);

  const core = await ethers.getContractAt("IncubatorCore", proxyAddress);

  console.log("Applying post-upgrade settlement configuration...");
  for (const pool of [2, 3, 5]) {
    const [recipient] = await core.getPoolConfig(pool);
    if (recipient.toLowerCase() !== proxyAddress.toLowerCase()) {
      const tx = await core.updatePoolRecipient(pool, proxyAddress);
      await tx.wait();
      console.log(`  ✓ pool ${pool} recipient -> core`);
    } else {
      console.log(`  - pool ${pool} recipient already set`);
    }
  }

  if (!(await core.roleListsBootstrapped())) {
    const tx = await core.bootstrapRoleLists();
    await tx.wait();
    console.log("  ✓ role lists bootstrapped");
  } else {
    console.log("  - role lists already bootstrapped");
  }

  const minPoolSettleAmount = await core.minPoolSettleAmount();
  if (minPoolSettleAmount !== 1_000_000n) {
    const tx = await core.setMinPoolSettleAmount(1_000_000n);
    await tx.wait();
    console.log("  ✓ minPoolSettleAmount set to 1 USDT");
  } else {
    console.log("  - minPoolSettleAmount already 1 USDT");
  }

  if (!(await core.publicSettleEnabled())) {
    const tx = await core.setPublicSettleEnabled(true);
    await tx.wait();
    console.log("  ✓ publicSettleEnabled = true");
  } else {
    console.log("  - publicSettleEnabled already true");
  }

  console.log("IncubatorCore-only upgrade completed.");
}

main().catch((error) => {
  console.error("IncubatorCore-only upgrade failed:", error);
  process.exitCode = 1;
});