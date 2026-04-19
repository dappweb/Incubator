import { ethers } from "hardhat";

async function main() {
  const lightAddr = process.env.LIGHT_TOKEN_ADDRESS;
  const swapAddr = process.env.SWAP_POOL_MANAGER_PROXY;
  if (!lightAddr || !swapAddr) {
    throw new Error("LIGHT_TOKEN_ADDRESS or SWAP_POOL_MANAGER_PROXY missing");
  }
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const Vault = await ethers.getContractFactory("LightRewardVault");
  const vault = await Vault.deploy(lightAddr, await deployer.getAddress());
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("LightRewardVault:", vaultAddr);

  const opTx = await vault.setOperator(await deployer.getAddress());
  await opTx.wait();
  console.log("Operator set to deployer");

  const swap = await ethers.getContractAt("SwapPoolManager", swapAddr);
  const tx = await swap.setLightRewardTreasury(vaultAddr);
  await tx.wait();
  console.log("SwapPoolManager.lightRewardTreasury ->", vaultAddr);
  console.log("\nAdd to .env:");
  console.log(`VITE_LIGHT_REWARD_VAULT_ADDRESS=${vaultAddr}`);
  console.log(`LIGHT_REWARD_VAULT=${vaultAddr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
