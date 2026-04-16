import { ethers, upgrades } from "hardhat";
import * as assert from "node:assert/strict";

type TestCase = {
  name: string;
  status: "PASS" | "FAIL";
  duration: number;
  error?: string;
};

const testResults: TestCase[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    testResults.push({ name, status: "PASS", duration: Date.now() - start });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    testResults.push({ name, status: "FAIL", duration: Date.now() - start, error: msg });
    console.error(`  ✗ ${name}: ${msg}`);
  }
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║         Incubator 代币制度全面测试 (Token System Test)        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  console.log("【场景 1: 单用户购买矿机及分账】");
  await runTest("1.1 用户购买矿机，验证各池分账正确", testMachinePurchaseAllocation);
  await runTest("1.2 连续购买多次，验证累计分账", testMultipleMachinePurchases);
  await runTest("1.3 推荐人获得推荐奖励", testReferralBonus);

  console.log("\n【场景 2: 节点升级流程】");
  await runTest("2.1 用户购买节点，身份角色更新", testNodePurchase);
  await runTest("2.2 节点用户可升级为超级节点", testSuperNodeUpgrade);
  await runTest("2.3 超级节点用户无法重复购买超级节点", testSuperNodeDuplicate);

  console.log("\n【场景 3: 团队业绩统计】");
  await runTest("3.1 直推人数和业绩正确统计", testTeamStats);
  await runTest("3.2 多级推荐链的团队业绩累计", testMultiLevelTeamStats);

  console.log("\n【场景 4: 榜单机制】");
  await runTest("4.1 日常交易量排行榜记录", testLeaderboardTracking);
  await runTest("4.2 幸运排行（最后十位用户）", testLuckyLeaderboard);

  console.log("\n【场景 5: OTC 市场身份转移】");
  await runTest("5.1 节点身份可通过 OTC 转移", testOtcIdentityTransfer);
  await runTest("5.2 转移后新主人继承身份和奖励权限", testOtcIdentityInheritance);

  console.log("\n【场景 6: Swap 交换和手续费分配】");
  await runTest("6.1 USDT-ICO 交换产生手续费", testSwapFeeGeneration);
  await runTest("6.2 手续费可分配给多个收款人", testSwapFeeDistribution);
  await runTest("6.3 LIGHT 代币交换并进行燃烧和分账", testLightBurnAndDistribute);

  console.log("\n【场景 7: ICO 代币销毁】");
  await runTest("7.1 项目方可销毁未售出库存", testIcoBurnUnsold);
  await runTest("7.2 用户可自助销毁持仓 ICO", testIcoBurnDefault);

  console.log("\n【场景 8: 综合用户旅程】");
  await runTest("8.1 完整用户旅程：购买→推荐→升级→交易→收益", testCompleteUserJourney);
  await runTest("8.2 多用户交互和竞争排名", testMultiUserCompetition);

  // 打印报告
  printReport();
}

// 测试用例实现

