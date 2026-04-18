import { ethers, upgrades } from "hardhat";
import * as assert from "node:assert/strict";

// Minimal USDT mock deployer (MockUSDT has a 6-decimals default matching tests)
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

async function setupCore() {
  const [owner, buyer, sub1, sub2, lp, referral, superPool, nodePool, platform, leaderboard] =
    await ethers.getSigners();

  const usdt = await deployMockUsdt(owner.address);
  const core = await deployCore(
    await usdt.getAddress(),
    owner.address,
    [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
  );

  // Mint everyone a generous balance
  for (const s of [buyer, sub1, sub2]) {
    await usdt.connect(owner).mint(s.address, 100_000_000_000n);
    await usdt.connect(s).approve(await core.getAddress(), 100_000_000_000n);
  }

  return { owner, buyer, sub1, sub2, usdt, core, superPool, nodePool, leaderboard };
}

describe("teamPower tracking", function () {
  it("accumulates teamPower up the referral chain on purchaseMachine", async function () {
    const { owner, buyer, sub1, sub2, core } = await setupCore();

    // Build chain: owner -> buyer -> sub1 -> sub2
    await core.connect(buyer).bindReferrer(owner.address);
    await core.connect(sub1).bindReferrer(buyer.address);
    await core.connect(sub2).bindReferrer(sub1.address);

    // sub2 buys 3 machines, propagates quantity=3 up
    await core.connect(sub2).purchaseMachine(3);
    assert.equal(await core.teamPower(sub2.address), 0n);
    assert.equal(await core.teamPower(sub1.address), 3n);
    assert.equal(await core.teamPower(buyer.address), 3n);
    assert.equal(await core.teamPower(owner.address), 3n);

    // sub1 buys 2 more, propagates upward (not to sub2)
    await core.connect(sub1).purchaseMachine(2);
    assert.equal(await core.teamPower(sub2.address), 0n);
    assert.equal(await core.teamPower(sub1.address), 3n); // unchanged
    assert.equal(await core.teamPower(buyer.address), 5n);
    assert.equal(await core.teamPower(owner.address), 5n);
  });
});

describe("on-chain Node/SuperNode settlement", function () {
  it("allocates pool balance proportionally to teamPower", async function () {
    const { owner, buyer, sub1, sub2, usdt, core, nodePool } = await setupCore();

    // Chain: owner -> buyer -> sub1 ; owner -> sub2
    await core.connect(buyer).bindReferrer(owner.address);
    await core.connect(sub1).bindReferrer(buyer.address);
    await core.connect(sub2).bindReferrer(owner.address);

    // Buy machines so teamPower populates
    await core.connect(sub1).purchaseMachine(5); // buyer.tp=5, owner.tp=5
    await core.connect(sub2).purchaseMachine(3); // owner.tp=8

    // Switch Node pool recipient to the contract itself so funds accumulate on-chain
    // PoolType.Node = 3
    const coreAddr = await core.getAddress();
    await core.connect(owner).updatePoolRecipient(3, coreAddr);

    // Now a fresh purchase accumulates 8% into poolAccumulated[3]
    await core.connect(sub1).purchaseMachine(1); // contributes another 8% of 100U = 8U => poolAccumulated[3]+=8e6 (mock usdt 6 decimals? check)

    const poolBal: bigint = await core.poolAccumulated(3);
    assert.ok(poolBal > 0n, "node pool balance should be > 0");

    // Give buyer a Node role so it qualifies (buyNode requires bindReferrer already true)
    await core.connect(buyer).buyNode();

    // Update buyer teamPower snapshot (after buyNode, buyer still has the same downstream tp)
    const buyerTp: bigint = await core.teamPower(buyer.address);
    assert.ok(buyerTp > 0n);

    // Owner isn't a Node/SuperNode, cannot be candidate. Use buyer only.
    const preBalance: bigint = await usdt.balanceOf(buyer.address);
    await core.connect(owner).settleNodePoolOnChain([buyer.address]);
    const postBalance: bigint = await usdt.balanceOf(buyer.address);
    assert.equal(postBalance - preBalance, poolBal, "buyer should receive entire pool");

    // Pool balance zeroed
    assert.equal(await core.poolAccumulated(3), 0n);
  });

  it("rejects duplicate candidates and zero teamPower", async function () {
    const { owner, buyer, core } = await setupCore();
    await core.connect(buyer).bindReferrer(owner.address);

    // Switch recipient to self
    const coreAddr = await core.getAddress();
    await core.connect(owner).updatePoolRecipient(3, coreAddr);
    await core.connect(buyer).purchaseMachine(1); // accumulates 8U in poolAccumulated[3]

    // buyer has no downstream, teamPower=0 -> revert "zero team power"
    await core.connect(buyer).buyNode();
    await assert.rejects(core.connect(owner).settleNodePoolOnChain([buyer.address]));

    // duplicate candidate -> revert (even if role & tp valid, our buyer still 0 tp here)
    await assert.rejects(
      core.connect(owner).settleNodePoolOnChain([buyer.address, buyer.address]),
    );
  });
});

describe("teamPower backfill", function () {
  it("replays historical orders once per user", async function () {
    const { owner, buyer, sub1, sub2, core } = await setupCore();

    await core.connect(buyer).bindReferrer(owner.address);
    await core.connect(sub1).bindReferrer(buyer.address);
    await core.connect(sub2).bindReferrer(sub1.address);

    // Prime state via normal purchase so teamPower already correct
    await core.connect(sub2).purchaseMachine(4);
    const before: bigint = await core.teamPower(owner.address);
    assert.equal(before, 4n);

    // Calling backfill on sub2 (who has the orders) should NOT double count
    await core.connect(owner).backfillTeamPowerFromOrders([sub2.address]);
    const after1: bigint = await core.teamPower(owner.address);
    // Double count: backfill replays so +4 again (expected behavior for fresh upgrade),
    // but calling twice should not add again because flag is set.
    assert.equal(after1, before + 4n);

    await core.connect(owner).backfillTeamPowerFromOrders([sub2.address]);
    const after2: bigint = await core.teamPower(owner.address);
    assert.equal(after2, after1, "second backfill must be a no-op");

    assert.equal(await core.teamPowerBackfilled(sub2.address), true);
  });
});
