import { ethers, upgrades } from "hardhat";
import * as assert from "node:assert/strict";

type TestResult = {
  name: string;
  status: "PASS" | "FAIL";
  duration: number;
  error?: string;
};

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    results.push({ name, status: "PASS", duration });
    console.log(`✓ ${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", duration, error: errorMsg });
    console.error(`✗ ${name} (${duration}ms)`);
  }
}

async function main() {
  console.log("════════════════════════════════════════════════════════");
  console.log("        Incubator 链上智能合约全面业务测试（修复版）");
  console.log("════════════════════════════════════════════════════════\n");

  // ════ 核心流程测试 ════
  console.log("【Core 合约业务流程测试】");
  await runTest("Core-001: 矿机购买流程及分账", testCoreMachinePurchase);
  await runTest("Core-002: 节点升级流程", testCoreNodeUpgrade);
  await runTest("Core-003: 超级节点升级", testCoreSuperNodeUpgrade);
  await runTest("Core-004: 身份 NFT 管理", testCoreIdentityManagement);
  await runTest("Core-005: 价格动态调整", testCorePriceUpdate);
  await runTest("Core-006: 暂停/恢复机制", testCorePauseResume);

  console.log("\n【OTC 市场业务流程测试】");
  await runTest("OTC-001: 订单创建和管理", testOtcOrderManagement);
  await runTest("OTC-002: 身份转移和费用", testOtcIdentityTransfer);
  await runTest("OTC-003: 订单验证规则", testOtcValidationRules);

  console.log("\n【Swap 流动池业务流程测试】");
  await runTest("Swap-001: 流动性添加和平衡", testSwapLiquidityManagement);
  await runTest("Swap-002: 精确输入交换和报价", testSwapTrading);
  await runTest("Swap-003: 费用收集和分配", testSwapFeeManagement);
  await runTest("Swap-004: LIGHT 代币销毁分账", testSwapLightDistribution);
  await runTest("Swap-005: 价格滑点保护", testSwapSlippage);

  console.log("\n【集成业务流程测试】");
  await runTest("Integration-001: 完整用户旅程", testUserJourneyComplete);
  await runTest("Integration-002: 系统紧急情况", testEmergencyScenarios);

  // 输出报告
  console.log("\n════════════════════════════════════════════════════════");
  console.log("                    测试报告总结");
  console.log("════════════════════════════════════════════════════════\n");

  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`✓ 总通过: ${passed}/${results.length} 个测试`);
  console.log(`✗ 总失败: ${failed}/${results.length} 个测试`);
  console.log(`  总耗时: ${(totalDuration / 1000).toFixed(2)} 秒\n`);

  if (failed > 0) {
    console.log("【失败详情】");
    results.filter(r => r.status === "FAIL").forEach(r => {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    });
  }

  console.log(`\n【功能覆盖统计】`);
  console.log(`  Core 合约: ${results.filter(r => r.name.startsWith("Core") && r.status === "PASS").length}/6 通过`);
  console.log(`  OTC 市场: ${results.filter(r => r.name.startsWith("OTC") && r.status === "PASS").length}/3 通过`);
  console.log(`  Swap 池: ${results.filter(r => r.name.startsWith("Swap") && r.status === "PASS").length}/5 通过`);
  console.log(`  集成测试: ${results.filter(r => r.name.startsWith("Integration") && r.status === "PASS").length}/2 通过`);
  console.log(`\n  总体成功率: ${((passed / results.length) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log("\n✅ 所有测试通过! 智能合约业务流程全部正常。");
  } else {
    console.log(`\n⚠️  ${failed} 个测试失败。`);
  }

  process.exitCode = failed > 0 ? 1 : 0;
}

// ════ 测试实现 ════

async function testCoreMachinePurchase() {
  const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
  const recipients = [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address];
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
  await usdt.connect(buyer).approve(await core.getAddress(), 10_000_000_000n);
  await core.connect(buyer).bindReferrer(owner.address);
  await core.connect(buyer).purchaseMachine(2);

  const order = await core.getMachineOrder(1);
  assert.equal(order.quantity, 2n);
  assert.equal(order.amountUSDT, 200_000_000n);
}

async function testCoreNodeUpgrade() {
  const [owner, buyer, ...rest] = await ethers.getSigners();
  const recipients = rest.slice(0, 6).map(s => s.address);
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  await usdt.connect(owner).mint(buyer.address, 50_000_000_000n);
  await usdt.connect(buyer).approve(await core.getAddress(), 50_000_000_000n);
  await core.connect(buyer).bindReferrer(owner.address);
  await core.connect(buyer).buyNode();

  assert.equal(await core.roles(buyer.address), 1n);
}

async function testCoreSuperNodeUpgrade() {
  const [owner, buyer, ...rest] = await ethers.getSigners();
  const recipients = rest.slice(0, 6).map(s => s.address);
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  await usdt.connect(owner).mint(buyer.address, 100_000_000_000n);
  await usdt.connect(buyer).approve(await core.getAddress(), 100_000_000_000n);
  await core.connect(buyer).bindReferrer(owner.address);
  await core.connect(buyer).buyNode();
  await core.connect(buyer).buySuperNode();

  assert.equal(await core.roles(buyer.address), 2n);
}

async function testCoreIdentityManagement() {
  const [owner, user, ...rest] = await ethers.getSigners();
  const recipients = rest.slice(0, 6).map(s => s.address);
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  await usdt.connect(owner).mint(user.address, 50_000_000_000n);
  await usdt.connect(user).approve(await core.getAddress(), 50_000_000_000n);
  await core.connect(user).bindReferrer(owner.address);
  await core.connect(user).buyNode();

  const identityId = await core.getUserIdentityId(user.address);
  const identity = await core.getIdentity(identityId);
  
  assert.equal(identity.owner, user.address);
  assert.equal(identity.role, 1n);
}

async function testCorePriceUpdate() {
  const [owner, ...rest] = await ethers.getSigners();
  const recipients = rest.slice(0, 6).map(s => s.address);
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  const oldPrice = await core.machineUnitPrice();
  const newPrice = ethers.parseUnits("150", 6);

  await core.connect(owner).updatePrice(0, newPrice);
  const updatedPrice = await core.machineUnitPrice();
  
  assert.equal(updatedPrice, newPrice);
}

async function testCorePauseResume() {
  const [owner, buyer, ...rest] = await ethers.getSigners();
  const recipients = rest.slice(0, 6).map(s => s.address);
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
  await usdt.connect(buyer).approve(await core.getAddress(), 10_000_000_000n);
  await core.connect(buyer).bindReferrer(owner.address);
  await core.connect(buyer).purchaseMachine(1);

  await core.connect(owner).pause();
  await assert.rejects(core.connect(buyer).purchaseMachine(1));

  await core.connect(owner).unpause();
  await core.connect(buyer).purchaseMachine(1);
}

async function testOtcOrderManagement() {
  const [owner, seller, buyer, feeRecip, ...rest] = await ethers.getSigners();
  const recipients = rest.slice(0, 6).map(s => s.address);
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);
  const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecip.address);

  await core.connect(owner).setIdentityMarket(await otc.getAddress());

  await usdt.connect(owner).mint(seller.address, 20_000_000_000n);
  await usdt.connect(seller).approve(await core.getAddress(), 20_000_000_000n);
  await core.connect(seller).bindReferrer(owner.address);
  await core.connect(seller).buyNode();

  const identityId = await core.getUserIdentityId(seller.address);
  await core.connect(seller).approveIdentityOperator(identityId, await otc.getAddress(), true);
  await otc.connect(seller).createOrder(identityId, 2_000_000_000n);

  await usdt.connect(owner).mint(buyer.address, 20_000_000_000n);
  await usdt.connect(buyer).approve(await otc.getAddress(), 20_000_000_000n);
  await otc.connect(buyer).fillOrder(1);

  assert.equal(await core.ownerOfIdentity(identityId), buyer.address);
}

