import { ethers } from "hardhat";

function readEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  throw new Error(`Missing required env. Tried: ${keys.join(", ")}`);
}

async function main() {
  const coreProxy = readEnv("INCUBATOR_CORE_PROXY", "VITE_CORE_CONTRACT_ADDRESS");
  if (!ethers.isAddress(coreProxy)) {
    throw new Error(`Invalid core proxy address: ${coreProxy}`);
  }

  const [signer] = await ethers.getSigners();
  console.log(`Signer(owner expected): ${signer.address}`);
  console.log(`Core proxy: ${coreProxy}`);

  const core = await ethers.getContractAt("IncubatorCore", coreProxy, signer);
  const owner = await core.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer is not owner. owner=${owner}, signer=${signer.address}`);
  }

  const leaderboardPoolType = 5;
  const [currentRecipient, currentBps] = await core.getPoolConfig(leaderboardPoolType);
  console.log(`Current leaderboard recipient: ${currentRecipient}`);
  console.log(`Current leaderboard bps: ${currentBps}`);

  if (currentRecipient.toLowerCase() === coreProxy.toLowerCase()) {
    console.log("Leaderboard recipient already points to core. Nothing to do.");
    return;
  }

  const tx = await core.updatePoolRecipient(leaderboardPoolType, coreProxy);
  console.log(`tx submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`tx confirmed in block: ${receipt?.blockNumber}`);

  const [updatedRecipient] = await core.getPoolConfig(leaderboardPoolType);
  console.log(`Updated leaderboard recipient: ${updatedRecipient}`);

  if (updatedRecipient.toLowerCase() !== coreProxy.toLowerCase()) {
    throw new Error("Leaderboard recipient update verification failed");
  }

  console.log("Leaderboard recipient is now routed to core self-custody.");
}

main().catch((error) => {
  console.error("Failed to route leaderboard pool to core:", error);
  process.exitCode = 1;
});