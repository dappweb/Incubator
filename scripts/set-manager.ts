import { ethers } from "hardhat";

function readEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

async function main() {
  const coreProxy = readEnv("INCUBATOR_CORE_PROXY");
  if (!ethers.isAddress(coreProxy)) {
    throw new Error(`INCUBATOR_CORE_PROXY is not a valid address: ${coreProxy}`);
  }

  const target = process.env.MANAGER_ADDRESS?.trim() ?? "";
  if (!target || !ethers.isAddress(target)) {
    throw new Error(
      "Please provide manager address via MANAGER_ADDRESS env",
    );
  }

  const enableInput = (process.env.MANAGER_ENABLE ?? "true").trim().toLowerCase();
  const enable = enableInput !== "false";

  const [signer] = await ethers.getSigners();
  console.log(`Signer(owner or sub-admin expected): ${signer.address}`);
  console.log(`Core proxy: ${coreProxy}`);
  console.log(`Target manager: ${target}`);
  console.log(`Action: ${enable ? "enable" : "disable"}`);

  const core = await ethers.getContractAt("IncubatorCore", coreProxy, signer);

  const hasPermission = Boolean(await core.isOwnerOrSubAdmin(signer.address));
  if (!hasPermission) {
    throw new Error(`Signer is not owner/sub-admin. signer=${signer.address}`);
  }

  const tx = await core.setManager(target, enable);
  console.log(`tx submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`tx confirmed in block: ${receipt?.blockNumber}`);

  const roleGranted = Boolean(await core.isOwnerOrSubAdmin(target));
  console.log(`isOwnerOrSubAdmin[target]: ${roleGranted}`);
}

main().catch((error) => {
  console.error("Failed to set manager:", error);
  process.exitCode = 1;
});