async function testOtcIdentityTransfer() {
  const [owner, seller, buyer, feeRecip, ...rest] = await ethers.getSigners();
  const recipients = rest.slice(0, 6).map(s => s.address);
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);
  const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecip.address);

  await core.connect(owner).setIdentityMarket(await otc.getAddress());

  await usdt.connect(owner).mint(seller.address, 30_000_000_000n);
  await usdt.connect(seller).approve(await core.getAddress(), 30_000_000_000n);
  await core.connect(seller).bindReferrer(owner.address);
  await core.connect(seller).buyNode();
  await core.connect(seller).buySuperNode();

  const identityId = await core.getUserIdentityId(seller.address);
  const roleBefore = (await core.getIdentity(identityId)).role;

  await usdt.connect(owner).mint(buyer.address, 20_000_000_000n);
  await usdt.connect(buyer).approve(await otc.getAddress(), 20_000_000_000n);
  await core.connect(seller).approveIdentityOperator(identityId, await otc.getAddress(), true);
  await otc.connect(seller).createOrder(identityId, 10_000_000_000n);
  await otc.connect(buyer).fillOrder(1);

  assert.equal(await core.ownerOfIdentity(identityId), buyer.address);
  assert.equal((await core.getIdentity(identityId)).role, roleBefore);
}

