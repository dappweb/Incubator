/**
 * scripts/fund-and-test-rewards.ts
 *
 * 一键：
 *   1. 查询 deployer LIGHT 余额
 *   2. 若 BPS 全为 0，调用 updateRewardConfig 写入默认值
 *   3. Approve LIGHT → Core
 *   4. fundRewardPool 注入 LIGHT
 *   5. settleDailyRewardsManual 触发结算
 *   6. 打印每位参与者的 staticPaid / dynamicPaid
 *
 * 环境变量（可覆盖默认值）：
 *   FUND_AMOUNT_LIGHT   注入奖励池的 LIGHT 数量（默认 100）
 *   LIGHT_PRICE_USDT    结算时传入的 LIGHT/USDT 价格（默认 0.01）
 *   DAILY_REWARD_MAX_PARTICIPANTS 参与者上限（默认 200）
 */

import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: ".env" });

const coreAbi = [
  // config
  "function releaseDailyBps() view returns (uint16)",
  "function releaseImmediateBurnBps() view returns (uint16)",
  "function releaseSecondaryBurnBps() view returns (uint16)",
  "function releaseStaticBps() view returns (uint16)",
  "function releaseDynamicBps() view returns (uint16)",
  "function rewardCapBps() view returns (uint16)",
  "function updateRewardConfig(uint16,uint16,uint16,uint16,uint16,uint16) external",
  // pool
  "function rewardPoolBalance() view returns (uint256)",
  "function fundRewardPool(uint256 amount) external",
  // participants
  "function rewardParticipantsLength() view returns (uint256)",
  "function rewardParticipants(uint256 index) view returns (address)",
  // settlement
  "function settleDailyRewardsManual(address[] participants, uint256 lightPriceInUsdt) external",
  // ledger
  "function orderRewardLedger(uint256 orderId) view returns (uint256 capAmount, uint256 staticPaid, uint256 dynamicPaid, bool exited)",
  "function userOrderIdsLength(address user) view returns (uint256)",
  "function userOrderIds(address user, uint256 index) view returns (uint256)",
  // state
  "function lastRewardSettlementDay() view returns (uint256)",
  "function lightToken() view returns (address)",
  "function paused() view returns (bool)",
];

const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

function readEnv(key: string, fallback = "") {
  return (process.env[key] || "").trim() || fallback;
}