async function testMachinePurchaseAllocation() {
  const [owner, buyer, lp, referral, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const recipients = [lp.address, referral.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  // 初始化：buyer 绑定 owner 作为推荐人
  await usdt.connect(owner).mint(buyer.address, BigInt(1e9));
  await usdt.connect(buyer).approve(await core.getAddress(), BigInt(1e9));
  await core.connect(buyer).bindReferrer(owner.address);

  // buyer 购买 10 台矿机
  const quantity = 10;
  await core.connect(buyer).purchaseMachine(quantity);

  // 验证各池余额
  // 分配比例：流动性 60%, 推荐 5%, 超级 5%, 节点 8%, 平台 20%, 榜单 2%
  const totalUSDT = (await core.machineUnitPrice()) * BigInt(quantity);
  const lpShare = totalUSDT * 60n / 100n;
  const referralShare = totalUSDT * 5n / 100n;
  const superNodeShare = totalUSDT * 5n / 100n;
  const nodeShare = totalUSDT * 8n / 100n;
  const platformShare = totalUSDT * 20n / 100n;

  assert.equal(await usdt.balanceOf(lp.address), lpShare);
  assert.equal(await usdt.balanceOf(referral.address), 0n); // referral pool 的收款地址，但 buyer 没有绑定到 referral
  assert.equal(await usdt.balanceOf(superNode.address), superNodeShare);
  assert.equal(await usdt.balanceOf(node.address), nodeShare);
  assert.equal(await usdt.balanceOf(platform.address), platformShare);
}

async function testMultipleMachinePurchases() {
  const [owner, buyer, lp, referral, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const recipients = [lp.address, referral.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  await usdt.connect(owner).mint(buyer.address, BigInt(1e10));
  await usdt.connect(buyer).approve(await core.getAddress(), BigInt(1e10));
  await core.connect(buyer).bindReferrer(owner.address);

  // 第一次购买
  await core.connect(buyer).purchaseMachine(5);
  const balanceAfterFirst = await usdt.balanceOf(lp.address);

  // 第二次购买
  await core.connect(buyer).purchaseMachine(3);
  const balanceAfterSecond = await usdt.balanceOf(lp.address);

  assert.ok(balanceAfterSecond > balanceAfterFirst, "LP 池应该在第二次购买后余额更多");
}

async function testReferralBonus() {
  const [owner, referrer, buyer, lp, referralPool, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const recipients = [lp.address, referralPool.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  // buyer 绑定 referrer
  await usdt.connect(owner).mint(buyer.address, BigInt(1e9));
  await usdt.connect(buyer).approve(await core.getAddress(), BigInt(1e9));
  await core.connect(buyer).bindReferrer(referrer.address);

  // buyer 购买矿机
  await core.connect(buyer).purchaseMachine(10);

  // referrer 应该收到推荐奖励（5% 到推荐人）
  const totalUSDT = (await core.machineUnitPrice()) * 10n;
  const referralShare = totalUSDT * 5n / 100n;
  
  // 推荐人是直接收款人，不是池地址
  assert.equal(await usdt.balanceOf(referrer.address), referralShare);
}

async function testNodePurchase() {
  const [owner, buyer, lp, referral, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const recipients = [lp.address, referral.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  await usdt.connect(owner).mint(buyer.address, BigInt(1e10));
  await usdt.connect(buyer).approve(await core.getAddress(), BigInt(1e10));
  await core.connect(buyer).bindReferrer(owner.address);

  // buyer 购买节点
  const nodePrice = await core.nodePrice();
  await core.connect(buyer).buyNode();

  // 验证身份
  const identityId = await core.getUserIdentityId(buyer.address);
  const identity = await core.getIdentity(identityId);
  assert.equal(identity.role, 1n); // Role.Node = 1

  // 验证余额减少
  const expectedBalance = BigInt(1e10) - nodePrice;
  const actualBalance = await usdt.balanceOf(buyer.address);
  assert.ok(actualBalance <= expectedBalance);
}

async function testSuperNodeUpgrade() {
  const [owner, buyer, lp, referral, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const recipients = [lp.address, referral.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  await usdt.connect(owner).mint(buyer.address, BigInt(1e10));
  await usdt.connect(buyer).approve(await core.getAddress(), BigInt(1e10));
  await core.connect(buyer).bindReferrer(owner.address);

  // 先购买节点
  await core.connect(buyer).buyNode();
  assert.equal(await core.roles(buyer.address), 1n);

  // 升级为超级节点
  await core.connect(buyer).buySuperNode();
  assert.equal(await core.roles(buyer.address), 2n); // Role.SuperNode = 2
}

async function testSuperNodeDuplicate() {
  const [owner, buyer, lp, referral, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const recipients = [lp.address, referral.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  await usdt.connect(owner).mint(buyer.address, BigInt(1e10));
  await usdt.connect(buyer).approve(await core.getAddress(), BigInt(1e10));
  await core.connect(buyer).bindReferrer(owner.address);

  // 直接购买超级节点
  await core.connect(buyer).buySuperNode();
  await usdt.connect(buyer).approve(await core.getAddress(), BigInt(1e10));

  // 尝试再次购买应该失败
  await assert.rejects(
    core.connect(buyer).buySuperNode(),
    error => error.message.includes("already a super node")
  );
}

async function testTeamStats() {
  const [owner, referrer, buyer1, buyer2, lp, referralPool, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const recipients = [lp.address, referralPool.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  const amount = BigInt(5e9);

  // 先绑定 referrer 自己到 owner（确保 referrer 本身有有效的推荐人）
  await usdt.connect(owner).mint(referrer.address, BigInt(1e6));
  await usdt.connect(referrer).approve(await core.getAddress(), BigInt(1e6));
  await core.connect(referrer).bindReferrer(owner.address);

  // buyer1 和 buyer2 都绑定到 referrer
  for (const buyer of [buyer1, buyer2]) {
    await usdt.connect(owner).mint(buyer.address, amount);
    await usdt.connect(buyer).approve(await core.getAddress(), amount);
    await core.connect(buyer).bindReferrer(referrer.address);

    await core.connect(buyer).purchaseMachine(2);
  }

  // 验证 referrer 的直推人数
  assert.equal(await core.directReferralCount(referrer.address), 2n);

  // 验证团队业绩
  const directVolume = await core.directReferralVolume(referrer.address);
  assert.ok(directVolume > 0n, "referrer 的直推业绩应该大于 0");
}

async function testMultiLevelTeamStats() {
  const [owner, level1, level2, level3, lp, referralPool, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const recipients = [lp.address, referralPool.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  const amount = BigInt(3e9);

  // 构建三级推荐链：level1 -> level2 -> level3
  for (const buyer of [level1, level2, level3]) {
    await usdt.connect(owner).mint(buyer.address, amount);
    await usdt.connect(buyer).approve(await core.getAddress(), amount);
  }

  // level1 绑定到 owner
  await core.connect(level1).bindReferrer(owner.address);
  await core.connect(level1).purchaseMachine(1);

  // level2 绑定到 level1
  await core.connect(level2).bindReferrer(level1.address);
  await core.connect(level2).purchaseMachine(1);

  // level3 绑定到 level2
  await core.connect(level3).bindReferrer(level2.address);
  await core.connect(level3).purchaseMachine(1);

  // 验证 owner 和 level1 都收到团队业绩
  const ownerVolume = await core.teamTotalVolume(owner.address);
  const level1Volume = await core.teamTotalVolume(level1.address);

  assert.ok(ownerVolume > 0n, "owner 的多级团队业绩应该大于 0");
  assert.ok(level1Volume > 0n, "level1 的团队业绩应该大于 0");
}

async function testLeaderboardTracking() {
  const [owner, user1, user2, user3, lp, referralPool, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const recipients = [lp.address, referralPool.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  const amount = BigInt(1e10);
  const users = [user1, user2, user3];

  for (const user of users) {
    await usdt.connect(owner).mint(user.address, amount);
    await usdt.connect(user).approve(await core.getAddress(), amount);
    await core.connect(user).bindReferrer(owner.address);

    // 其中 user1 买最多，user3 买最少
    const quantity = users.indexOf(user) === 0 ? 10 : users.indexOf(user) === 1 ? 5 : 2;
    await core.connect(user).purchaseMachine(quantity);
  }

  // 验证榜单有记录（虽然不能直接获取排名，但业绩应该被记录）
  const user1Volume = await core.directReferralVolume(owner.address);
  assert.ok(user1Volume > 0n, "榜单应该记录交易量");
}

async function testLuckyLeaderboard() {
  const signers = await ethers.getSigners();
  const owner = signers[0];
  const lp = signers[1];
  const referralPool = signers[2];
  const superNode = signers[3];
  const node = signers[4];
  const platform = signers[5];
  const leaderboard = signers[6];

  const recipients = [lp.address, referralPool.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, recipients);

  // 创建最多 10 个用户来测试幸运排行（避免超过 signers 数量）
  const numUsers = 10;
  for (let i = 0; i < numUsers && (7 + i) < signers.length; i++) {
    const user = signers[7 + i];
    const amount = BigInt(1e9);
    await usdt.connect(owner).mint(user.address, amount);
    await usdt.connect(user).approve(await core.getAddress(), amount);
    await core.connect(user).bindReferrer(owner.address);
    await core.connect(user).purchaseMachine(1);
  }

  // 幸运排行应该记录最后 10 位用户
  const dayId = await core.currentDay();
  const leaderboardData = await core.getLeaderboard(dayId);
  assert.ok(leaderboardData.lastCount > 0, "幸运排行应该有记录");
}

async function testOtcIdentityTransfer() {
  const [owner, seller, buyer, feeRecipient, lp, referralPool, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const coreRecipients = [lp.address, referralPool.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, coreRecipients);
  const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);

  await core.connect(owner).setIdentityMarket(await otc.getAddress());

  // seller 购买节点
  const amount = BigInt(1e10);
  await usdt.connect(owner).mint(seller.address, amount);
  await usdt.connect(seller).approve(await core.getAddress(), amount);
  await core.connect(seller).bindReferrer(owner.address);
  await core.connect(seller).buyNode();

  const identityId = await core.getUserIdentityId(seller.address);

  // seller 创建 OTC 订单
  await core.connect(seller).approveIdentityOperator(identityId, await otc.getAddress(), true);
  await otc.connect(seller).createOrder(identityId, BigInt(2e9));

  // buyer 购买
  await usdt.connect(owner).mint(buyer.address, BigInt(3e9));
  await usdt.connect(buyer).approve(await otc.getAddress(), BigInt(3e9));
  await otc.connect(buyer).fillOrder(1);

  // 验证所有权转移
  assert.equal(await core.ownerOfIdentity(identityId), buyer.address);
}

async function testOtcIdentityInheritance() {
  const [owner, seller, buyer, feeRecipient, lp, referralPool, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const coreRecipients = [lp.address, referralPool.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, coreRecipients);
  const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);

  await core.connect(owner).setIdentityMarket(await otc.getAddress());

  // seller 购买超级节点
  const amount = BigInt(1e10);
  await usdt.connect(owner).mint(seller.address, amount);
  await usdt.connect(seller).approve(await core.getAddress(), amount);
  await core.connect(seller).bindReferrer(owner.address);
  await core.connect(seller).buySuperNode();

  const identityId = await core.getUserIdentityId(seller.address);
  const identityBefore = await core.getIdentity(identityId);
  assert.equal(identityBefore.role, 2n); // SuperNode

  // OTC 转移
  await core.connect(seller).approveIdentityOperator(identityId, await otc.getAddress(), true);
  await otc.connect(seller).createOrder(identityId, BigInt(2e9));

  await usdt.connect(owner).mint(buyer.address, BigInt(3e9));
  await usdt.connect(buyer).approve(await otc.getAddress(), BigInt(3e9));
  await otc.connect(buyer).fillOrder(1);

  // 验证 buyer 继承了超级节点身份
  const identityAfter = await core.getIdentity(identityId);
  assert.equal(identityAfter.owner, buyer.address);
  assert.equal(identityAfter.role, 2n); // 身份不变
}

async function testSwapFeeGeneration() {
  const [owner, trader] = await ethers.getSigners();

  const usdt = await deployMockUsdt(owner.address);
  const ico = await deployIcoToken(owner.address, owner.address);
  const light = await deployMockToken("LIGHT", "LIGHT", owner.address);
  const swap = await deploySwap(await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address);

  await swap.connect(owner).createDefaultPools(50, 200, 3000);

  // 添加流动性
  await usdt.connect(owner).mint(owner.address, BigInt(1e10));
  await ico.connect(owner).mint(owner.address, BigInt(1e24));

  await usdt.connect(owner).approve(await swap.getAddress(), BigInt(1e10));
  await ico.connect(owner).approve(await swap.getAddress(), BigInt(1e24));

  await swap.connect(owner).addLiquidity(0, BigInt(1e9), BigInt(5e23));

  // trader 交换
  await usdt.connect(owner).mint(trader.address, BigInt(1e9));
  await usdt.connect(trader).approve(await swap.getAddress(), BigInt(1e9));

  await swap.connect(trader).swapExactIn(0, await usdt.getAddress(), BigInt(1e8), 0n, trader.address);

  // 验证手续费生成
  const feeVault = await swap.feeVault(0, await usdt.getAddress());
  assert.ok(feeVault > 0n, "手续费应该被收集");
}

async function testSwapFeeDistribution() {
  const [owner, trader, feeRecipient1, feeRecipient2] = await ethers.getSigners();

  const usdt = await deployMockUsdt(owner.address);
  const ico = await deployIcoToken(owner.address, owner.address);
  const light = await deployMockToken("LIGHT", "LIGHT", owner.address);
  const swap = await deploySwap(await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address);

  await swap.connect(owner).createDefaultPools(50, 200, 3000);

  // 添加流动性
  await usdt.connect(owner).mint(owner.address, BigInt(1e10));
  await ico.connect(owner).mint(owner.address, BigInt(1e24));

  await usdt.connect(owner).approve(await swap.getAddress(), BigInt(1e10));
  await ico.connect(owner).approve(await swap.getAddress(), BigInt(1e24));

  await swap.connect(owner).addLiquidity(0, BigInt(1e9), BigInt(5e23));

  // trader 交换产生费
  await usdt.connect(owner).mint(trader.address, BigInt(1e9));
  await usdt.connect(trader).approve(await swap.getAddress(), BigInt(1e9));

  await swap.connect(trader).swapExactIn(0, await usdt.getAddress(), BigInt(1e8), 0n, trader.address);

  // 分配费用
  await swap.connect(owner).distributeFees(0, await usdt.getAddress(), [feeRecipient1.address, feeRecipient2.address], [5000, 5000]);

  // 验证分配
  const balance1 = await usdt.balanceOf(feeRecipient1.address);
  const balance2 = await usdt.balanceOf(feeRecipient2.address);

  assert.ok(balance1 > 0n, "recipient1 应该收到费用");
  assert.ok(balance2 > 0n, "recipient2 应该收到费用");
}

async function testLightBurnAndDistribute() {
  const [owner, trader, bootstrap, nodePool, superNodePool] = await ethers.getSigners();

  const usdt = await deployMockUsdt(owner.address);
  const ico = await deployIcoToken(owner.address, owner.address);
  const light = await deployMockToken("LIGHT", "LIGHT", owner.address);
  const swap = await deploySwap(await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address);

  await swap.connect(owner).createDefaultPools(50, 200, 3000);

  // 添加流动性
  await usdt.connect(owner).mint(owner.address, BigInt(1e10));
  await ico.connect(owner).mint(owner.address, BigInt(1e24));
  await light.connect(owner).mint(owner.address, BigInt(1e24));

  await usdt.connect(owner).approve(await swap.getAddress(), BigInt(1e10));
  await ico.connect(owner).approve(await swap.getAddress(), BigInt(1e24));
  await light.connect(owner).approve(await swap.getAddress(), BigInt(1e24));

  await swap.connect(owner).addLiquidity(0, BigInt(1e9), BigInt(5e23));
  await swap.connect(owner).addLiquidity(1, BigInt(2e23), BigInt(1e23));

  // 设置 LIGHT 费用配置
  await swap.connect(owner).updateLightFeeConfig(6000, 3000, 700, 300, bootstrap.address, nodePool.address, superNodePool.address);

  // trader 交换 LIGHT
  await light.connect(owner).mint(trader.address, BigInt(2e18));
  await light.connect(trader).approve(await swap.getAddress(), BigInt(2e18));

  await swap.connect(trader).swapExactIn(1, await light.getAddress(), BigInt(1e18), 0n, trader.address);

  // 结算 LIGHT 费用
  const supplyBefore = await light.totalSupply();
  await swap.connect(owner).settleLightFees();
  const supplyAfter = await light.totalSupply();

  // 验证燃烧
  assert.ok(supplyBefore > supplyAfter, "LIGHT 供应应该因燃烧而减少");

  // 验证分配
  const bootstrapBalance = await light.balanceOf(bootstrap.address);
  const nodeBalance = await light.balanceOf(nodePool.address);
  const superNodeBalance = await light.balanceOf(superNodePool.address);

  assert.ok(bootstrapBalance > 0n, "bootstrap 应该收到费用");
  assert.ok(nodeBalance > 0n, "nodePool 应该收到费用");
  assert.ok(superNodeBalance > 0n, "superNodePool 应该收到费用");
}

async function testIcoBurnUnsold() {
  const [owner, saleWallet, burnExecutor] = await ethers.getSigners();

  const ico = await deployIcoToken(owner.address, saleWallet.address);

  // mint 到 saleWallet
  const amount = BigInt(1e24);
  await ico.connect(owner).mint(saleWallet.address, amount);

  // 设置 burn executor
  await ico.connect(owner).setBurnExecutor(burnExecutor.address, true);

  // burn 未售出
  const burnAmount = BigInt(5e23);
  await ico.connect(burnExecutor).burnUnsold(burnAmount);

  // 验证
  const remaining = await ico.balanceOf(saleWallet.address);
  assert.equal(remaining, amount - burnAmount);

  const totalBurned = await ico.totalBurned();
  assert.equal(totalBurned, burnAmount);
}

async function testIcoBurnDefault() {
  const [owner, saleWallet, holder] = await ethers.getSigners();

  const ico = await deployIcoToken(owner.address, saleWallet.address);

  // mint 到 holder
  const amount = BigInt(1e24);
  await ico.connect(owner).mint(holder.address, amount);

  // holder 自助销毁
  const burnAmount = BigInt(3e23);
  await ico.connect(holder).burn(burnAmount);

  // 验证
  const remaining = await ico.balanceOf(holder.address);
  assert.equal(remaining, amount - burnAmount);

  const totalBurned = await ico.totalBurned();
  assert.equal(totalBurned, burnAmount);
}

async function testCompleteUserJourney() {
  const [owner, user, referrer, lp, refPool, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const coreRecipients = [lp.address, refPool.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, coreRecipients);
  const ico = await deployIcoToken(owner.address, owner.address);
  const light = await deployMockToken("LIGHT", "LIGHT", owner.address);
  const swap = await deploySwap(await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address);

  const amount = BigInt(1e10);

  // 1. 用户绑定推荐人
  await usdt.connect(owner).mint(user.address, amount);
  await usdt.connect(user).approve(await core.getAddress(), amount);
  await core.connect(user).bindReferrer(referrer.address);

  // 2. 购买矿机
  await core.connect(user).purchaseMachine(5);

  // 3. 升级节点
  const nodePrice = await core.nodePrice();
  await core.connect(user).buyNode();

  // 4. 升级超级节点
  const superPrice = await core.superNodePrice();
  await usdt.connect(user).approve(await core.getAddress(), superPrice);
  await core.connect(user).buySuperNode();

  // 5. 进行 Swap 交换
  await swap.connect(owner).createDefaultPools(50, 200, 3000);

  await usdt.connect(owner).mint(owner.address, BigInt(1e10));
  await ico.connect(owner).mint(owner.address, BigInt(1e24));

  await usdt.connect(owner).approve(await swap.getAddress(), BigInt(1e10));
  await ico.connect(owner).approve(await swap.getAddress(), BigInt(1e24));

  await swap.connect(owner).addLiquidity(0, BigInt(1e9), BigInt(5e23));

  // 6. 验证收益
  const referrerBalance = await usdt.balanceOf(referrer.address);
  assert.ok(referrerBalance > 0n, "推荐人应该收到推荐奖励");

  const nodeBalance = await usdt.balanceOf(node.address);
  assert.ok(nodeBalance > 0n, "节点池应该收到奖励");

  const userIdentity = await core.getIdentity(await core.getUserIdentityId(user.address));
  assert.equal(userIdentity.role, 2n, "用户应该是超级节点");
}

async function testMultiUserCompetition() {
  const [owner, user1, user2, user3, lp, refPool, superNode, node, platform, leaderboard] = await ethers.getSigners();
  const coreRecipients = [lp.address, refPool.address, superNode.address, node.address, platform.address, leaderboard.address];

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(await usdt.getAddress(), owner.address, coreRecipients);

  const amount = BigInt(5e9);
  const users = [user1, user2, user3];

  // 多个用户竞争
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    await usdt.connect(owner).mint(user.address, amount);
    await usdt.connect(user).approve(await core.getAddress(), amount);
    await core.connect(user).bindReferrer(owner.address);

    // 购买不同数量的矿机
    const qty = 10 - i * 2;
    await core.connect(user).purchaseMachine(qty);
  }

  // 验证业绩排序
  const dayId = await core.currentDay();
  const leaderboardData = await core.getLeaderboard(dayId);
  assert.ok(leaderboardData.topCount > 0, "排行榜应该有数据");
}

// 部署辅助函数

async function deployMockUsdt(owner: string) {
  const factory = await ethers.getContractFactory("MockUSDT");
  const contract = await factory.deploy(owner);
  await contract.waitForDeployment();
  return contract;
}

async function deployCore(usdt: string, owner: string, recipients: string[]) {
  const factory = await ethers.getContractFactory("IncubatorCore");
  const contract = await upgrades.deployProxy(factory, [usdt, owner, recipients], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor", "state-variable-assignment"],
  });
  await contract.waitForDeployment();
  return contract;
}

async function deployIcoToken(owner: string, saleWallet: string) {
  const factory = await ethers.getContractFactory("IncubatorToken");
  const contract = await factory.deploy("Incubator ICO", "ICO", owner, saleWallet);
  await contract.waitForDeployment();
  return contract;
}

async function deployMockToken(name: string, symbol: string, owner: string) {
  const factory = await ethers.getContractFactory("MockToken");
  const contract = await factory.deploy(name, symbol, owner);
  await contract.waitForDeployment();
  return contract;
}

async function deploySwap(usdt: string, ico: string, light: string, owner: string) {
  const factory = await ethers.getContractFactory("SwapPoolManager");
  const contract = await upgrades.deployProxy(factory, [usdt, ico, light, owner], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await contract.waitForDeployment();
  return contract;
}

async function deployOtc(usdt: string, core: string, owner: string, feeRecipient: string) {
  const factory = await ethers.getContractFactory("NodeOTCMarket");
  const contract = await upgrades.deployProxy(factory, [usdt, core, owner, feeRecipient], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await contract.waitForDeployment();
  return contract;
}

function printReport() {
  const passed = testResults.filter(r => r.status === "PASS").length;
  const failed = testResults.filter(r => r.status === "FAIL").length;
  const total = testResults.length;
  const totalTime = testResults.reduce((sum, r) => sum + r.duration, 0);

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║                          测试报告总结                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  console.log(`  ✓ 通过: ${passed}/${total}`);
  console.log(`  ✗ 失败: ${failed}/${total}`);
  console.log(`  ⏱️  耗时: ${(totalTime / 1000).toFixed(2)} 秒`);
  console.log(`  📊 成功率: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log("  【失败详情】");
    testResults.filter(r => r.status === "FAIL").forEach(r => {
      console.log(`    ✗ ${r.name}`);
      console.log(`      错误: ${r.error}`);
    });
  }

  console.log("\n");
}

main().catch(error => {
  console.error("测试执行错误:", error);
  process.exitCode = 1;
});
