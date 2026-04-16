import { ethers } from "hardhat";

async function main() {
  const coreProxy = process.env.INCUBATOR_CORE_PROXY || process.env.VITE_CORE_CONTRACT_ADDRESS;
  const swapProxy = process.env.SWAP_POOL_MANAGER_PROXY || process.env.VITE_SWAP_POOL_ADDRESS;
  const lightAddress = process.env.LIGHT_TOKEN_ADDRESS || process.env.VITE_LIGHT_TOKEN_ADDRESS;

  if (!coreProxy || !swapProxy || !lightAddress) {
    throw new Error("Missing INCUBATOR_CORE_PROXY, SWAP_POOL_MANAGER_PROXY, or LIGHT_TOKEN_ADDRESS");
  }

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  // 1. initLightRewardConfig on IncubatorCore
  const core = await ethers.getContractAt(
    ["function initLightRewardConfig(address lightToken, address swapPoolManager) external",
     "function lightToken() view returns (address)",
     "function swapPoolManager() view returns (address)"],
    coreProxy, signer
  );

  const currentLight = await core.lightToken();
  if (currentLight === ethers.ZeroAddress) {
    console.log("Calling core.initLightRewardConfig(", lightAddress, ",", swapProxy, ")...");
    const tx1 = await core.initLightRewardConfig(lightAddress, swapProxy);
    console.log("TX:", tx1.hash);
    await tx1.wait();
    console.log("✓ initLightRewardConfig done");
  } else {
    console.log("lightToken already set:", currentLight, "- skipping initLightRewardConfig");
  }

  // Verify
  const verifyLight = await core.lightToken();
  const verifySwap = await core.swapPoolManager();
  console.log("core.lightToken():", verifyLight);
  console.log("core.swapPoolManager():", verifySwap);

  // 2. setRewardController on SwapPoolManager
  const swap = await ethers.getContractAt(
    ["function setRewardController(address controller) external",
     "function rewardController() view returns (address)"],
    swapProxy, signer
  );

  const currentController = await swap.rewardController();
  if (currentController === ethers.ZeroAddress) {
    console.log("Calling swap.setRewardController(", coreProxy, ")...");
    const tx2 = await swap.setRewardController(coreProxy);
    console.log("TX:", tx2.hash);
    await tx2.wait();
    console.log("✓ setRewardController done");
  } else {
    console.log("rewardController already set:", currentController, "- skipping");
  }

  // Verify
  const verifyController = await swap.rewardController();
  console.log("swap.rewardController():", verifyController);

  console.log("\n✅ LIGHT reward system initialized!");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
