import { ethers, upgrades } from "hardhat";
import * as assert from "node:assert/strict";

describe("IncubatorCore on-chain pool settlement", function () {
  it("maintains role lists on buyNode/buySuperNode and redistributes pools", async function () {
    const [owner, alice, bob, carol, lp, referral, platform, leaderboard] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, owner.address, owner.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    // Route SuperNode (2) / Node (3) pools to the contract itself.
    await core.connect(owner).updatePoolRecipient(2, coreAddr);
    await core.connect(owner).updatePoolRecipient(3, coreAddr);
    await core.connect(owner).updatePoolRecipient(5, coreAddr);

    // Fund buyers.
    for (const b of [alice, bob, carol]) {
      await usdt.connect(owner).mint(b.address, 1_000_000_000_000n);
      await usdt.connect(b).approve(coreAddr, 1_000_000_000_000n);
    }

    await core.connect(alice).bindReferrer(owner.address);
    await core.connect(bob).bindReferrer(owner.address);
    await core.connect(carol).bindReferrer(owner.address);

    // alice & bob become nodes; carol becomes super-node directly.
    await core.connect(alice).buyNode();
    await core.connect(bob).buyNode();
    await core.connect(carol).buySuperNode();

    assert.equal(await core.getNodeListLength(), 2n);
    assert.equal(await core.getSuperNodeListLength(), 1n);

    // alice upgrades to super-node → nodeList shrinks, superNodeList grows.
    await core.connect(alice).buySuperNode();
    assert.equal(await core.getNodeListLength(), 1n);
    assert.equal(await core.getSuperNodeListLength(), 2n);

    // Generate purchases so teamTotalVolume is non-zero on all referrers (owner is everyone's referrer).
    // Add second-level children for alice/bob/carol to give each of them team volume.
    const [, , , , , , , , alice2, bob2, carol2] = await ethers.getSigners();
    for (const [parent, child] of [
      [alice, alice2], [bob, bob2], [carol, carol2],
    ] as const) {
      await usdt.connect(owner).mint(child.address, 1_000_000_000_000n);
      await usdt.connect(child).approve(coreAddr, 1_000_000_000_000n);
      await core.connect(child).bindReferrer(parent.address);
    }
    // Different volumes to vary weight: alice2 buys 5, bob2 buys 3, carol2 buys 2.
    await core.connect(alice2).purchaseMachine(5);
    await core.connect(bob2).purchaseMachine(3);
    await core.connect(carol2).purchaseMachine(2);

    // Pools should now hold Node 8% + SuperNode 5% of (500+300+200)=1000 USDT.
    const nodePool = await core.poolAccumulated(3);
    const superPool = await core.poolAccumulated(2);
    assert.equal(nodePool, 80_000_000n); // 8% of 1000 USDT (6-dec)
    assert.equal(superPool, 50_000_000n);

    // Enable public settle to let non-owner trigger too.
    await core.connect(owner).setPublicSettleEnabled(true);

    const balancesBefore = await Promise.all([
      usdt.balanceOf(alice.address),
      usdt.balanceOf(bob.address),
      usdt.balanceOf(carol.address),
    ]);

    await core.connect(alice).settleSuperNodePoolOnChain();
    await core.connect(alice).settleNodePoolOnChain();

    assert.equal(await core.poolAccumulated(2), 0n);
    assert.equal(await core.poolAccumulated(3), 0n);

    const balancesAfter = await Promise.all([
      usdt.balanceOf(alice.address),
      usdt.balanceOf(bob.address),
      usdt.balanceOf(carol.address),
    ]);

    // Sum of all payouts must equal the total pool (dust eaten by last recipient).
    const aliceGain = balancesAfter[0] - balancesBefore[0];
    const bobGain = balancesAfter[1] - balancesBefore[1];
    const carolGain = balancesAfter[2] - balancesBefore[2];
    assert.equal(aliceGain + bobGain + carolGain, nodePool + superPool);

    // Idempotency: same day re-trigger should revert.
    await assert.rejects(core.connect(alice).settleSuperNodePoolOnChain());
    await assert.rejects(core.connect(alice).settleNodePoolOnChain());
  });

  it("rejects unauthorized callers when publicSettleEnabled is false", async function () {
    const [owner, alice, lp, referral, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, owner.address, owner.address, platform.address, leaderboard.address],
    );

    await assert.rejects(core.connect(alice).settleNodePoolOnChain());
    await assert.rejects(core.connect(alice).settleSuperNodePoolOnChain());
  });

  it("transfers role list ownership on OTC identity transfer", async function () {
    const [owner, alice, bob, market, lp, referral, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [lp.address, referral.address, owner.address, owner.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    await core.connect(owner).setIdentityMarket(market.address);

    for (const b of [alice]) {
      await usdt.connect(owner).mint(b.address, 100_000_000_000n);
      await usdt.connect(b).approve(coreAddr, 100_000_000_000n);
    }
    await core.connect(alice).bindReferrer(owner.address);
    await core.connect(alice).buyNode();

    const identityId = await core.getUserIdentityId(alice.address);
    await core.connect(alice).approveIdentityOperator(identityId, market.address, true);

    // Market transfers identity from alice to bob.
    await core.connect(market).transferIdentityByMarket(identityId, alice.address, bob.address);

    assert.equal(await core.getNodeListLength(), 1n);
    const nodeList: string[] = await core.getNodeList();
    assert.equal(nodeList[0], bob.address);
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
