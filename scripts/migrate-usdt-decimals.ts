import { ethers } from "hardhat";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

async function main() {
  const coreProxy = requireEnv("INCUBATOR_CORE_PROXY");
  if (!ethers.isAddress(coreProxy)) {
    throw new Error(`INCUBATOR_CORE_PROXY is not a valid address: ${coreProxy}`);
  }

  const oldDecimalsRaw = process.env.OLD_USDT_DECIMALS?.trim() || "6";
  const oldDecimals = Number(oldDecimalsRaw);
  if (!Number.isInteger(oldDecimals) || oldDecimals < 0 || oldDecimals > 77) {
    throw new Error(`OLD_USDT_DECIMALS is invalid: ${oldDecimalsRaw}`);
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Migrating IncubatorCore price scale with account: ${deployer.address}`);
  console.log(`Core proxy: ${coreProxy}`);

  const core = await ethers.getContractAt("IncubatorCore", coreProxy);

  const tokenDecimals = await core.usdtTokenDecimals();
  const alreadyMigrated = await core.usdtScaleMigrated();
  console.log(`Current usdtTokenDecimals: ${tokenDecimals}`);
  console.log(`Current usdtScaleMigrated: ${alreadyMigrated}`);

  if (alreadyMigrated) {
    console.log("Migration already completed. Skipping.");
    return;
  }

  const tx = await core.migratePriceScaleToTokenDecimals(oldDecimals);
  console.log(`Submitted tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block: ${receipt?.blockNumber}`);

  const [machine, node, superNode, newTokenDecimals, migratedFlag] = await Promise.all([
    core.machineUnitPrice(),
    core.nodePrice(),
    core.superNodePrice(),
    core.usdtTokenDecimals(),
    core.usdtScaleMigrated(),
  ]);

  console.log("Migration finished.");
  console.log(`usdtTokenDecimals: ${newTokenDecimals}`);
  console.log(`usdtScaleMigrated: ${migratedFlag}`);
  console.log(`machineUnitPrice(raw): ${machine}`);
  console.log(`nodePrice(raw): ${node}`);
  console.log(`superNodePrice(raw): ${superNode}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
