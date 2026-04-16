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

  // --- Set Node pool and Leaderboard pool to self-custody for settlement test ---
  const coreAddr = await core.getAddress ? await core.getAddress() : coreAddress;
  console.log("Setting node pool & leaderboard pool to self-custody...");
  await (await core.connect(owner).updatePoolRecipient(3, coreAddr)).wait(); // Node pool
  await (await core.connect(owner).updatePoolRecipient(5, coreAddr)).wait(); // Leaderboard pool

  // Capture baselines BEFORE purchase (state may carry over from previous test runs)
  const nodeAccumBefore = await core.poolAccumulated(3);
  const lbAccumBefore   = await core.poolAccumulated(5);
  console.log("Pool baselines — node:", nodeAccumBefore.toString(), "leaderboard:", lbAccumBefore.toString());

  await (await usdt.connect(traderA).approve(coreAddress, 2_000_000_000n)).wait();
  // bindReferrer may already be bound from a previous run — ignore revert
  try { await (await core.connect(traderA).bindReferrer(owner.address)).wait(); } catch (_) {}
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

  // --- Settlement function tests (Phase 1 new functions) ---
  console.log("\n--- Settlement Tests ---");

  // Verify INCREMENT since baseline (8% of 100 USDT = 8 USDT = 8_000_000)
  const nodeAccumNow = await core.poolAccumulated(3);
  const lbAccumNow   = await core.poolAccumulated(5);
  const nodeIncr = nodeAccumNow - nodeAccumBefore;
  const lbIncr   = lbAccumNow   - lbAccumBefore;
  console.log("Node pool delta:", nodeIncr.toString(), "(expect 8_000_000)");
  console.log("Leaderboard pool delta:", lbIncr.toString(), "(expect 2_000_000)");
  if (nodeIncr !== 8_000_000n) throw new Error(`Node pool increment mismatch: ${nodeIncr}`);
  if (lbIncr   !== 2_000_000n) throw new Error(`Leaderboard pool increment mismatch: ${lbIncr}`);

  // Helper: poll with retries for state reads over public RPC.
  async function pollZero(readFn, label, maxRetries = 15) {
    for (let i = 0; i < maxRetries; i++) {
      const val = await readFn();
      if (val === 0n) return;
      console.log("  ", label, "still", val.toString(), "— retry", i + 1);
      await new Promise(r => setTimeout(r, 2000));
    }
    const final = await readFn();
    if (final !== 0n) throw new Error(label + " not cleared to 0 after " + maxRetries + " retries");
  }

  // settleNodeRewards: 100% to owner — verify accumulated clears to 0
  const settleNodeTx = await core.connect(owner).settleNodeRewards([owner.address], [10000]);
  await settleNodeTx.wait();
  await pollZero(() => core.poolAccumulated(3), "Node pool");
  console.log("✓ settleNodeRewards — accumulated drained to 0");

  // settleLeaderboard: verify accumulated clears
  const dayId = await core.currentDay();
  const lbTotal = lbAccumNow;
  const settleLeaderTx = await core.connect(owner).settleLeaderboard(dayId);
  await settleLeaderTx.wait();
  await pollZero(() => core.poolAccumulated(5), "Leaderboard pool");
  console.log("✓ settleLeaderboard — distributed", lbTotal.toString(), "USDT units");

  const roleA = await core.roles(traderA.address);
  const ownerOfIdentity = await core.ownerOfIdentity(identityId);
  const totalBurned = await ico.totalBurned();

  console.log("Core role traderA:", roleA.toString());
  console.log("Identity owner after OTC:", ownerOfIdentity);
  console.log("ICO totalBurned:", totalBurned.toString());
  console.log("Smoke test passed on CNC Mainnet.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