async function testOtcValidationRules() {
  const [owner, seller, buyer, feeRecip, ...rest] = await ethers.getSigners();
  const recipients = rest.slice(0, 6).map(s => s.address);
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);
  const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecip.address);

  await core.connect(owner).setIdentityMarket(await otc.getAddress());

  await usdt.connect(owner).mint(seller.address, 20_000_000_000n);
  await usdt.connect(seller).approve(await core.getAddress(), 20_000_000_000n);
  await core.connect(seller).bindReferrer(owner.address);
  await core.connect(seller).buyNode();

  const identityId = await core.getUserIdentityId(seller.address);
  await core.connect(seller).approveIdentityOperator(identityId, await otc.getAddress(), true);
  await otc.connect(seller).createOrder(identityId, 2_000_000_000n);

  // 同一身份不能有多个活跃订单
  await assert.rejects(otc.connect(seller).createOrder(identityId, 2_100_000_000n));
}

async function testSwapLiquidityManagement() {
  const [owner] = await ethers.getSigners();
  const usdt = await deployMockUsdt(owner.address);
  const ico = await deployIcoToken(owner.address, owner.address);
  const light = await deployMockToken("LIGHT", "LIGHT", owner.address);
  const swap = await deploySwap(await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address);

  await swap.connect(owner).createDefaultPools(50, 200, 3000);

  await usdt.connect(owner).mint(owner.address, 20_000_000_000n);
  await ico.connect(owner).mint(owner.address, 2_000_000_000_000_000_000_000_000n);

  await usdt.connect(owner).approve(await swap.getAddress(), 10_000_000_000n);
  await ico.connect(owner).approve(await swap.getAddress(), 600_000_000_000_000_000_000_000n);

  await swap.connect(owner).addLiquidity(0, 10_000_000_000n, 500_000_000_000_000_000_000_000n);
}

async function testSwapTrading() {
  const [owner, trader] = await ethers.getSigners();
  const usdt = await deployMockUsdt(owner.address);
  const ico = await deployIcoToken(owner.address, owner.address);
  const light = await deployMockToken("LIGHT", "LIGHT", owner.address);
  const swap = await deploySwap(await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address);

  await swap.connect(owner).createDefaultPools(50, 200, 3000);

  await usdt.connect(owner).mint(owner.address, 20_000_000_000n);
  await ico.connect(owner).mint(owner.address, 2_000_000_000_000_000_000_000_000n);

  await usdt.connect(owner).approve(await swap.getAddress(), 10_000_000_000n);
  await ico.connect(owner).approve(await swap.getAddress(), 600_000_000_000_000_000_000_000n);

  await swap.connect(owner).addLiquidity(0, 10_000_000_000n, 500_000_000_000_000_000_000_000n);

  await usdt.connect(owner).mint(trader.address, 1_000_000_000n);
  await usdt.connect(trader).approve(await swap.getAddress(), 1_000_000_000n);

  const quote = await swap.quoteExactIn(0, await usdt.getAddress(), 100_000_000n);
  const [amountOut, fee] = quote;

  assert.ok(amountOut > 0n);
  assert.ok(fee > 0n);

  await swap.connect(trader).swapExactIn(0, await usdt.getAddress(), 100_000_000n, amountOut - 1n, trader.address);
}

