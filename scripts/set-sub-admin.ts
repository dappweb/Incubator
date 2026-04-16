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

  const target = process.env.SUB_ADMIN_ADDRESS?.trim() ?? "";
  if (!target || !ethers.isAddress(target)) {
    throw new Error(
      "Please provide sub-admin address via SUB_ADMIN_ADDRESS env",
    );
  }

  const enableInput = (process.env.SUB_ADMIN_ENABLE ?? "true").trim().toLowerCase();
  const enable = enableInput !== "false";

  const [signer] = await ethers.getSigners();
  console.log(`Signer(owner expected): ${signer.address}`);
  console.log(`Core proxy: ${coreProxy}`);
  console.log(`Target sub-admin: ${target}`);
  console.log(`Action: ${enable ? "enable" : "disable"}`);

  const core = await ethers.getContractAt("IncubatorCore", coreProxy, signer);

  const owner = await core.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer is not owner. owner=${owner}, signer=${signer.address}`);
  }

  const tx = await core.setSubAdmin(target, enable);
  console.log(`tx submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`tx confirmed in block: ${receipt?.blockNumber}`);

  const isSubAdmin = await core.subAdmins(target);
  const list = await core.getSubAdmins();
  console.log(`subAdmins[target]: ${isSubAdmin}`);
  console.log(`subAdmin count: ${list.length}`);
}

main().catch((error) => {
  console.error("Failed to set sub-admin:", error);
  process.exitCode = 1;
});
