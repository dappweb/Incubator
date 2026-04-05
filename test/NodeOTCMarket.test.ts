import * as assert from "node:assert/strict";
import { ethers, upgrades } from "hardhat";

describe("NodeOTCMarket", function () {
  it("prevents duplicate listings and settles completed trades", async function () {
    const [owner, seller, buyer, feeRecipient] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
    );
    const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);
    await core.connect(owner).setIdentityMarket(await otc.getAddress());

    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await otc.getAddress(), 10_000_000_000n);
    await usdt.connect(owner).mint(seller.address, 10_000_000_000n);
    await usdt.connect(seller).approve(await core.getAddress(), 10_000_000_000n);

    await core.connect(seller).bindReferrer(owner.address);
    await core.connect(seller).buyNode();
    const identityId = await core.getUserIdentityId(seller.address);

    await core.connect(seller).approveIdentityOperator(identityId, await otc.getAddress(), true);

    await otc.connect(seller).createOrder(identityId, 2_000_000_000n);
    assert.deepEqual(Array.from(await otc.getActiveOrderIds()), [1n]);
    assert.equal(await otc.getIdentityActiveOrder(identityId), 1n);

    await assert.rejects(
      otc.connect(seller).createOrder(identityId, 2_100_000_000n),
    );

    const sellerBalanceBefore = await usdt.balanceOf(seller.address);
    const feeBalanceBefore = await usdt.balanceOf(feeRecipient.address);

    await otc.connect(buyer).fillOrder(1);

    assert.equal(await core.ownerOfIdentity(identityId), buyer.address);
    assert.deepEqual(Array.from(await otc.getActiveOrderIds()), []);
    assert.equal(await otc.getIdentityActiveOrder(identityId), 0n);

    const sellerBalanceAfter = await usdt.balanceOf(seller.address);
    const feeBalanceAfter = await usdt.balanceOf(feeRecipient.address);

    assert.equal(sellerBalanceAfter - sellerBalanceBefore, 1_800_000_000n);
    assert.equal(feeBalanceAfter - feeBalanceBefore, 200_000_000n);
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