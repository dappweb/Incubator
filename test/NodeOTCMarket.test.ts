import { ethers, upgrades } from "hardhat";
import * as assert from "node:assert/strict";

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

  it("allows seller to cancel an active order and reclaim listing", async function () {
    const [owner, seller, feeRecipient] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
    );
    const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);
    await core.connect(owner).setIdentityMarket(await otc.getAddress());

    await usdt.connect(owner).mint(seller.address, 10_000_000_000n);
    await usdt.connect(seller).approve(await core.getAddress(), 10_000_000_000n);
    await core.connect(seller).bindReferrer(owner.address);
    await core.connect(seller).buyNode();

    const identityId = await core.getUserIdentityId(seller.address);
    await core.connect(seller).approveIdentityOperator(identityId, await otc.getAddress(), true);
    await otc.connect(seller).createOrder(identityId, 1_000_000_000n);

    assert.deepEqual(Array.from(await otc.getActiveOrderIds()), [1n]);

    await otc.connect(seller).cancelOrder(1);

    assert.deepEqual(Array.from(await otc.getActiveOrderIds()), []);
    assert.equal(await otc.getIdentityActiveOrder(identityId), 0n);

    // Identity still belongs to seller after cancel
    assert.equal(await core.ownerOfIdentity(identityId), seller.address);
  });

  it("enforces price floor based on last trade price", async function () {
    const [owner, seller, buyer, seller2, feeRecipient] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
    );
    const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);
    await core.connect(owner).setIdentityMarket(await otc.getAddress());

    // Setup seller with identity
    await usdt.connect(owner).mint(seller.address, 10_000_000_000n);
    await usdt.connect(seller).approve(await core.getAddress(), 10_000_000_000n);
    await core.connect(seller).bindReferrer(owner.address);
    await core.connect(seller).buyNode();
    const identityId = await core.getUserIdentityId(seller.address);
    await core.connect(seller).approveIdentityOperator(identityId, await otc.getAddress(), true);

    // Setup buyer
    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await otc.getAddress(), 10_000_000_000n);

    // First trade at 2000 USDT
    await otc.connect(seller).createOrder(identityId, 2_000_000_000n);
    await otc.connect(buyer).fillOrder(1);
    // buyer now owns identity

    // Setup seller2 with a new node identity  
    await usdt.connect(owner).mint(seller2.address, 10_000_000_000n);
    await usdt.connect(seller2).approve(await core.getAddress(), 10_000_000_000n);
    await core.connect(seller2).bindReferrer(owner.address);
    await core.connect(seller2).buyNode();
    const identityId2 = await core.getUserIdentityId(seller2.address);
    await core.connect(seller2).approveIdentityOperator(identityId2, await otc.getAddress(), true);

    // seller2 tries to list at 1000 USDT (below last trade of 2000) — must fail
    await assert.rejects(
      otc.connect(seller2).createOrder(identityId2, 1_000_000_000n),
      /below last trade price/,
    );

    // Listing at or above 2000 USDT should succeed
    await otc.connect(seller2).createOrder(identityId2, 2_000_000_000n);
    assert.deepEqual(Array.from(await otc.getActiveOrderIds()), [2n]);
  });

  it("auto-cancels lower priced same-role orders after a higher fill", async function () {
    const [owner, sellerA, sellerB, buyer, feeRecipient] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
    );
    const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);
    await core.connect(owner).setIdentityMarket(await otc.getAddress());

    // Setup sellers with node identities and approvals.
    for (const seller of [sellerA, sellerB]) {
      await usdt.connect(owner).mint(seller.address, 10_000_000_000n);
      await usdt.connect(seller).approve(await core.getAddress(), 10_000_000_000n);
      await core.connect(seller).bindReferrer(owner.address);
      await core.connect(seller).buyNode();
      const identityId = await core.getUserIdentityId(seller.address);
      await core.connect(seller).approveIdentityOperator(identityId, await otc.getAddress(), true);
    }

    // Buyer has enough USDT and allowance.
    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await otc.getAddress(), 10_000_000_000n);

    const identityA = await core.getUserIdentityId(sellerA.address);
    const identityB = await core.getUserIdentityId(sellerB.address);

    // Create two node listings: low first, then high.
    await otc.connect(sellerA).createOrder(identityA, 2_000_000_000n);
    await otc.connect(sellerB).createOrder(identityB, 2_200_000_000n);
    assert.deepEqual(Array.from(await otc.getActiveOrderIds()), [1n, 2n]);

    // Fill high order; lower same-role order should be auto-cancelled.
    await otc.connect(buyer).fillOrder(2);

    const order1 = await otc.getOrder(1);
    const order2 = await otc.getOrder(2);

    assert.equal(order2.active, false);
    assert.equal(order1.active, false);
    assert.deepEqual(Array.from(await otc.getActiveOrderIds()), []);
    assert.equal(await otc.getIdentityActiveOrder(identityA), 0n);
    assert.equal(await otc.getIdentityActiveOrder(identityB), 0n);
    assert.equal(await otc.getLastTradePrice(1), 2_200_000_000n);
  });

  it("cleanupLowerOrders removes residual low-price orders callable by anyone", async function () {
    const [owner, sellerA, sellerB, buyer, anyone, feeRecipient] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(),
      owner.address,
      [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
    );
    const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);
    await core.connect(owner).setIdentityMarket(await otc.getAddress());

    // Setup two sellers with node identities
    for (const seller of [sellerA, sellerB]) {
      await usdt.connect(owner).mint(seller.address, 10_000_000_000n);
      await usdt.connect(seller).approve(await core.getAddress(), 10_000_000_000n);
      await core.connect(seller).bindReferrer(owner.address);
      await core.connect(seller).buyNode();
      const id = await core.getUserIdentityId(seller.address);
      await core.connect(seller).approveIdentityOperator(id, await otc.getAddress(), true);
    }

    // Buyer will establish the lastTradePrice
    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await otc.getAddress(), 10_000_000_000n);

    const identityA = await core.getUserIdentityId(sellerA.address);
    const identityB = await core.getUserIdentityId(sellerB.address);

    // SellerA lists at 1000; sellerB lists at 1000 (same price).
    await otc.connect(sellerA).createOrder(identityA, 1_000_000_000n);
    await otc.connect(sellerB).createOrder(identityB, 1_000_000_000n);
    assert.equal(await otc.getActiveOrdersCount(), 2n);

    // Buyer fills order 2 at 1000 — both are at the same price, so auto-cancel
    // only removes orders *below* the filled price; order 1 is at exactly 1000
    // and should NOT be auto-cancelled (>= check in contract).
    await otc.connect(buyer).fillOrder(2);
    assert.equal(await otc.getActiveOrdersCount(), 1n); // order 1 remains

    // Now craft a scenario where lastTradePrice is raised externally:
    // Buyer now owns identityB, re-lists it at 2000
    await core.connect(buyer).approveIdentityOperator(identityB, await otc.getAddress(), true);
    await otc.connect(buyer).createOrder(identityB, 2_000_000_000n);

    // Provide a second buyer to fill the 2000 order
    await usdt.connect(owner).mint(anyone.address, 10_000_000_000n);
    await usdt.connect(anyone).approve(await otc.getAddress(), 10_000_000_000n);
    await otc.connect(anyone).fillOrder(3);

    // order 1 (1000 USDT) should have been auto-cancelled since 1000 < 2000
    assert.equal(await otc.getActiveOrdersCount(), 0n);

    // Verify cleanupLowerOrders can be called even when nothing to clean
    await otc.connect(anyone).cleanupLowerOrders(1, 50);
    assert.equal(await otc.getActiveOrdersCount(), 0n);

    // Verify invalid inputs are rejected
    await assert.rejects(otc.connect(anyone).cleanupLowerOrders(0, 50), /invalid role/);
    await assert.rejects(otc.connect(anyone).cleanupLowerOrders(1, 0), /invalid maxCancels/);
    await assert.rejects(otc.connect(anyone).cleanupLowerOrders(1, 201), /invalid maxCancels/);
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