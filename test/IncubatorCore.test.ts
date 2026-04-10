import * as assert from "node:assert/strict";
import { ethers, upgrades } from "hardhat";

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