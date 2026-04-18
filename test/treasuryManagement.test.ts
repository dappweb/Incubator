import { ethers, upgrades } from "hardhat";
import * as assert from "node:assert/strict";

async function deployMockUsdt(owner: string) {
  const factory = await ethers.getContractFactory("MockUSDT");
  const contract = await factory.deploy(owner);
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

async function setupCoreWithAccumulatedPool() {
  const [owner, buyer, other, lp, referral, superPool, nodePool, platform, leaderboard] =
    await ethers.getSigners();

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(
    await usdt.getAddress(),
    owner.address,
    [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
  );

  await usdt.connect(owner).mint(buyer.address, 100_000_000_000n);
  await usdt.connect(buyer).approve(await core.getAddress(), 100_000_000_000n);

  // Route Node pool into the contract itself so balance accumulates on-chain
  await core.connect(owner).updatePoolRecipient(3, await core.getAddress());

  await core.connect(buyer).bindReferrer(owner.address);
  // Each machine = 100 USDT, Node pool = 8%. Buy 5 -> 500 USDT order -> 40 USDT into poolAccumulated[3].
  await core.connect(buyer).purchaseMachine(5);

  return { owner, buyer, other, usdt, core };
}

describe("treasury management", function () {
  it("getTreasuryStatus reflects pool accumulation and free balance", async function () {
    const { usdt, core } = await setupCoreWithAccumulatedPool();
    const status = await core.getTreasuryStatus();
    const onChainBal: bigint = await usdt.balanceOf(await core.getAddress());
    const poolNode: bigint = await core.poolAccumulated(3);

    assert.equal(status.usdtBalance, onChainBal);
    assert.equal(status.reservedForPools, poolNode);
    assert.equal(status.freeUSDT, onChainBal - poolNode);
  });

  it("withdrawUSDT blocks withdrawing below pool reserve", async function () {
    const { owner, other, core } = await setupCoreWithAccumulatedPool();
    const poolNode: bigint = await core.poolAccumulated(3);
    await assert.rejects(core.connect(owner).withdrawUSDT(other.address, poolNode + 1n));
  });

  it("withdrawUSDT succeeds for free balance (=0 here, forces 0 or incidental deposit)", async function () {
    const { owner, other, usdt, core } = await setupCoreWithAccumulatedPool();
    // Add an extra 10 USDT as incidental deposit
    await usdt.connect(owner).mint(await core.getAddress(), 10_000_000n);
    const before: bigint = await usdt.balanceOf(other.address);
    await core.connect(owner).withdrawUSDT(other.address, 10_000_000n);
    const after: bigint = await usdt.balanceOf(other.address);
    assert.equal(after - before, 10_000_000n);
  });

  it("withdrawAccumulatedPool decreases ledger and transfers", async function () {
    const { owner, other, usdt, core } = await setupCoreWithAccumulatedPool();
    const poolBefore: bigint = await core.poolAccumulated(3);
    assert.ok(poolBefore > 0n);

    const recipientBefore: bigint = await usdt.balanceOf(other.address);
    await core.connect(owner).withdrawAccumulatedPool(3, other.address, poolBefore);
    const recipientAfter: bigint = await usdt.balanceOf(other.address);
    assert.equal(recipientAfter - recipientBefore, poolBefore);
    assert.equal(await core.poolAccumulated(3), 0n);
  });

  it("withdrawAccumulatedPool rejects over-draw", async function () {
    const { owner, other, core } = await setupCoreWithAccumulatedPool();
    const pool: bigint = await core.poolAccumulated(3);
    await assert.rejects(core.connect(owner).withdrawAccumulatedPool(3, other.address, pool + 1n));
  });

  it("emergencyWithdrawUSDT requires paused", async function () {
    const { owner, other, core } = await setupCoreWithAccumulatedPool();
    await assert.rejects(core.connect(owner).emergencyWithdrawUSDT(other.address, 1_000_000n));

    await core.connect(owner).pause();
    // Now allowed, can dip into any amount up to balance
    const poolBefore: bigint = await core.poolAccumulated(3);
    await core.connect(owner).emergencyWithdrawUSDT(other.address, poolBefore);
    // Note: poolAccumulated ledger is NOT auto-adjusted by emergency path on purpose;
    // admin must call settle or withdrawAccumulatedPool to reconcile logical ledger.
  });

  it("non-owner cannot call treasury functions", async function () {
    const { buyer, other, core } = await setupCoreWithAccumulatedPool();
    await assert.rejects(core.connect(buyer).withdrawUSDT(other.address, 1n));
    await assert.rejects(core.connect(buyer).withdrawAccumulatedPool(3, other.address, 1n));
    await assert.rejects(core.connect(buyer).emergencyWithdrawUSDT(other.address, 1n));
    await assert.rejects(core.connect(buyer).withdrawLight(other.address, 1n));
  });
});