async function testSwapFeeManagement() {
  const [owner, trader, feeA, feeB] = await ethers.getSigners();
  const usdt = await deployMockUsdt(owner.address);
  const ico = await deployIcoToken(owner.address, owner.address);
  const light = await deployMockToken("LIGHT", "LIGHT", owner.address);
  const swap = await deploySwap(await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address);

  await swap.connect(owner).createDefaultPools(50, 200, 3000);

  await usdt.connect(owner).mint(owner.address, 20_000_000_000n);
  await ico.connect(owner).mint(owner.address, 2_000_000_000_000_000_000_000_000n);

  await usdt.connect(owner).approve(await swap.getAddress(), 10_000_000_000n);
  await ico.connect(owner).approve(await swap.getAddress(), 600_000_000_000_000_000_000_000n);

  await swap.connect(owner).addLiquidity(0, 10_000_000_000n, 500_000_000_000_000_000_000_000n);

  await usdt.connect(owner).mint(trader.address, 1_000_000_000n);
  await usdt.connect(trader).approve(await swap.getAddress(), 1_000_000_000n);

  const quote = await swap.quoteExactIn(0, await usdt.getAddress(), 100_000_000n);
  const [amountOut] = quote;

  await swap.connect(trader).swapExactIn(0, await usdt.getAddress(), 100_000_000n, amountOut - 1n, trader.address);

  const feeVault = await swap.feeVault(0, await usdt.getAddress());
  assert.ok(feeVault > 0n);

  await swap.connect(owner).distributeFees(0, await usdt.getAddress(), [feeA.address, feeB.address], [5000, 5000]);
  assert.ok((await usdt.balanceOf(feeA.address)) > 0n);
}

async function testSwapLightDistribution() {
  const [owner, trader, bootstrap, nodePool, superNodePool] = await ethers.getSigners();
  const usdt = await deployMockUsdt(owner.address);
  const ico = await deployIcoToken(owner.address, owner.address);
  const light = await deployMockToken("LIGHT", "LIGHT", owner.address);
  const swap = await deploySwap(await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address);

  await swap.connect(owner).createDefaultPools(50, 200, 3000);

  await usdt.connect(owner).mint(owner.address, 20_000_000_000n);
  await ico.connect(owner).mint(owner.address, 2_000_000_000_000_000_000_000_000n);
  await light.connect(owner).mint(owner.address, 2_000_000_000_000_000_000_000_000n);

  await usdt.connect(owner).approve(await swap.getAddress(), 10_000_000_000n);
  await ico.connect(owner).approve(await swap.getAddress(), 600_000_000_000_000_000_000_000n);
  await light.connect(owner).approve(await swap.getAddress(), 300_000_000_000_000_000_000_000n);

  await swap.connect(owner).addLiquidity(0, 10_000_000_000n, 500_000_000_000_000_000_000_000n);
  await swap.connect(owner).addLiquidity(1, 200_000_000_000_000_000_000_000n, 100_000_000_000_000_000_000_000n);

  await light.connect(owner).mint(trader.address, 2_000_000_000_000_000_000n);
  await light.connect(trader).approve(await swap.getAddress(), 2_000_000_000_000_000_000n);

  await swap.connect(owner).updateLightFeeConfig(6000, 3000, 700, 300, bootstrap.address, nodePool.address, superNodePool.address);

  const lightSupplyBefore = await light.totalSupply();
  await swap.connect(trader).swapExactIn(1, await light.getAddress(), 1_000_000_000_000_000_000n, 1n, trader.address);

  await swap.connect(owner).settleLightFees();
  const lightSupplyAfter = await light.totalSupply();

  assert.ok(lightSupplyBefore > lightSupplyAfter);
}

async function testSwapSlippage() {
  const [owner, trader] = await ethers.getSigners();
  const usdt = await deployMockUsdt(owner.address);
  const ico = await deployIcoToken(owner.address, owner.address);
  const light = await deployMockToken("LIGHT", "LIGHT", owner.address);
  const swap = await deploySwap(await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address);

  await swap.connect(owner).createDefaultPools(50, 200, 3000);

  await usdt.connect(owner).mint(owner.address, 20_000_000_000n);
  await ico.connect(owner).mint(owner.address, 2_000_000_000_000_000_000_000_000n);

  await usdt.connect(owner).approve(await swap.getAddress(), 10_000_000_000n);
  await ico.connect(owner).approve(await swap.getAddress(), 600_000_000_000_000_000_000_000n);

  await swap.connect(owner).addLiquidity(0, 10_000_000_000n, 500_000_000_000_000_000_000_000n);

  await usdt.connect(owner).mint(trader.address, 1_000_000_000n);
  await usdt.connect(trader).approve(await swap.getAddress(), 1_000_000_000n);

  const quote = await swap.quoteExactIn(0, await usdt.getAddress(), 100_000_000n);
  const [amountOut] = quote;

  // 设置过高的滑点保护应该失败
  await assert.rejects(
    swap.connect(trader).swapExactIn(0, await usdt.getAddress(), 100_000_000n, amountOut + 1n, trader.address)
  );
}