async function main() {
  const coreAddress = readEnv("INCUBATOR_CORE_PROXY", readEnv("VITE_CORE_CONTRACT_ADDRESS"));
  if (!ethers.isAddress(coreAddress)) throw new Error("Missing INCUBATOR_CORE_PROXY");

  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("=== fund-and-test-rewards ===");
  console.log("network :", network.chainId.toString(), "(CNC Mainnet = 50716)");
  console.log("signer  :", signer.address);
  console.log("core    :", coreAddress);
  console.log("");

  const core = await ethers.getContractAt(coreAbi, coreAddress, signer);
  const paused: boolean = await core.paused();
  if (paused) throw new Error("Core contract is paused");

  // ── Step 1: 读取 BPS ──────────────────────────────────────────────────────
  const [dailyBps, immBps, secBps, staticBps, dynBps, capBps] = await Promise.all([
    core.releaseDailyBps(), core.releaseImmediateBurnBps(), core.releaseSecondaryBurnBps(),
    core.releaseStaticBps(), core.releaseDynamicBps(), core.rewardCapBps(),
  ]);
  console.log("── 当前奖励配置 ──");
  console.log(`  releaseDailyBps         : ${dailyBps}  (${Number(dailyBps) / 100}%)`);
  console.log(`  releaseImmediateBurnBps : ${immBps}  (${Number(immBps) / 100}%)`);
  console.log(`  releaseSecondaryBurnBps : ${secBps}  (${Number(secBps) / 100}%)`);
  console.log(`  releaseStaticBps        : ${staticBps}  (${Number(staticBps) / 100}%)`);
  console.log(`  releaseDynamicBps       : ${dynBps}  (${Number(dynBps) / 100}%)`);
  console.log(`  rewardCapBps            : ${capBps}  (${Number(capBps) / 100}%)`);
  console.log("");

  const bpsAllZero = [dailyBps, immBps, secBps, staticBps, dynBps, capBps].every(v => Number(v) === 0);
  if (bpsAllZero) {
    console.log("⚙ BPS 全为 0，写入默认值 (200/4000/2000/6000/4000/30000)...");
    const tx = await core.updateRewardConfig(200, 4000, 2000, 6000, 4000, 30000);
    console.log("  TX:", tx.hash);
    await tx.wait();
    console.log("  ✓ updateRewardConfig 完成");
    console.log("");
  }

  // ── Step 2: 读取 LIGHT 余额，Approve + fundRewardPool ─────────────────────
  const lightAddr: string = await core.lightToken();
  if (!ethers.isAddress(lightAddr) || lightAddr === ethers.ZeroAddress) {
    throw new Error("lightToken 未设置，请先调用 initLightRewardConfig");
  }
  const light = await ethers.getContractAt(erc20Abi, lightAddr, signer);
  const signerBalance: bigint = await light.balanceOf(signer.address);
  console.log("── LIGHT 余额 ──");
  console.log(`  deployer balance  : ${ethers.formatUnits(signerBalance, 18)} LIGHT`);

  const fundAmountStr = readEnv("FUND_AMOUNT_LIGHT", "100");
  const fundAmount = ethers.parseUnits(fundAmountStr, 18);
  if (signerBalance < fundAmount) {
    throw new Error(
      `余额不足：deployer 有 ${ethers.formatUnits(signerBalance, 18)} LIGHT，需要 ${fundAmountStr} LIGHT`
    );
  }

  const allowance: bigint = await light.allowance(signer.address, coreAddress);
  if (allowance < fundAmount) {
    console.log(`  approve ${fundAmountStr} LIGHT → Core...`);
    const approveTx = await light.approve(coreAddress, ethers.MaxUint256);
    await approveTx.wait();
    console.log("  ✓ approve 完成");
  } else {
    console.log("  allowance 已足够，跳过 approve");
  }

  const poolBefore: bigint = await core.rewardPoolBalance();
  console.log(`  池子注入前余额   : ${ethers.formatUnits(poolBefore, 18)} LIGHT`);
  console.log(`  注入金额         : ${fundAmountStr} LIGHT`);
  const fundTx = await core.fundRewardPool(fundAmount);
  console.log("  TX:", fundTx.hash);
  await fundTx.wait();
  const poolAfter: bigint = await core.rewardPoolBalance();
  console.log(`  池子注入后余额   : ${ethers.formatUnits(poolAfter, 18)} LIGHT`);
  console.log("  ✓ fundRewardPool 完成");
  console.log("");

  // ── Step 3: 拉参与者列表 ──────────────────────────────────────────────────
  const maxP = Number(readEnv("DAILY_REWARD_MAX_PARTICIPANTS", "200"));
  const participantCount: bigint = await core.rewardParticipantsLength();
  const limit = Math.min(Number(participantCount), maxP);
  console.log(`── 参与者 ── (链上共 ${participantCount.toString()} 人，本次结算前 ${limit} 人)`);
  const participants: string[] = [];
  for (let i = 0; i < limit; i++) {
    const addr: string = await core.rewardParticipants(i);
    participants.push(addr);
  }
  participants.forEach((a, i) => console.log(`  [${i}] ${a}`));
  console.log("");

  if (participants.length === 0) {
    throw new Error("没有参与者，无法结算");
  }

  // ── Step 4: settleDailyRewardsManual ──────────────────────────────────────
  const priceStr = readEnv("LIGHT_PRICE_USDT", "0.01");
  const lightPrice = ethers.parseUnits(priceStr, 18);
  console.log(`── 结算 ──  LIGHT 价格: ${priceStr} USDT`);
  const settleTx = await core.settleDailyRewardsManual(participants, lightPrice, { gasLimit: 10_000_000n });
  console.log("  TX:", settleTx.hash);
  const receipt = await settleTx.wait();
  console.log(`  ✓ 结算完成  区块: ${receipt?.blockNumber ?? "??"}`);
  console.log("");

  // ── Step 5: 打印结算结果 ──────────────────────────────────────────────────
  const poolEnd: bigint = await core.rewardPoolBalance();
  const lastDay: bigint = await core.lastRewardSettlementDay();
  console.log("── 结算结果 ──");
  console.log(`  池子结算后余额     : ${ethers.formatUnits(poolEnd, 18)} LIGHT`);
  console.log(`  lastRewardSettlementDay : ${lastDay.toString()}`);
  console.log("");

  console.log("── 参与者奖励明细 ──");
  for (const addr of participants) {
    const orderLen: bigint = await core.userOrderIdsLength(addr);
    for (let j = 0; j < Number(orderLen); j++) {
      const orderId: bigint = await core.userOrderIds(addr, j);
      const [capAmount, staticPaid, dynamicPaid, exited] = await core.orderRewardLedger(orderId);
      if (staticPaid > 0n || dynamicPaid > 0n) {
        console.log(
          `  ${addr} orderId=${orderId}  static=${ethers.formatUnits(staticPaid, 6)} USDT  dynamic=${ethers.formatUnits(dynamicPaid, 6)} USDT  cap=${ethers.formatUnits(capAmount, 6)} USDT  exited=${exited}`
        );
      }
    }
  }
  console.log("");
  console.log("✅ fund-and-test-rewards 完成");
}

main().catch((e) => {
  console.error("[fund-and-test-rewards] ERROR:", e.message || e);
  process.exitCode = 1;
});
