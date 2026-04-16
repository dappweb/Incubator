import { ethers, upgrades } from "hardhat";
import * as assert from "node:assert/strict";

describe("IncubatorCore", function () {
  it("splits machine orders and upgrades identity roles", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 10_000_000_000n);

    // Must bind referrer before purchasing
    await assert.rejects(
      core.connect(buyer).purchaseMachine(2),
      /bind referrer first/,
    );

    await core.connect(buyer).bindReferrer(owner.address);

    const machineAmount = 2n * 100_000_000n;

    const beforeBalances = await Promise.all([
      usdt.balanceOf(lp.address),
      usdt.balanceOf(referral.address),
      usdt.balanceOf(superPool.address),
      usdt.balanceOf(nodePool.address),
      usdt.balanceOf(platform.address),
      usdt.balanceOf(leaderboard.address),
    ]);

    await core.connect(buyer).purchaseMachine(2);

    const order = await core.getMachineOrder(1);
    assert.equal(order.quantity, 2n);
    assert.equal(order.amountUSDT, machineAmount);

    const afterBalances = await Promise.all([
      usdt.balanceOf(lp.address),
      usdt.balanceOf(referral.address),
      usdt.balanceOf(superPool.address),
      usdt.balanceOf(nodePool.address),
      usdt.balanceOf(platform.address),
      usdt.balanceOf(leaderboard.address),
    ]);

    assert.equal(afterBalances[0] - beforeBalances[0], 120_000_000n);  // 60% liquidity
    // Referral 5% goes to bound referrer (owner.address), not the referral pool address
    assert.equal(afterBalances[1] - beforeBalances[1], 0n);           // referral pool gets 0
    assert.equal(afterBalances[2] - beforeBalances[2], 10_000_000n);  // 5% superNode pool accrual
    assert.equal(afterBalances[3] - beforeBalances[3], 16_000_000n);  // 8% node pool accrual
    assert.equal(afterBalances[4] - beforeBalances[4], 40_000_000n);  // 20% platform
    assert.equal(afterBalances[5] - beforeBalances[5], 4_000_000n);   // 2% leaderboard pool accrual

    assert.equal(await core.roles(buyer.address), 0n);

    const nodePoolBeforeRoleBuys = await usdt.balanceOf(nodePool.address);
    const superPoolBeforeRoleBuys = await usdt.balanceOf(superPool.address);

    await core.connect(buyer).buyNode();
    assert.equal(await core.roles(buyer.address), 1n);

    await core.connect(buyer).buySuperNode();
    assert.equal(await core.roles(buyer.address), 2n);

    assert.equal(await usdt.balanceOf(nodePool.address), nodePoolBeforeRoleBuys);
    assert.equal(await usdt.balanceOf(superPool.address), superPoolBeforeRoleBuys);
  });

  it("blocks purchases while paused", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await usdt.connect(owner).mint(buyer.address, 1_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 1_000_000_000n);

    await core.connect(owner).pause();

    await assert.rejects(core.connect(buyer).purchaseMachine(1));
    await assert.rejects(core.connect(buyer).buyNode());
  });

  it("rejects purchase without binding referrer", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 10_000_000_000n);

    // All purchase functions require explicit referrer binding
    await assert.rejects(core.connect(buyer).purchaseMachine(1), /bind referrer first/);
    await assert.rejects(core.connect(buyer).buyNode(), /bind referrer first/);

    // Bind referrer, then purchases should work
    await core.connect(buyer).bindReferrer(owner.address);
    await core.connect(buyer).purchaseMachine(1);
    await core.connect(buyer).buyNode();
    assert.equal(await core.roles(buyer.address), 1n);
  });

  it("allows direct super node purchase without prior node", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 10_000_000_000n);

    await core.connect(buyer).bindReferrer(owner.address);
    await core.connect(buyer).buySuperNode();

    assert.equal(await core.roles(buyer.address), 2n);
    const identityId = await core.getUserIdentityId(buyer.address);
    const identity = await core.getIdentity(identityId);
    assert.equal(identity.role, 2n);
  });

  it("tracks multi-level referral relationships and dynamic reward stats", async function () {
    const [owner, alice, bob, carol, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    // Build a 3-level referral chain: alice <- bob <- carol
    await core.connect(bob).bindReferrer(alice.address);
    await core.connect(carol).bindReferrer(bob.address);

    // Relationship checks
    assert.equal(await core.referralOf(bob.address), alice.address);
    assert.equal(await core.referralOf(carol.address), bob.address);
    assert.equal(await core.directReferralCount(alice.address), 1n);
    assert.equal(await core.directReferralCount(bob.address), 1n);
    // teamTotalMemberCount tracks indirect team only (excluding direct referrals)
    assert.equal(await core.teamTotalMemberCount(alice.address), 1n);
    assert.equal(await core.teamTotalMemberCount(bob.address), 0n);

    // Carol purchases, dynamic reward stats should flow to bob (direct) and alice (team)
    await usdt.connect(owner).mint(carol.address, 1_000_000_000n);
    await usdt.connect(carol).approve(await core.getAddress(), 1_000_000_000n);

    const bobUsdtBefore = await usdt.balanceOf(bob.address);
    await core.connect(carol).purchaseMachine(1); // 100 USDT
    const bobUsdtAfter = await usdt.balanceOf(bob.address);

    // Direct referrer gets 5% of order amount
    assert.equal(bobUsdtAfter - bobUsdtBefore, 5_000_000n);
    // Dynamic statistics update on referrer/upline chain
    assert.equal(await core.directReferralVolume(bob.address), 100_000_000n);
    // teamTotalVolume also tracks upline volume (excluding direct referral owner)
    assert.equal(await core.teamTotalVolume(alice.address), 100_000_000n);
    assert.equal(await core.teamTotalVolume(bob.address), 0n);
  });

  it("distributes static rewards to configured pool addresses with fixed bps", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await core.connect(buyer).bindReferrer(owner.address);
    await usdt.connect(owner).mint(buyer.address, 1_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 1_000_000_000n);

    const before = await Promise.all([
      usdt.balanceOf(lp.address),
      usdt.balanceOf(superPool.address),
      usdt.balanceOf(nodePool.address),
      usdt.balanceOf(platform.address),
      usdt.balanceOf(leaderboard.address),
    ]);

    await core.connect(buyer).purchaseMachine(1); // 100 USDT

    const after = await Promise.all([
      usdt.balanceOf(lp.address),
      usdt.balanceOf(superPool.address),
      usdt.balanceOf(nodePool.address),
      usdt.balanceOf(platform.address),
      usdt.balanceOf(leaderboard.address),
    ]);

    // Static pool allocations from 100 USDT order (6 decimals)
    assert.equal(after[0] - before[0], 60_000_000n); // Liquidity 60%
    assert.equal(after[1] - before[1], 5_000_000n);  // Super pool 5%
    assert.equal(after[2] - before[2], 8_000_000n);  // Node pool 8%
    assert.equal(after[3] - before[3], 20_000_000n); // Platform 20%
    assert.equal(after[4] - before[4], 2_000_000n);  // Leaderboard 2%
  });

  it("applies 30/20/50 referral cycle for node purchases regardless of referrer role", async function () {
    const [owner, nodeReferrer, superReferrer, buyerA, buyerB, buyerC, buyerD, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    const fundAndApprove = async (account: any, amount: bigint) => {
      await usdt.connect(owner).mint(account.address, amount);
      await usdt.connect(account).approve(coreAddr, amount);
    };

    for (const account of [nodeReferrer, superReferrer, buyerA, buyerB, buyerC, buyerD]) {
      await fundAndApprove(account, 20_000_000_000n);
    }

    await core.connect(nodeReferrer).bindReferrer(owner.address);
    await core.connect(nodeReferrer).buyNode();

    await core.connect(superReferrer).bindReferrer(owner.address);
    await core.connect(superReferrer).buySuperNode();

    const nodeReferrerBefore = await usdt.balanceOf(nodeReferrer.address);
    const lpBeforeNode = await usdt.balanceOf(lp.address);

    await core.connect(buyerA).bindReferrer(nodeReferrer.address);
    await core.connect(buyerA).buyNode();
    await core.connect(buyerB).bindReferrer(nodeReferrer.address);
    await core.connect(buyerB).buyNode();
    await core.connect(buyerC).bindReferrer(nodeReferrer.address);
    await core.connect(buyerC).buyNode();

    const nodeReferrerAfter = await usdt.balanceOf(nodeReferrer.address);
    const lpAfterNode = await usdt.balanceOf(lp.address);

    assert.equal(nodeReferrerAfter - nodeReferrerBefore, 1_000_000_000n);
    assert.equal(lpAfterNode - lpBeforeNode, 1_340_000_000n);
    assert.equal(await core.directNodeReferralCount(nodeReferrer.address), 3n);

    const superReferrerBefore = await usdt.balanceOf(superReferrer.address);
    const lpBeforeSuperReferrer = await usdt.balanceOf(lp.address);

    await core.connect(buyerD).bindReferrer(superReferrer.address);
    await core.connect(buyerD).buyNode();

    const superReferrerAfter = await usdt.balanceOf(superReferrer.address);
    const lpAfterSuperReferrer = await usdt.balanceOf(lp.address);

    assert.equal(superReferrerAfter - superReferrerBefore, 300_000_000n);
    assert.equal(lpAfterSuperReferrer - lpBeforeSuperReferrer, 480_000_000n);
    assert.equal(await core.directNodeReferralCount(superReferrer.address), 1n);
  });

  it("pays fixed 20 percent referral for super-node purchases regardless of referrer role", async function () {
    const [owner, nodeReferrer, superReferrer, buyerA, buyerB, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    const fundAndApprove = async (account: any, amount: bigint) => {
      await usdt.connect(owner).mint(account.address, amount);
      await usdt.connect(account).approve(coreAddr, amount);
    };

    for (const account of [nodeReferrer, superReferrer, buyerA, buyerB]) {
      await fundAndApprove(account, 30_000_000_000n);
    }

    await core.connect(nodeReferrer).bindReferrer(owner.address);
    await core.connect(nodeReferrer).buyNode();

    await core.connect(superReferrer).bindReferrer(owner.address);
    await core.connect(superReferrer).buySuperNode();

    const nodeReferrerBefore = await usdt.balanceOf(nodeReferrer.address);
    const superReferrerBefore = await usdt.balanceOf(superReferrer.address);
    const lpBefore = await usdt.balanceOf(lp.address);

    await core.connect(buyerA).bindReferrer(nodeReferrer.address);
    await core.connect(buyerA).buySuperNode();
    await core.connect(buyerB).bindReferrer(superReferrer.address);
    await core.connect(buyerB).buySuperNode();

    const nodeReferrerAfter = await usdt.balanceOf(nodeReferrer.address);
    const superReferrerAfter = await usdt.balanceOf(superReferrer.address);
    const lpAfter = await usdt.balanceOf(lp.address);

    assert.equal(nodeReferrerAfter - nodeReferrerBefore, 600_000_000n);
    assert.equal(superReferrerAfter - superReferrerBefore, 600_000_000n);
    assert.equal(lpAfter - lpBefore, 3_480_000_000n);
    assert.equal(await core.directSuperNodeReferralCount(nodeReferrer.address), 1n);
    assert.equal(await core.directSuperNodeReferralCount(superReferrer.address), 1n);
  });

  it("does not fund node or super-node pools from role purchases", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 10_000_000_000n);
    await core.connect(buyer).bindReferrer(owner.address);

    const superPoolBefore = await usdt.balanceOf(superPool.address);
    const nodePoolBefore = await usdt.balanceOf(nodePool.address);

    await core.connect(buyer).buyNode();
    await core.connect(buyer).buySuperNode();

    assert.equal(await usdt.balanceOf(superPool.address), superPoolBefore);
    assert.equal(await usdt.balanceOf(nodePool.address), nodePoolBefore);
  });

  it("settles daily rewards manually and enforces same-day ifDue idempotency", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    await usdt.connect(owner).mint(buyer.address, 2_000_000_000n);
    await usdt.connect(owner).mint(owner.address, 2_000_000_000n);
    await usdt.connect(buyer).approve(coreAddr, 2_000_000_000n);
    await usdt.connect(owner).approve(coreAddr, 2_000_000_000n);

    await core.connect(buyer).bindReferrer(owner.address);
    await core.connect(buyer).purchaseMachine(1);

    await core.connect(owner).fundRewardPool(1_000_000_000n);
    const poolBefore = await core.rewardPoolBalance();
    assert.equal(poolBefore, 1_000_000_000n);

    await core.connect(owner).settleDailyRewardsManual([buyer.address]);

    const orderProgress = await core.getOrderRewardProgress(1);
    assert.equal(orderProgress.staticPaid, 5_760_000n);
    assert.equal(orderProgress.dynamicPaid, 0n);
    assert.equal(orderProgress.remainingCap, 294_240_000n);
    assert.equal(orderProgress.exited, false);

    // 2% release from 1000 USDT => 20 USDT; burn 10.4 USDT, reward 9.6 USDT.
    // With no dynamic denominator, only static 60% (5.76 USDT) is distributed and 3.84 USDT is carried back.
    assert.equal(await core.rewardPoolBalance(), 983_840_000n);

    const canSettleAgainSameDay = await core.connect(owner).settleDailyRewardsIfDue.staticCall([buyer.address]);
    assert.equal(canSettleAgainSameDay, false);

    await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);

    const canSettleNextDay = await core.connect(owner).settleDailyRewardsIfDue.staticCall([buyer.address]);
    assert.equal(canSettleNextDay, true);
  });

  it("distributes daily dynamic rewards by team volume ratio", async function () {
    const [owner, alice, bob, aliceMid, aliceLeaf, bobMid, bobLeafA, bobLeafB, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    const participants = [alice, bob, aliceMid, aliceLeaf, bobMid, bobLeafA, bobLeafB];
    for (const user of participants) {
      await usdt.connect(owner).mint(user.address, 3_000_000_000n);
      await usdt.connect(user).approve(coreAddr, 3_000_000_000n);
    }
    await usdt.connect(owner).mint(owner.address, 2_000_000_000n);
    await usdt.connect(owner).approve(coreAddr, 2_000_000_000n);

    await core.connect(alice).bindReferrer(owner.address);
    await core.connect(bob).bindReferrer(owner.address);
    await core.connect(aliceMid).bindReferrer(alice.address);
    await core.connect(aliceLeaf).bindReferrer(aliceMid.address);
    await core.connect(bobMid).bindReferrer(bob.address);
    await core.connect(bobLeafA).bindReferrer(bobMid.address);
    await core.connect(bobLeafB).bindReferrer(bobMid.address);

    // Participants each own one machine order (orderId 1 and 2) for static split.
    await core.connect(alice).purchaseMachine(1);
    await core.connect(bob).purchaseMachine(1);

    // Build dynamic weights through indirect downlines:
    // alice team = 100 USDT, bob team = 300 USDT.
    await core.connect(aliceLeaf).purchaseMachine(1);
    await core.connect(bobLeafA).purchaseMachine(1);
    await core.connect(bobLeafB).purchaseMachine(2);

    assert.equal(await core.teamTotalVolume(alice.address), 100_000_000n);
    assert.equal(await core.teamTotalVolume(bob.address), 300_000_000n);

    await core.connect(owner).fundRewardPool(1_000_000_000n);
    await core.connect(owner).settleDailyRewardsManual([alice.address, bob.address]);

    const aliceOrder = await core.getOrderRewardProgress(1);
    const bobOrder = await core.getOrderRewardProgress(2);

    // Static pool = 5.76 USDT, equal power => 2.88 + 2.88.
    // Dynamic pool = 3.84 USDT, team ratio 1:3 => 0.96 + 2.88.
    assert.equal(aliceOrder.staticPaid, 2_880_000n);
    assert.equal(aliceOrder.dynamicPaid, 960_000n);
    assert.equal(bobOrder.staticPaid, 2_880_000n);
    assert.equal(bobOrder.dynamicPaid, 2_880_000n);
  });

  it("rejects price updates that exceed allowed maximums", async function () {
    const [owner, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    // Machine max = 10_000 USDT (10_000 * 1e6)
    await assert.rejects(
      core.connect(owner).updateMachineUnitPrice(10_001n * 1_000_000n),
      /invalid price/,
    );
    // Node max = 100_000 USDT
    await assert.rejects(
      core.connect(owner).updateNodePrice(100_001n * 1_000_000n),
      /invalid price/,
    );
    // SuperNode max = 300_000 USDT
    await assert.rejects(
      core.connect(owner).updateSuperNodePrice(300_001n * 1_000_000n),
      /invalid price/,
    );
    // Zero is also invalid
    await assert.rejects(core.connect(owner).updateMachineUnitPrice(0n), /invalid price/);

    // Valid updates must succeed
    await core.connect(owner).updateMachineUnitPrice(200n * 1_000_000n);
    assert.equal(await core.machineUnitPrice(), 200n * 1_000_000n);
  });

  it("prevents duplicate node and super-node purchases", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    await usdt.connect(owner).mint(buyer.address, 100_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 100_000_000_000n);
    await core.connect(buyer).bindReferrer(owner.address);

    await core.connect(buyer).buyNode();
    // Second buyNode must fail — role is already Node
    await assert.rejects(core.connect(buyer).buyNode(), /already has role/);

    await core.connect(buyer).buySuperNode();
    // buySuperNode again must fail — already SuperNode
    await assert.rejects(core.connect(buyer).buySuperNode(), /already a super node/);
  });

  it("enforces pool share invariant when updating individual shares", async function () {
    const [owner, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    // Any single-pool change breaks the 10000 invariant (all 6 pools must stay at exactly 10000 BPS)
    await assert.rejects(
      core.connect(owner).updatePoolShare(0, 6001), /invalid pool total/,
    );
    await assert.rejects(
      core.connect(owner).updatePoolShare(0, 5900), /invalid pool total/,
    );

    // Setting a pool to its exact current value is a no-op — total stays at 10000
    await core.connect(owner).updatePoolShare(0, 6000);
    const [, liquidityBps] = await core.getPoolConfig(0);
    assert.equal(liquidityBps, 6000n);
  });

  it("settles leaderboard pool to on-chain top users when using self-custody", async function () {
    const [owner, alice, bob, lp, referral, superPool, nodePool, platform] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);

    // Set Leaderboard recipient to address(this) by using core contract address as placeholder —
    // we deploy with the core address itself so poolAccumulated receives the leaderboard funds.
    const factory = await ethers.getContractFactory("IncubatorCore");
    // Use a temp address first, then update after deployment
    const core: any = await upgrades.deployProxy(
      factory,
      [await usdt.getAddress(), owner.address,
        [lp.address, referral.address, superPool.address, nodePool.address, platform.address, owner.address]],
      { kind: "uups", initializer: "initialize", unsafeAllow: ["constructor", "state-variable-assignment"] },
    );
    await core.waitForDeployment();
    const coreAddr = await core.getAddress();

    // Update leaderboard pool recipient to address(this) = coreAddr
    await core.connect(owner).updatePoolRecipient(5, coreAddr);

    await usdt.connect(owner).mint(alice.address, 10_000_000_000n);
    await usdt.connect(owner).mint(bob.address, 10_000_000_000n);
    await usdt.connect(alice).approve(coreAddr, 10_000_000_000n);
    await usdt.connect(bob).approve(coreAddr, 10_000_000_000n);

    await core.connect(alice).bindReferrer(owner.address);
    await core.connect(bob).bindReferrer(owner.address);

    // alice buys 5 machines (500 USDT → 2% = 10 USDT leaderboard)
    await core.connect(alice).purchaseMachine(5);
    // bob buys 2 machines (200 USDT → 2% = 4 USDT leaderboard)
    await core.connect(bob).purchaseMachine(2);

    const accumulated = await core.poolAccumulated(5); // PoolType.Leaderboard = 5
    assert.equal(accumulated, 14_000_000n); // (10+4) USDT * 1e6

    const dayId = await core.currentDay();
    const aliceBefore = await usdt.balanceOf(alice.address);
    const bobBefore = await usdt.balanceOf(bob.address);

    await core.connect(owner).settleLeaderboard(dayId);

    assert.equal(await core.poolAccumulated(5), 0n);
    // Alice had more volume, so she should be rank 0 and get the larger share
    const aliceAfter = await usdt.balanceOf(alice.address);
    const bobAfter = await usdt.balanceOf(bob.address);
    assert.ok(aliceAfter > aliceBefore);
    assert.ok(bobAfter > bobBefore);
    assert.equal((aliceAfter - aliceBefore) + (bobAfter - bobBefore), accumulated);
  });

  it("tracks lucky leaderboard by latest 10 orders including duplicate buyers", async function () {
    const [owner, alice, bob, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    await usdt.connect(owner).mint(alice.address, 10_000_000_000n);
    await usdt.connect(owner).mint(bob.address, 10_000_000_000n);
    await usdt.connect(alice).approve(coreAddr, 10_000_000_000n);
    await usdt.connect(bob).approve(coreAddr, 10_000_000_000n);

    await core.connect(alice).bindReferrer(owner.address);
    await core.connect(bob).bindReferrer(owner.address);

    await core.connect(alice).purchaseMachine(1);
    await core.connect(bob).purchaseMachine(1);
    await core.connect(alice).purchaseMachine(1);

    const dayId = await core.currentDay();
    const board = await core.getLeaderboard(dayId);

    assert.equal(board.lastCount, 3n);
    assert.equal(board.lastUsers[0], alice.address);
    assert.equal(board.lastUsers[1], bob.address);
    assert.equal(board.lastUsers[2], alice.address);
  });

  it("uses first order time as tie-breaker when top volumes are equal", async function () {
    const [owner, alice, bob, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    await usdt.connect(owner).mint(alice.address, 10_000_000_000n);
    await usdt.connect(owner).mint(bob.address, 10_000_000_000n);
    await usdt.connect(alice).approve(coreAddr, 10_000_000_000n);
    await usdt.connect(bob).approve(coreAddr, 10_000_000_000n);

    await core.connect(alice).bindReferrer(owner.address);
    await core.connect(bob).bindReferrer(owner.address);

    await core.connect(alice).purchaseMachine(2);
    await core.connect(bob).purchaseMachine(2);

    const dayId = await core.currentDay();
    const board = await core.getLeaderboard(dayId);

    assert.equal(board.topCount, 2n);
    assert.equal(board.topVolumes[0], board.topVolumes[1]);
    assert.equal(board.topUsers[0], alice.address);
    assert.equal(board.topUsers[1], bob.address);
  });

  it("applies whitelist adjustment by deducting first-rank share on top and lucky pools", async function () {
    const [owner, alice, bob, white, lp, referral, superPool, nodePool, platform] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);

    const factory = await ethers.getContractFactory("IncubatorCore");
    const core: any = await upgrades.deployProxy(
      factory,
      [await usdt.getAddress(), owner.address,
        [lp.address, referral.address, superPool.address, nodePool.address, platform.address, owner.address]],
      { kind: "uups", initializer: "initialize", unsafeAllow: ["constructor", "state-variable-assignment"] },
    );
    await core.waitForDeployment();
    const coreAddr = await core.getAddress();

    await core.connect(owner).updatePoolRecipient(5, coreAddr);
    await core.connect(owner).setLeaderboardWhitelist([white.address]);
    await core.connect(owner).setLeaderboardWhitelistAdjustPct(10);

    await usdt.connect(owner).mint(alice.address, 10_000_000_000n);
    await usdt.connect(owner).mint(bob.address, 10_000_000_000n);
    await usdt.connect(alice).approve(coreAddr, 10_000_000_000n);
    await usdt.connect(bob).approve(coreAddr, 10_000_000_000n);

    await core.connect(alice).bindReferrer(owner.address);
    await core.connect(bob).bindReferrer(owner.address);

    await core.connect(alice).purchaseMachine(5);
    await core.connect(bob).purchaseMachine(2);

    const accumulated = await core.poolAccumulated(5);
    assert.equal(accumulated, 14_000_000n);

    const dayId = await core.currentDay();
    const aliceBefore = await usdt.balanceOf(alice.address);
    const bobBefore = await usdt.balanceOf(bob.address);
    const whiteBefore = await usdt.balanceOf(white.address);

    await core.connect(owner).settleLeaderboard(dayId);

    const aliceDelta = (await usdt.balanceOf(alice.address)) - aliceBefore;
    const bobDelta = (await usdt.balanceOf(bob.address)) - bobBefore;
    const whiteDelta = (await usdt.balanceOf(white.address)) - whiteBefore;

    assert.equal(whiteDelta, 1_400_000n);
    assert.equal(aliceDelta, 7_560_000n);
    assert.equal(bobDelta, 5_040_000n);
    assert.equal(aliceDelta + bobDelta + whiteDelta, accumulated);
  });

  it("settles node and super-node pool with provided BPS list", async function () {
    const [owner, alice, bob, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    // Set Node & SuperNode pool recipients to address(this)
    await core.connect(owner).updatePoolRecipient(3, coreAddr); // Node pool
    await core.connect(owner).updatePoolRecipient(2, coreAddr); // SuperNode pool

    await usdt.connect(owner).mint(alice.address, 10_000_000_000n);
    await usdt.connect(alice).approve(coreAddr, 10_000_000_000n);
    await core.connect(alice).bindReferrer(owner.address);
    await core.connect(alice).purchaseMachine(10); // 1000 USDT → node 8% = 80, superNode 5% = 50

    const nodeAccumulated = await core.poolAccumulated(3);
    const superAccumulated = await core.poolAccumulated(2);
    assert.equal(nodeAccumulated, 80_000_000n);
    assert.equal(superAccumulated, 50_000_000n);

    // Settle node pool 60/40 split between alice and bob
    const aliceBefore = await usdt.balanceOf(alice.address);
    const bobBefore = await usdt.balanceOf(bob.address);
    await core.connect(owner).settleNodeRewards(
      [alice.address, bob.address],
      [6000, 4000],
    );
    assert.equal(await core.poolAccumulated(3), 0n);
    assert.equal((await usdt.balanceOf(alice.address)) - aliceBefore, 48_000_000n); // 60% of 80
    assert.equal((await usdt.balanceOf(bob.address)) - bobBefore, 32_000_000n);    // 40% of 80

    // settleNodeRewards with bad shares must fail even when balance is zero (input validation first)
    await assert.rejects(
      core.connect(owner).settleNodeRewards([alice.address], [9999]),
      /shares must sum to 10000/,
    );

    // Settle super-node pool entirely to alice
    await core.connect(owner).settleSuperNodeRewards([alice.address], [10000]);
    assert.equal(await core.poolAccumulated(2), 0n);
  });

  it("stores sub-admins on-chain and supports add/remove", async function () {
    const [owner, subAdmin, outsider, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    assert.equal(await core.subAdmins(subAdmin.address), false);
    assert.equal(await core.isOwnerOrSubAdmin(owner.address), true);
    assert.equal(await core.isOwnerOrSubAdmin(subAdmin.address), false);

    await core.connect(owner).setSubAdmin(subAdmin.address, true);
    assert.equal(await core.subAdmins(subAdmin.address), true);
    assert.equal(await core.isOwnerOrSubAdmin(subAdmin.address), true);

    const listAfterAdd = await core.getSubAdmins();
    assert.equal(listAfterAdd.length, 1);
    assert.equal(listAfterAdd[0], subAdmin.address);

    await assert.rejects(
      core.connect(outsider).setSubAdmin(subAdmin.address, false),
    );

    await core.connect(owner).setSubAdmin(subAdmin.address, false);
    assert.equal(await core.subAdmins(subAdmin.address), false);
    assert.equal(await core.isOwnerOrSubAdmin(subAdmin.address), false);

    const listAfterRemove = await core.getSubAdmins();
    assert.equal(listAfterRemove.length, 0);
  });

  it("preserves state across UUPS upgrade", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await usdt.connect(owner).mint(buyer.address, 1_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 1_000_000_000n);
    await core.connect(buyer).bindReferrer(owner.address);
    await core.connect(buyer).purchaseMachine(1);

    const orderBefore = await core.getMachineOrder(1);

    // Upgrade to a new implementation (same contract = no-op upgrade, valid for state check)
    const factory = await ethers.getContractFactory("IncubatorCore");
    const upgraded: any = await upgrades.upgradeProxy(await core.getAddress(), factory, {
      kind: "uups",
      unsafeAllow: ["constructor", "state-variable-assignment"],
    });

    const orderAfter = await upgraded.getMachineOrder(1);
    assert.equal(orderAfter.quantity, orderBefore.quantity);
    assert.equal(orderAfter.amountUSDT, orderBefore.amountUSDT);
    assert.equal(await upgraded.roles(buyer.address), 0n);
  });
});

async function deployMockUsdt(initialOwner: string) {
  const factory = await ethers.getContractFactory("MockUSDT");
  const contract = await factory.deploy(initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployCore(usdtAddress: string, owner: string, recipients: string[]) {
  const factory = await ethers.getContractFactory("IncubatorCore");
  const contract = await upgrades.deployProxy(factory, [usdtAddress, owner, recipients], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor", "state-variable-assignment"],
  });
  await contract.waitForDeployment();
  return contract;
}