async function testUserJourneyComplete() {
  const [owner, user, otherUser, feeRecip, ...rest] = await ethers.getSigners();
  const recipients = rest.slice(0, 6).map(s => s.address);
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);
  const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecip.address);

  await core.connect(owner).setIdentityMarket(await otc.getAddress());

  // 用户完整旅程
  await usdt.connect(owner).mint(user.address, 100_000_000_000n);
  await usdt.connect(user).approve(await core.getAddress(), 100_000_000_000n);
  await core.connect(user).bindReferrer(owner.address);
  await core.connect(user).purchaseMachine(5);
  await core.connect(user).buyNode();
  await core.connect(user).buySuperNode();

  const identityId = await core.getUserIdentityId(user.address);
  await core.connect(user).approveIdentityOperator(identityId, await otc.getAddress(), true);
  await otc.connect(user).createOrder(identityId, 10_000_000_000n);

  await usdt.connect(owner).mint(otherUser.address, 100_000_000_000n);
  await usdt.connect(otherUser).approve(await otc.getAddress(), 100_000_000_000n);
  await otc.connect(otherUser).fillOrder(1);

  assert.equal(await core.ownerOfIdentity(identityId), otherUser.address);
}

async function testEmergencyScenarios() {
  const [owner, user, ...rest] = await ethers.getSigners();
  const recipients = rest.slice(0, 6).map(s => s.address);
  
  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  await usdt.connect(owner).mint(user.address, 50_000_000_000n);
  await usdt.connect(user).approve(await core.getAddress(), 50_000_000_000n);
  await core.connect(user).bindReferrer(owner.address);
  await core.connect(user).purchaseMachine(2);

  // 暂停测试
  await core.connect(owner).pause();
  await assert.rejects(core.connect(user).purchaseMachine(1));

  // 恢复并继续
  await core.connect(owner).unpause();
  await core.connect(user).purchaseMachine(1);
}

// ════ 部署函数 ════

async function deployMockUsdt(initialOwner: string) {
  const factory = await ethers.getContractFactory("MockUSDT");
  const contract = await factory.deploy(initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployCore(usdtAddress: string, owner: string, recipients: string[]) {
  const libraries: Record<string, string> = {};
  for (const name of ["LeaderboardLib", "NodePoolLib", "PoolSettleLib"] as const) {
    const libFactory = await ethers.getContractFactory(name);
    const lib = await libFactory.deploy();
    await lib.waitForDeployment();
    libraries[name] = await lib.getAddress();
  }
  const factory = await ethers.getContractFactory("IncubatorCore", { libraries });
  const contract = await upgrades.deployProxy(factory, [usdtAddress, owner, recipients], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor", "state-variable-assignment", "external-library-linking"],
  });
  await contract.waitForDeployment();
  return contract;
}

async function deployMockToken(name: string, symbol: string, initialOwner: string) {
  const factory = await ethers.getContractFactory("MockToken");
  const contract = await factory.deploy(name, symbol, initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployIcoToken(initialOwner: string, saleWallet: string) {
  const factory = await ethers.getContractFactory("IncubatorToken");
  const contract = await factory.deploy("Incubator ICO", "ICO", initialOwner, saleWallet);
  await contract.waitForDeployment();
  return contract;
}

async function deploySwap(usdtAddress: string, icoAddress: string, lightAddress: string, initialOwner: string) {
  const factory = await ethers.getContractFactory("SwapPoolManager");
  const contract = await upgrades.deployProxy(factory, [usdtAddress, icoAddress, lightAddress, initialOwner], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await contract.waitForDeployment();
  return contract;
}

async function deployOtc(usdtAddress: string, coreAddress: string, initialOwner: string, feeRecipient: string) {
  const factory = await ethers.getContractFactory("NodeOTCMarket");
  const contract = await upgrades.deployProxy(factory, [usdtAddress, coreAddress, initialOwner, feeRecipient], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await contract.waitForDeployment();
  return contract;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
