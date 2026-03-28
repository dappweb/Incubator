/**
 * init-swap-pools.ts
 * ---
 * 1. 检查两个 Swap 池是否已创建（如未创建则调用 createDefaultPools）
 * 2. 给 deployer mint 足够的 USDT / ICO / LIGHT（MockToken 均支持 owner mint）
 * 3. approve → addLiquidity，为两个池注入初始流动性
 *
 * 用法：
 *   npx hardhat run scripts/init-swap-pools.ts --network sepolia
 */

import { ethers } from "hardhat";

/* ─── 配置 ─── */
const SWAP_ADDRESS = process.env.VITE_SWAP_POOL_ADDRESS!;
const USDT_ADDRESS = process.env.VITE_USDT_CONTRACT_ADDRESS!;
const ICO_ADDRESS  = process.env.VITE_ICO_TOKEN_ADDRESS!;
const LIGHT_ADDRESS = process.env.VITE_LIGHT_TOKEN_ADDRESS!;

// Pool 0: USDT/ICO  — 10 000 USDT : 100 000 ICO  →  1 ICO ≈ 0.1 USDT
const USDT_LIQ  = process.env.SWAP_USDT_ICO_USDT_LIQ  || "10000000000";                // 10 000 × 10^6
const ICO_LIQ_0 = process.env.SWAP_USDT_ICO_ICO_LIQ   || "100000000000000000000000";    // 100 000 × 10^18

// Pool 1: LIGHT/ICO — 200 000 LIGHT : 100 000 ICO  →  1 LIGHT ≈ 0.5 ICO
const LIGHT_LIQ   = process.env.SWAP_LIGHT_ICO_LIGHT_LIQ || "200000000000000000000000";  // 200 000 × 10^18
const ICO_LIQ_1   = process.env.SWAP_LIGHT_ICO_ICO_LIQ   || "100000000000000000000000";  // 100 000 × 10^18

// createDefaultPools 参数（仅在池子尚未创建时使用）
const FEE_USDT_ICO  = 50;   // 0.5 %
const FEE_LIGHT_ICO = 200;  // 2 %
const MAX_IMPACT    = 3000;  // 30 %

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer :", deployer.address);
  console.log("Swap     :", SWAP_ADDRESS);
  console.log("USDT     :", USDT_ADDRESS);
  console.log("ICO      :", ICO_ADDRESS);
  console.log("LIGHT    :", LIGHT_ADDRESS);
  console.log("─".repeat(60));

  /* ─── 获取合约实例 ─── */
  const swap  = await ethers.getContractAt("SwapPoolManager", SWAP_ADDRESS);
  const usdt  = await ethers.getContractAt("MockUSDT", USDT_ADDRESS);
  const ico   = await ethers.getContractAt("MockToken", ICO_ADDRESS);
  const light = await ethers.getContractAt("MockToken", LIGHT_ADDRESS);

  /* ─── Step 1 : 检查 / 创建池子 ─── */
  const pool0 = await swap.getPool(0);
  const pool1 = await swap.getPool(1);

  if (!pool0.exists) {
    console.log("Pool 0 不存在，正在创建两个默认池子...");
    const tx = await swap.createDefaultPools(FEE_USDT_ICO, FEE_LIGHT_ICO, MAX_IMPACT);
    await tx.wait();
    console.log("✔ createDefaultPools tx:", tx.hash);
  } else {
    console.log("✔ Pool 0 (USDT/ICO)  已存在  reserve0=%s  reserve1=%s", pool0.reserve0.toString(), pool0.reserve1.toString());
    console.log("✔ Pool 1 (LIGHT/ICO) 已存在  reserve0=%s  reserve1=%s", pool1.reserve0.toString(), pool1.reserve1.toString());
  }

  /* 重新读取，判断是否已有流动性 */
  const fresh0 = await swap.getPool(0);
  const fresh1 = await swap.getPool(1);

  const needLiq0 = fresh0.reserve0 === 0n || fresh0.reserve1 === 0n;
  const needLiq1 = fresh1.reserve0 === 0n || fresh1.reserve1 === 0n;

  if (!needLiq0 && !needLiq1) {
    console.log("两个池子均已有流动性，无需操作。");
    return;
  }

  /* ─── Step 2 : 确保 deployer 有足够代币 ─── */
  const totalIcoNeeded = (needLiq0 ? BigInt(ICO_LIQ_0) : 0n) + (needLiq1 ? BigInt(ICO_LIQ_1) : 0n);

  if (needLiq0) {
    const usdtBal = await usdt.balanceOf(deployer.address);
    if (usdtBal < BigInt(USDT_LIQ)) {
      const deficit = BigInt(USDT_LIQ) - usdtBal;
      console.log("Mint USDT to deployer:", deficit.toString());
      await (await usdt.mint(deployer.address, deficit)).wait();
    }
  }

  const icoBal = await ico.balanceOf(deployer.address);
  if (icoBal < totalIcoNeeded) {
    const deficit = totalIcoNeeded - icoBal;
    console.log("Mint ICO to deployer:", deficit.toString());
    await (await ico.mint(deployer.address, deficit)).wait();
  }

  if (needLiq1) {
    const lightBal = await light.balanceOf(deployer.address);
    if (lightBal < BigInt(LIGHT_LIQ)) {
      const deficit = BigInt(LIGHT_LIQ) - lightBal;
      console.log("Mint LIGHT to deployer:", deficit.toString());
      await (await light.mint(deployer.address, deficit)).wait();
    }
  }

  /* ─── Step 3 : Approve ─── */
  const swapAddr = await swap.getAddress();
  console.log("Approving tokens to SwapPoolManager...");

  if (needLiq0) {
    await (await usdt.approve(swapAddr, USDT_LIQ)).wait();
    console.log("  ✔ USDT approved:", USDT_LIQ);
  }

  if (totalIcoNeeded > 0n) {
    await (await ico.approve(swapAddr, totalIcoNeeded)).wait();
    console.log("  ✔ ICO approved:", totalIcoNeeded.toString());
  }

  if (needLiq1) {
    await (await light.approve(swapAddr, LIGHT_LIQ)).wait();
    console.log("  ✔ LIGHT approved:", LIGHT_LIQ);
  }

  /* ─── Step 4 : 注入流动性 ─── */
  if (needLiq0) {
    console.log("添加 Pool 0 (USDT/ICO) 流动性...");
    const tx0 = await swap.addLiquidity(0, USDT_LIQ, ICO_LIQ_0);
    await tx0.wait();
    console.log("  ✔ Pool 0 tx:", tx0.hash);
  }

  if (needLiq1) {
    console.log("添加 Pool 1 (LIGHT/ICO) 流动性...");
    const tx1 = await swap.addLiquidity(1, LIGHT_LIQ, ICO_LIQ_1);
    await tx1.wait();
    console.log("  ✔ Pool 1 tx:", tx1.hash);
  }

  /* ─── 验证 ─── */
  const final0 = await swap.getPool(0);
  const final1 = await swap.getPool(1);
  console.log("─".repeat(60));
  console.log("Pool 0 (USDT/ICO)  => reserve0=%s  reserve1=%s  fee=%sbps", final0.reserve0.toString(), final0.reserve1.toString(), final0.feeBps.toString());
  console.log("Pool 1 (LIGHT/ICO) => reserve0=%s  reserve1=%s  fee=%sbps", final1.reserve0.toString(), final1.reserve1.toString(), final1.feeBps.toString());
  console.log("✅ 初始化完成！");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
