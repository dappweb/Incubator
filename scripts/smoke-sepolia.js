const hre = require("hardhat");
const { ethers } = hre;

const coreAddress = process.env.VITE_CORE_CONTRACT_ADDRESS || "";
const otcAddress = process.env.VITE_OTC_CONTRACT_ADDRESS || "";
const swapAddress = process.env.VITE_SWAP_POOL_ADDRESS || "";
const usdtAddress = process.env.VITE_USDT_CONTRACT_ADDRESS || "";
const icoAddress = process.env.VITE_ICO_TOKEN_ADDRESS || "";
const lightAddress = process.env.VITE_LIGHT_TOKEN_ADDRESS || "";

function requireAddress(value, key) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`missing or invalid ${key}`);
  }
}

async function fundEth(sender, to, amountEth) {
  const tx = await sender.sendTransaction({
    to,
    value: ethers.parseEther(amountEth),
  });
  await tx.wait();
}

async function main() {
  requireAddress(coreAddress, "VITE_CORE_CONTRACT_ADDRESS");
  requireAddress(otcAddress, "VITE_OTC_CONTRACT_ADDRESS");
  requireAddress(swapAddress, "VITE_SWAP_POOL_ADDRESS");
  requireAddress(usdtAddress, "VITE_USDT_CONTRACT_ADDRESS");
  requireAddress(icoAddress, "VITE_ICO_TOKEN_ADDRESS");
  requireAddress(lightAddress, "VITE_LIGHT_TOKEN_ADDRESS");

  const [owner] = await ethers.getSigners();
  const provider = ethers.provider;

  const traderA = ethers.Wallet.createRandom().connect(provider);
  const traderB = ethers.Wallet.createRandom().connect(provider);

  console.log("Owner:", owner.address);
  console.log("TraderA:", traderA.address);
  console.log("TraderB:", traderB.address);

  await fundEth(owner, traderA.address, "0.03");
  await fundEth(owner, traderB.address, "0.03");

  const core = await ethers.getContractAt("IncubatorCore", coreAddress);
  const otc = await ethers.getContractAt("NodeOTCMarket", otcAddress);
  const swap = await ethers.getContractAt("SwapPoolManager", swapAddress);
  const usdt = await ethers.getContractAt("MockUSDT", usdtAddress);
  const ico = await ethers.getContractAt("IncubatorToken", icoAddress);
  const light = await ethers.getContractAt("MockToken", lightAddress);

  await (await usdt.mint(traderA.address, 8_000_000_000n)).wait();
  await (await usdt.mint(traderB.address, 8_000_000_000n)).wait();
  await (await light.mint(traderB.address, 4_000_000_000_000_000_000n)).wait();
  await (await ico.mint(owner.address, 1_000_000_000_000_000_000_000n)).wait();

  const pool0 = await swap.getPool(0);
  const pool1 = await swap.getPool(1);
  if (!pool0.exists || !pool1.exists || pool0.reserve0 === 0n || pool0.reserve1 === 0n || pool1.reserve0 === 0n || pool1.reserve1 === 0n) {
    throw new Error("swap pools are not initialized with liquidity");
  }

  await (await usdt.connect(traderA).approve(coreAddress, 2_000_000_000n)).wait();
  await (await core.connect(traderA).bindReferrer(owner.address)).wait();
  await (await core.connect(traderA).purchaseMachine(1)).wait();

  await (await core.connect(traderA).buyNode()).wait();
  const identityId = await core.getUserIdentityId(traderA.address);
  await (await core.connect(traderA).approveIdentityOperator(identityId, otcAddress, true)).wait();
  await (await otc.connect(traderA).createOrder(identityId, 2_000_000_000n)).wait();

  await (await usdt.connect(traderB).approve(otcAddress, 2_500_000_000n)).wait();
  const activeOrderIds = await otc.getActiveOrderIds();
  await (await otc.connect(traderB).fillOrder(activeOrderIds[0])).wait();

  await (await usdt.connect(traderB).approve(swapAddress, 1_000_000_000n)).wait();
  await (await light.connect(traderB).approve(swapAddress, 2_000_000_000_000_000_000n)).wait();

  const quote0 = await swap.quoteExactIn(0, usdtAddress, 100_000_000n);
  await (await swap.connect(traderB).swapExactIn(0, usdtAddress, 100_000_000n, quote0[0] - 1n, traderB.address)).wait();

  const quote1 = await swap.quoteExactIn(1, lightAddress, 1_000_000_000_000_000_000n);
  await (await swap.connect(traderB).swapExactIn(1, lightAddress, 1_000_000_000_000_000_000n, quote1[0] - 1n, traderB.address)).wait();

  await (await swap.settleLightFees()).wait();
  await (await ico.burnUnsold(10_000_000_000_000_000n)).wait();

  const roleA = await core.roles(traderA.address);
  const ownerOfIdentity = await core.ownerOfIdentity(identityId);
  const totalBurned = await ico.totalBurned();

  console.log("Core role traderA:", roleA.toString());
  console.log("Identity owner after OTC:", ownerOfIdentity);
  console.log("ICO totalBurned:", totalBurned.toString());
  console.log("Smoke test passed on Sepolia.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
