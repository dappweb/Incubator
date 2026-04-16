#!/usr/bin/env node
/**
 * CNC Mainnet 部署验证脚本
 * 用法: npx hardhat run scripts/verify-deployment.ts --network cncMainnet
 *
 * 验证已部署合约的功能和互联互通
 */

import * as dotenv from "dotenv";
import { ethers } from "hardhat";

dotenv.config({ path: ".env" });

type Check = { label: string; ok: boolean; detail: string };

function env(key: string): string {
  return process.env[key]?.trim() || "";
}

async function main() {
  const results: Check[] = [];
  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log(`\n🔍 验证部署 — chainId: ${network.chainId}, signer: ${signer.address}\n`);

  // 1. Contract code check
  const contracts: Array<{ label: string; envKey: string }> = [
    { label: "IncubatorCore", envKey: "INCUBATOR_CORE_PROXY" },
    { label: "NodeOTCMarket", envKey: "NODE_OTC_MARKET_PROXY" },
    { label: "SwapPoolManager", envKey: "SWAP_POOL_MANAGER_PROXY" },
    { label: "PrimarySwapController", envKey: "PRIMARY_SWAP_CONTROLLER_PROXY" },
  ];

  for (const c of contracts) {
    const addr = env(c.envKey);
    if (!addr) {
      results.push({ label: `${c.label} 地址`, ok: false, detail: `${c.envKey} 未配置` });
      continue;
    }
    const code = await ethers.provider.getCode(addr);
    const hasCode = code !== "0x" && code.length > 2;
    results.push({
      label: `${c.label} 合约代码`,
      ok: hasCode,
      detail: hasCode ? `${addr} ✓ (${code.length} bytes)` : `${addr} 无代码!`,
    });
  }

  // 2. Token verification
  const erc20Abi = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
  ];
  const tokens: Array<{ label: string; envKey: string }> = [
    { label: "USDT", envKey: "USDT_TOKEN_ADDRESS" },
    { label: "ICO", envKey: "ICO_TOKEN_ADDRESS" },
    { label: "LIGHT", envKey: "LIGHT_TOKEN_ADDRESS" },
  ];

  for (const t of tokens) {
    const addr = env(t.envKey);
    if (!addr) {
      results.push({ label: `${t.label} 代币`, ok: false, detail: `${t.envKey} 未配置` });
      continue;
    }
    try {
      const token = new ethers.Contract(addr, erc20Abi, ethers.provider);
      const [symbol, decimals, supply] = await Promise.all([
        token.symbol(),
        token.decimals(),
        token.totalSupply(),
      ]);
      results.push({
        label: `${t.label} 代币`,
        ok: true,
        detail: `${symbol} decimals=${decimals} supply=${ethers.formatUnits(supply, decimals)}`,
      });
    } catch (e: any) {
      results.push({ label: `${t.label} 代币`, ok: false, detail: `读取失败: ${e.message?.slice(0, 80)}` });
    }
  }

  // 3. IncubatorCore state
  const coreAddr = env("INCUBATOR_CORE_PROXY");
  if (coreAddr) {
    const coreAbi = [
      "function owner() view returns (address)",
      "function paused() view returns (bool)",
      "function usdt() view returns (address)",
      "function getParticipantCount() view returns (uint256)",
      "function getPoolConfig(uint8 poolType) view returns (address recipient, uint16 bps)",
      "function identityMarket() view returns (address)",
    ];
    try {
      const core = new ethers.Contract(coreAddr, coreAbi, ethers.provider);
      const [owner, paused, usdt, participants, market] = await Promise.all([
        core.owner(),
        core.paused(),
        core.usdt(),
        core.getParticipantCount(),
        core.identityMarket(),
      ]);
      results.push({ label: "Core owner", ok: true, detail: owner });
      results.push({ label: "Core paused", ok: !paused, detail: paused ? "暂停中!" : "运行中" });
      results.push({
        label: "Core USDT",
        ok: usdt.toLowerCase() === env("USDT_TOKEN_ADDRESS").toLowerCase(),
        detail: usdt,
      });
      results.push({ label: "Core 参与者数量", ok: true, detail: participants.toString() });
      results.push({
        label: "Core identityMarket",
        ok: market.toLowerCase() === env("NODE_OTC_MARKET_PROXY").toLowerCase(),
        detail: market,
      });

      const poolNames = ["LP", "Referral", "SuperNode", "Node", "Platform", "Leaderboard"];
      for (let i = 0; i < 6; i++) {
        try {
          const [recipient, bps] = await core.getPoolConfig(i);
          results.push({
            label: `Pool ${poolNames[i]} 接收者`,
            ok: recipient !== ethers.ZeroAddress,
            detail: `${recipient} (bps=${bps})`,
          });
        } catch {
          results.push({ label: `Pool ${poolNames[i]} 接收者`, ok: false, detail: "读取失败" });
        }
      }
    } catch (e: any) {
      results.push({ label: "Core 状态", ok: false, detail: `读取失败: ${e.message?.slice(0, 80)}` });
    }
  }

  // 4. OTC Market
  const otcAddr = env("NODE_OTC_MARKET_PROXY");
  if (otcAddr) {
    const otcAbi = [
      "function owner() view returns (address)",
      "function usdt() view returns (address)",
      "function coreIdentity() view returns (address)",
      "function feeRecipient() view returns (address)",
    ];
    try {
      const otc = new ethers.Contract(otcAddr, otcAbi, ethers.provider);
      const [owner, usdt, coreLink, feeRecipient] = await Promise.all([
        otc.owner(),
        otc.usdt(),
        otc.coreIdentity(),
        otc.feeRecipient(),
      ]);
      results.push({ label: "OTC owner", ok: true, detail: owner });
      results.push({
        label: "OTC → Core 关联",
        ok: coreLink.toLowerCase() === coreAddr.toLowerCase(),
        detail: coreLink,
      });
      results.push({ label: "OTC feeRecipient", ok: feeRecipient !== ethers.ZeroAddress, detail: feeRecipient });
    } catch (e: any) {
      results.push({ label: "OTC 状态", ok: false, detail: `读取失败: ${e.message?.slice(0, 80)}` });
    }
  }

  // 5. SwapPoolManager
  const swapAddr = env("SWAP_POOL_MANAGER_PROXY");
  if (swapAddr) {
    const swapAbi = [
      "function owner() view returns (address)",
      "function getPool(uint8 pairId) view returns (address token0, address token1, uint256 reserve0, uint256 reserve1, uint16 feeBps, uint16 maxPriceImpactBps, bool exists)",
    ];
    try {
      const swap = new ethers.Contract(swapAddr, swapAbi, ethers.provider);
      const [owner, pool0] = await Promise.all([swap.owner(), swap.getPool(0)]);
      results.push({ label: "Swap owner", ok: true, detail: owner });
      results.push({ label: "Swap Pool#0 exists", ok: pool0.exists, detail: pool0.exists ? `feeBps=${pool0.feeBps}` : "不存在" });
    } catch (e: any) {
      results.push({ label: "Swap 状态", ok: false, detail: `读取失败: ${e.message?.slice(0, 80)}` });
    }
  }

  // 6. PrimarySwapController
  const pscAddr = env("PRIMARY_SWAP_CONTROLLER_PROXY");
  if (pscAddr) {
    const pscAbi = [
      "function owner() view returns (address)",
      "function sellUsdtEnabled() view returns (bool)",
      "function superNodeFeeRecipient() view returns (address)",
      "function nodePoolFeeRecipient() view returns (address)",
      "function platformRecipient() view returns (address)",
    ];
    try {
      const psc = new ethers.Contract(pscAddr, pscAbi, ethers.provider);
      const [owner, sellEnabled, snRecipient, nodeRecipient, platRecipient] = await Promise.all([
        psc.owner(),
        psc.sellUsdtEnabled(),
        psc.superNodeFeeRecipient(),
        psc.nodePoolFeeRecipient(),
        psc.platformRecipient(),
      ]);
      results.push({ label: "PSC owner", ok: true, detail: owner });
      results.push({ label: "PSC sellUsdtEnabled", ok: true, detail: sellEnabled ? "开启" : "关闭" });
      results.push({ label: "PSC superNodeRecipient", ok: snRecipient !== ethers.ZeroAddress, detail: snRecipient });
      results.push({ label: "PSC nodePoolRecipient", ok: nodeRecipient !== ethers.ZeroAddress, detail: nodeRecipient });
      results.push({ label: "PSC platformRecipient", ok: platRecipient !== ethers.ZeroAddress, detail: platRecipient });
    } catch (e: any) {
      results.push({ label: "PSC 状态", ok: false, detail: `读取失败: ${e.message?.slice(0, 80)}` });
    }
  }

  // 7. PancakeV2 Router
  const routerAddr = env("PANCAKE_V2_ROUTER_ADDRESS");
  if (routerAddr) {
    const code = await ethers.provider.getCode(routerAddr);
    const hasCode = code !== "0x" && code.length > 2;
    results.push({ label: "PancakeV2 Router", ok: hasCode, detail: hasCode ? `${routerAddr} ✓` : "无代码!" });
  }

  // Print results
  console.log("═".repeat(80));
  console.log(" 部署验证报告");
  console.log("═".repeat(80));
  let passCount = 0;
  let failCount = 0;
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`${icon} ${r.label}: ${r.detail}`);
    if (r.ok) passCount++;
    else failCount++;
  }
  console.log("═".repeat(80));
  console.log(`总计: ${passCount} 通过, ${failCount} 失败`);
  if (failCount > 0) {
    console.log("⚠️  有未通过的检查项，请检查上方详情");
    process.exitCode = 1;
  } else {
    console.log("🎉 所有检查通过！系统已就绪");
  }
}

main().catch((error) => {
  console.error("验证失败:", error);
  process.exitCode = 1;
});
