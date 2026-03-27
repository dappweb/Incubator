import assert from "node:assert/strict";
import { ethers } from "hardhat";

describe("IncubatorCore", function () {
  it("splits machine orders and upgrades identity roles", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const identity = await deployIdentityNft(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      await identity.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await identity.connect(owner).setMinter(await core.getAddress(), true);
    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 10_000_000_000n);

    const machineAmount = 2n * 100_000_000n;

    const beforeBalances = await Promise.all([
      usdt.balanceOf(lp.address),
      usdt.balanceOf(referral.address),
      usdt.balanceOf(superPool.address),
      usdt.balanceOf(nodePool.address),
      usdt.balanceOf(platform.address),
      usdt.balanceOf(leaderboard.address),
    ]);

    await core.connect(buyer).purchaseMachine(2, ethers.ZeroAddress);

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

    assert.equal(afterBalances[0] - beforeBalances[0], 120_000_000n);
    assert.equal(afterBalances[1] - beforeBalances[1], 10_000_000n);
    assert.equal(afterBalances[2] - beforeBalances[2], 10_000_000n);
    assert.equal(afterBalances[3] - beforeBalances[3], 16_000_000n);
    assert.equal(afterBalances[4] - beforeBalances[4], 40_000_000n);
    assert.equal(afterBalances[5] - beforeBalances[5], 4_000_000n);

    assert.equal(await core.roles(buyer.address), 0n);

    await core.connect(buyer).buyNode();
    assert.equal(await core.roles(buyer.address), 1n);

    await core.connect(buyer).buySuperNode();
    assert.equal(await core.roles(buyer.address), 2n);
  });

  it("blocks purchases while paused", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const identity = await deployIdentityNft(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      await identity.getAddress(),
      owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await identity.connect(owner).setMinter(await core.getAddress(), true);
    await usdt.connect(owner).mint(buyer.address, 1_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 1_000_000_000n);

    await core.connect(owner).pause();

    await assert.rejects(core.connect(buyer).purchaseMachine(1, ethers.ZeroAddress));
    await assert.rejects(core.connect(buyer).buyNode());
  });
});

async function deployMockUsdt(initialOwner: string) {
  const factory = await ethers.getContractFactory("MockUSDT");
  const contract = await factory.deploy(initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployIdentityNft(initialOwner: string) {
  const factory = await ethers.getContractFactory("IdentityNFT");
  const contract = await factory.deploy(initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployCore(usdtAddress: string, identityAddress: string, owner: string, recipients: string[]) {
  const factory = await ethers.getContractFactory("IncubatorCore");
  const contract = await factory.deploy(usdtAddress, identityAddress, owner, recipients);
  await contract.waitForDeployment();
  return contract;
}