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

    await core.connect(buyer).buyNode();
    assert.equal(await core.roles(buyer.address), 1n);

    await core.connect(buyer).buySuperNode();
    assert.equal(await core.roles(buyer.address), 2n);
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