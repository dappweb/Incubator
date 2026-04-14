/**
 * init-swap-pools.ts
 * ---
 * 1. 检查两个 Swap 池是否已创建（如未创建则调用 createDefaultPools）
 * 2. 检查 deployer 是否有足够的 USDT / ICO / LIGHT；仅在代币支持时尝试 mint
 * 3. approve → addLiquidity，为两个池注入初始流动性
 *
 * 用法：
 *   npx hardhat run scripts/init-swap-pools.ts --network cncMainnet
 */

import { ethers } from "hardhat";

const USDT_DECIMALS = Number(process.env.VITE_USDT_DECIMALS || "18");

/* ─── 配置 ─── */
const SWAP_ADDRESS = process.env.VITE_SWAP_POOL_ADDRESS!;
const USDT_ADDRESS = process.env.VITE_USDT_CONTRACT_ADDRESS!;
const ICO_ADDRESS  = process.env.VITE_ICO_TOKEN_ADDRESS!;
const LIGHT_ADDRESS = process.env.VITE_LIGHT_TOKEN_ADDRESS!;

// Pool 0: USDT/ICO  — 10 000 USDT : 100 000 ICO  →  1 ICO ≈ 0.1 USDT
const USDT_LIQ = process.env.SWAP_USDT_ICO_USDT_LIQ || ethers.parseUnits("10000", USDT_DECIMALS).toString();
const ICO_LIQ_0 = process.env.SWAP_USDT_ICO_ICO_LIQ || ethers.parseUnits("100000", 18).toString();

// Pool 1: LIGHT/ICO — 200 000 LIGHT : 100 000 ICO  →  1 LIGHT ≈ 0.5 ICO
const LIGHT_LIQ = process.env.SWAP_LIGHT_ICO_LIGHT_LIQ || ethers.parseUnits("200000", 18).toString();
const ICO_LIQ_1 = process.env.SWAP_LIGHT_ICO_ICO_LIQ || ethers.parseUnits("100000", 18).toString();

// createDefaultPools 参数（仅在池子尚未创建时使用）
const FEE_USDT_ICO  = 50;   // 0.5 %
const FEE_LIGHT_ICO = 200;  // 2 %
const MAX_IMPACT    = 3000;  // 30 %

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
  "function owner() view returns (address)",
];

async function tryMint(token: any, deployerAddress: string, amount: bigint, symbol: string) {
  try {
    const owner = await token.owner();
    if (String(owner).toLowerCase() !== deployerAddress.toLowerCase()) {
      return false;
    }

    await (await token.mint(deployerAddress, amount)).wait();
    console.log(`Mint ${symbol} to deployer:`, amount.toString());
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer :", deployer.address);
  console.log("Swap     :", SWAP_ADDRESS);
  console.log("USDT     :", USDT_ADDRESS);
  console.log("ICO      :", ICO_ADDRESS);
  console.log("LIGHT    :", LIGHT_ADDRESS);
  console.log("─".repeat(60));

  /* ─── 获取合约实例 ─── */
  const swap = await ethers.getContractAt("SwapPoolManager", SWAP_ADDRESS);
  const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, deployer);
  const ico = new ethers.Contract(ICO_ADDRESS, ERC20_ABI, deployer);
  const light = new ethers.Contract(LIGHT_ADDRESS, ERC20_ABI, deployer);

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
      const minted = await tryMint(usdt, deployer.address, deficit, "USDT");
      if (!minted) {
        throw new Error("USDT 余额不足，且当前 CNC USDT 不支持由部署钱包 mint，请先手动准备流动性。");
      }
    }
  }

  const icoBal = await ico.balanceOf(deployer.address);
  if (icoBal < totalIcoNeeded) {
    const deficit = totalIcoNeeded - icoBal;
    const minted = await tryMint(ico, deployer.address, deficit, "ICO");
    if (!minted) {
      throw new Error("ICO 余额不足，且当前 ICO 合约不支持由部署钱包 mint。");
    }
  }

  if (needLiq1) {
    const lightBal = await light.balanceOf(deployer.address);
    if (lightBal < BigInt(LIGHT_LIQ)) {
      const deficit = BigInt(LIGHT_LIQ) - lightBal;
      const minted = await tryMint(light, deployer.address, deficit, "LIGHT");
      if (!minted) {
        throw new Error("LIGHT 余额不足，且当前 LIGHT 合约不支持由部署钱包 mint。");
      }
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
