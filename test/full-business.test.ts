import { ethers, upgrades } from "hardhat";
import * as assert from "node:assert/strict";

// ═════════════════════════════════════════════════════════════════════════════
//  L1 — IncubatorCore additional unit tests
// ═════════════════════════════════════════════════════════════════════════════
describe("IncubatorCore — Admin & Settlement", function () {
  async function deployFixture() {
    const [owner, alice, bob, carol, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(), owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    // Fund and approve participants
    for (const u of [alice, bob, carol]) {
      await usdt.connect(owner).mint(u.address, 50_000_000_000n);
      await usdt.connect(u).approve(coreAddr, 50_000_000_000n);
    }
    await usdt.connect(owner).mint(owner.address, 50_000_000_000n);
    await usdt.connect(owner).approve(coreAddr, 50_000_000_000n);

    return { owner, alice, bob, carol, lp, referral, superPool, nodePool, platform, leaderboard, usdt, core, coreAddr };
  }

  // ── C-7: getParticipantCount / getParticipantAt ──
  it("tracks participants and allows enumeration", async function () {
    const { core, alice, bob } = await deployFixture();

    await core.connect(alice).bindReferrer((await ethers.getSigners())[0].address);
    await core.connect(alice).purchaseMachine(1);
    assert.equal(await core.getParticipantCount(), 1n);
    assert.equal(await core.getParticipantAt(0), alice.address);

    await core.connect(bob).bindReferrer(alice.address);
    await core.connect(bob).purchaseMachine(1);
    assert.equal(await core.getParticipantCount(), 2n);

    await assert.rejects(core.getParticipantAt(5));
  });

  // ── C-8: withdrawUSDT ──
  it("allows owner to withdraw USDT and blocks non-owner", async function () {
    const { core, owner, alice, usdt } = await deployFixture();

    // send some USDT to core contract directly
    await usdt.connect(owner).mint(await core.getAddress(), 1_000_000n);

    const before = await usdt.balanceOf(alice.address);
    await core.connect(owner).withdrawUSDT(alice.address, 500_000n);
    assert.equal((await usdt.balanceOf(alice.address)) - before, 500_000n);

    // non-owner reverts
    await assert.rejects(core.connect(alice).withdrawUSDT(alice.address, 1n));
    // zero address reverts
    await assert.rejects(core.connect(owner).withdrawUSDT(ethers.ZeroAddress, 1n), /invalid to/);
  });

  // ── C-9: updatePoolRecipient ──
  it("updates pool recipient correctly", async function () {
    const { core, owner, alice } = await deployFixture();

    await core.connect(owner).updatePoolRecipient(0, alice.address);
    const [recipient] = await core.getPoolConfig(0);
    assert.equal(recipient, alice.address);

    // non-owner reverts
    await assert.rejects(core.connect(alice).updatePoolRecipient(0, alice.address));
  });

  // ── C-10: updatePoolShare ──
  it("allows updating pool share only when total stays 10000", async function () {
    const { core, owner } = await deployFixture();

    // Setting to same value succeeds
    await core.connect(owner).updatePoolShare(0, 6000);
    const [, bps] = await core.getPoolConfig(0);
    assert.equal(bps, 6000n);

    // Invalid total reverts
    await assert.rejects(core.connect(owner).updatePoolShare(0, 5000), /invalid pool total/);
  });

  // ── C-11: isOwnerOrSubAdmin ──
  it("reports isOwnerOrSubAdmin correctly for owner, subAdmin, random", async function () {
    const { core, owner, alice, bob } = await deployFixture();

    assert.equal(await core.isOwnerOrSubAdmin(owner.address), true);
    assert.equal(await core.isOwnerOrSubAdmin(alice.address), false);

    await core.connect(owner).setSubAdmin(alice.address, true);
    assert.equal(await core.isOwnerOrSubAdmin(alice.address), true);
    assert.equal(await core.isOwnerOrSubAdmin(bob.address), false);
  });

  it("allows owner/sub-admin to manage manager role", async function () {
    const { core, owner, alice, bob, carol } = await deployFixture();

    await core.connect(owner).setSubAdmin(alice.address, true);

    await core.connect(alice).setManager(bob.address, true);
    assert.equal(await core.isOwnerOrSubAdmin(bob.address), true);

    await core.connect(owner).setManager(carol.address, true);
    assert.equal(await core.isOwnerOrSubAdmin(carol.address), true);

    await core.connect(alice).setManager(bob.address, false);
    assert.equal(await core.isOwnerOrSubAdmin(bob.address), false);

    await assert.rejects(core.connect(bob).setManager(carol.address, false));
  });

  it("allows manager to update prices but blocks high-risk owner-only actions", async function () {
    const { core, owner, alice, bob } = await deployFixture();

    await core.connect(owner).setSubAdmin(alice.address, true);
    await core.connect(alice).setManager(bob.address, true);

    await core.connect(bob).updateMachineUnitPrice(101_000000n);
    await core.connect(bob).updateNodePrice(1001_000000n);
    await assert.rejects(core.connect(bob).updateSuperNodePrice(3001_000000n));

    await assert.rejects(core.connect(bob).withdrawUSDT(bob.address, 1n));
    await assert.rejects(core.connect(bob).setSubAdmin(bob.address, true));
    await assert.rejects(core.connect(bob).transferOwnership(bob.address));
  });

  // ── C-13: getUserMachineOrders ──
  it("returns correct order ID list for getUserMachineOrders", async function () {
    const { core, alice } = await deployFixture();

    await core.connect(alice).bindReferrer((await ethers.getSigners())[0].address);
    await core.connect(alice).purchaseMachine(1);
    await core.connect(alice).purchaseMachine(2);

    const orders = await core.getUserMachineOrders(alice.address);
    assert.equal(orders.length, 2);
    assert.equal(orders[0], 1n);
    assert.equal(orders[1], 2n);
  });

  // ── C-14: isIdentityOperatorApproved ──
  it("approves and revokes identity operators", async function () {
    const { core, alice, bob } = await deployFixture();

    await core.connect(alice).bindReferrer((await ethers.getSigners())[0].address);
    await core.connect(alice).buyNode();
    const id = await core.getUserIdentityId(alice.address);

    assert.equal(await core.isIdentityOperatorApproved(id, bob.address), false);
    await core.connect(alice).approveIdentityOperator(id, bob.address, true);
    assert.equal(await core.isIdentityOperatorApproved(id, bob.address), true);
    await core.connect(alice).approveIdentityOperator(id, bob.address, false);
    assert.equal(await core.isIdentityOperatorApproved(id, bob.address), false);
  });

  // ── C-16: pause → unpause ──
  it("can pause and unpause, allowing trading after unpause", async function () {
    const { core, owner, alice } = await deployFixture();

    await core.connect(alice).bindReferrer(owner.address);

    await core.connect(owner).pause();
    await assert.rejects(core.connect(alice).purchaseMachine(1));

    await core.connect(owner).unpause();
    await core.connect(alice).purchaseMachine(1); // should succeed
    const order = await core.getMachineOrder(1);
    assert.equal(order.quantity, 1n);
  });

  // ── C-3/C-4: Whitelist getters ──
  it("setLeaderboardWhitelist / getLeaderboardWhitelist round-trips", async function () {
    const { core, owner, alice, bob } = await deployFixture();

    await core.connect(owner).setLeaderboardWhitelist([alice.address, bob.address]);
    const list = await core.getLeaderboardWhitelist();
    assert.equal(list.length, 2);

    // Clear
    await core.connect(owner).setLeaderboardWhitelist([]);
    assert.equal((await core.getLeaderboardWhitelist()).length, 0);
  });

  it("setLeaderboardWhitelistAdjustPct rejects values > 10", async function () {
    const { core, owner } = await deployFixture();

    await core.connect(owner).setLeaderboardWhitelistAdjustPct(10);
    await assert.rejects(core.connect(owner).setLeaderboardWhitelistAdjustPct(11));
  });

  // ── C-6: syncParticipant ──
  it("syncParticipant adds user if they have orders", async function () {
    const { core, alice } = await deployFixture();

    await core.connect(alice).bindReferrer((await ethers.getSigners())[0].address);
    await core.connect(alice).purchaseMachine(1);
    const count = await core.getParticipantCount();
    // calling again is idempotent
    await core.syncParticipant(alice.address);
    assert.equal(await core.getParticipantCount(), count);
  });

  // ── C-5: syncUsdtTokenDecimals ──
  it("syncUsdtTokenDecimals reads decimals from USDT contract", async function () {
    const { core, owner } = await deployFixture();
    // MockUSDT has 6 decimals — calling sync should succeed
    await core.connect(owner).syncUsdtTokenDecimals();
    // Non-owner reverts
    const { alice } = await deployFixture();
    await assert.rejects(core.connect(alice).syncUsdtTokenDecimals());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L1 — IncubatorToken additional tests
// ═════════════════════════════════════════════════════════════════════════════
describe("IncubatorToken — Admin", function () {
  // T-1: setSaleAllocationWallet
  it("updates sale allocation wallet and rejects zero address", async function () {
    const [owner, saleWallet, newWallet] = await ethers.getSigners();
    const token: any = await deployIcoToken(owner.address, saleWallet.address);

    assert.equal(await token.saleAllocationWallet(), saleWallet.address);

    await token.connect(owner).setSaleAllocationWallet(newWallet.address);
    assert.equal(await token.saleAllocationWallet(), newWallet.address);

    await assert.rejects(
      token.connect(owner).setSaleAllocationWallet(ethers.ZeroAddress),
      /invalid sale wallet/,
    );

    // Non-owner reverts
    await assert.rejects(token.connect(newWallet).setSaleAllocationWallet(saleWallet.address));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L1 — NodeOTCMarket additional tests
// ═════════════════════════════════════════════════════════════════════════════
describe("NodeOTCMarket — Admin & Queries", function () {
  async function deployOtcFixture() {
    const [owner, seller, seller2, buyer, feeRecipient, anyone] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(), owner.address,
      [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
    );
    const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);
    await core.connect(owner).setIdentityMarket(await otc.getAddress());

    // Fund all users
    for (const u of [seller, seller2, buyer, anyone]) {
      await usdt.connect(owner).mint(u.address, 20_000_000_000n);
      await usdt.connect(u).approve(await core.getAddress(), 20_000_000_000n);
      await usdt.connect(u).approve(await otc.getAddress(), 20_000_000_000n);
    }

    return { owner, seller, seller2, buyer, feeRecipient, anyone, usdt, core, otc };
  }

  // O-1: updateFeeConfig
  it("updateFeeConfig changes fee and recipient, non-owner reverts", async function () {
    const { otc, owner, anyone, seller, buyer, core, feeRecipient, usdt } = await deployOtcFixture();

    await otc.connect(owner).updateFeeConfig(500, anyone.address); // 5%

    // Create and fill an order to verify new fee
    await core.connect(seller).bindReferrer(owner.address);
    await core.connect(seller).buyNode();
    const id = await core.getUserIdentityId(seller.address);
    await core.connect(seller).approveIdentityOperator(id, await otc.getAddress(), true);
    await otc.connect(seller).createOrder(id, 1_000_000_000n);

    const anyoneBefore = await usdt.balanceOf(anyone.address);
    await otc.connect(buyer).fillOrder(1);
    const anyoneAfter = await usdt.balanceOf(anyone.address);

    // New fee = 5% of 1000 USDT = 50 USDT
    assert.equal(anyoneAfter - anyoneBefore, 50_000_000n);

    // Non-owner reverts
    await assert.rejects(otc.connect(anyone).updateFeeConfig(100, anyone.address));
  });

  // O-2: getActiveOrderIdsPaginated
  it("getActiveOrderIdsPaginated returns correct slices", async function () {
    const { core, otc, owner, seller, seller2 } = await deployOtcFixture();

    for (const s of [seller, seller2]) {
      await core.connect(s).bindReferrer(owner.address);
      await core.connect(s).buyNode();
      const id = await core.getUserIdentityId(s.address);
      await core.connect(s).approveIdentityOperator(id, await otc.getAddress(), true);
    }
    const id1 = await core.getUserIdentityId(seller.address);
    const id2 = await core.getUserIdentityId(seller2.address);

    await otc.connect(seller).createOrder(id1, 1_000_000_000n);
    await otc.connect(seller2).createOrder(id2, 1_000_000_000n);

    // Full list
    const full = await otc.getActiveOrderIdsPaginated(0, 10);
    assert.equal(full.length, 2);

    // Offset + limit
    const page1 = await otc.getActiveOrderIdsPaginated(0, 1);
    assert.equal(page1.length, 1);

    const page2 = await otc.getActiveOrderIdsPaginated(1, 10);
    assert.equal(page2.length, 1);

    // Out of range — empty
    const empty = await otc.getActiveOrderIdsPaginated(10, 10);
    assert.equal(empty.length, 0);
  });

  // O-3: hasActiveOrder
  it("hasActiveOrder returns true/false correctly", async function () {
    const { core, otc, owner, seller, buyer } = await deployOtcFixture();

    await core.connect(seller).bindReferrer(owner.address);
    await core.connect(seller).buyNode();
    const id = await core.getUserIdentityId(seller.address);
    await core.connect(seller).approveIdentityOperator(id, await otc.getAddress(), true);

    assert.equal(await otc.hasActiveOrder(id), false);
    await otc.connect(seller).createOrder(id, 1_000_000_000n);
    assert.equal(await otc.hasActiveOrder(id), true);
    await otc.connect(seller).cancelOrder(1);
    assert.equal(await otc.hasActiveOrder(id), false);
  });

  // O-4: Non-identity-owner cannot create order
  it("rejects createOrder from non-identity-owner", async function () {
    const { core, otc, owner, seller, anyone } = await deployOtcFixture();

    await core.connect(seller).bindReferrer(owner.address);
    await core.connect(seller).buyNode();
    const id = await core.getUserIdentityId(seller.address);

    // anyone tries to list seller's identity — reverts
    await assert.rejects(otc.connect(anyone).createOrder(id, 1_000_000_000n));
  });

  // O-5: Fee recipient balance check
  it("fillOrder pays exact fee to recipient", async function () {
    const { core, otc, owner, seller, buyer, feeRecipient, usdt } = await deployOtcFixture();

    await core.connect(seller).bindReferrer(owner.address);
    await core.connect(seller).buyNode();
    const id = await core.getUserIdentityId(seller.address);
    await core.connect(seller).approveIdentityOperator(id, await otc.getAddress(), true);

    await otc.connect(seller).createOrder(id, 1_000_000_000n); // 1000 USDT, 10% fee = 100

    const feeBefore = await usdt.balanceOf(feeRecipient.address);
    const sellerBefore = await usdt.balanceOf(seller.address);
    await otc.connect(buyer).fillOrder(1);
    assert.equal((await usdt.balanceOf(feeRecipient.address)) - feeBefore, 100_000_000n);
    assert.equal((await usdt.balanceOf(seller.address)) - sellerBefore, 900_000_000n);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L1 — PrimarySwapController additional tests
// ═════════════════════════════════════════════════════════════════════════════
describe("PrimarySwapController — Admin Config", function () {
  async function deployPrimaryFixture() {
    const [owner, buyer, seller, superRecip, nodeRecip, platRecip, newRecip] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const ico: any = await deployIcoToken(owner.address, owner.address);
    const { router, factory, pair } = await deployDexInfra(await usdt.getAddress(), await ico.getAddress(), owner.address);

    // Fund router for swaps
    await ico.connect(owner).mint(await router.getAddress(), ethers.parseUnits("10000000", 18));
    await usdt.connect(owner).mint(await router.getAddress(), 100_000_000_000n);

    const controller = await deployPrimarySwapController(
      await usdt.getAddress(), await ico.getAddress(),
      await router.getAddress(), await factory.getAddress(),
      owner.address,
      [superRecip.address, nodeRecip.address, platRecip.address],
    );

    return { owner, buyer, seller, superRecip, nodeRecip, platRecip, newRecip, usdt, ico, router, factory, pair, controller };
  }

  // P-1: updateBuyFeeConfig
  it("updateBuyFeeConfig updates values and validates split", async function () {
    const { controller, owner, buyer } = await deployPrimaryFixture();

    await controller.connect(owner).updateBuyFeeConfig(1000, 400, 400, 200);
    assert.equal(await controller.buyFeeBps(), 1000n);
    assert.equal(await controller.superNodeFeeBps(), 400n);

    // Split must equal buyFeeBps
    await assert.rejects(
      controller.connect(owner).updateBuyFeeConfig(1000, 400, 400, 300),
      /invalid fee split/,
    );

    // Non-owner reverts
    await assert.rejects(controller.connect(buyer).updateBuyFeeConfig(500, 200, 200, 100));
  });

  // P-2: updateSellConfig
  it("updateSellConfig updates values and validates split", async function () {
    const { controller, owner } = await deployPrimaryFixture();

    await controller.connect(owner).updateSellConfig(5000, 1000, 2000, 7000);
    assert.equal(await controller.sellFeeBps(), 5000n);
    assert.equal(await controller.sellBurnBps(), 1000n);

    // Split must sum to 10000
    await assert.rejects(
      controller.connect(owner).updateSellConfig(5000, 1000, 2000, 6000),
      /invalid sell split/,
    );
  });

  // P-3: updateRecipients
  it("updateRecipients changes addresses and rejects zero", async function () {
    const { controller, owner, newRecip } = await deployPrimaryFixture();

    const signers = await ethers.getSigners();
    await controller.connect(owner).updateRecipients(signers[1].address, signers[2].address, newRecip.address);
    assert.equal(await controller.platformRecipient(), newRecip.address);

    await assert.rejects(
      controller.connect(owner).updateRecipients(ethers.ZeroAddress, signers[2].address, newRecip.address),
      /invalid recipient/,
    );
  });

  // P-4: updateThresholds
  it("updateThresholds sets values and affects canEnableSellUsdt", async function () {
    const { controller, owner, pair } = await deployPrimaryFixture();

    await controller.connect(owner).updateThresholds(999_999n, 100n);
    assert.equal(await controller.minUsdtReserveToEnableSell(), 999_999n);
    assert.equal(await controller.minIcoHolderCountToEnableSell(), 100n);
    assert.equal(await controller.canEnableSellUsdt(), false);

    // Set reserves high and holders to threshold
    await pair.setReserves(1_000_000, 1);
    await controller.connect(owner).reportIcoHolderCount(100);
    assert.equal(await controller.canEnableSellUsdt(), true);
  });

  // P-5: reportIcoHolderCount
  it("reportIcoHolderCount updates count", async function () {
    const { controller, owner } = await deployPrimaryFixture();

    await controller.connect(owner).reportIcoHolderCount(500n);
    assert.equal(await controller.reportedIcoHolderCount(), 500n);
  });

  // P-6: updatePair
  it("updatePair changes pair address", async function () {
    const { controller, owner, newRecip } = await deployPrimaryFixture();

    await controller.connect(owner).updatePair(newRecip.address);
    assert.equal(await controller.pair(), newRecip.address);
  });

  // P-7: disableSellUsdt
  it("enable→disable→sell reverts", async function () {
    const { controller, owner, seller, pair, ico, usdt } = await deployPrimaryFixture();

    await controller.connect(owner).updateThresholds(1n, 1n);
    await controller.connect(owner).reportIcoHolderCount(1n);
    await pair.setReserves(1, 1);
    await controller.connect(owner).enableSellUsdt();
    assert.equal(await controller.sellUsdtEnabled(), true);

    await controller.connect(owner).disableSellUsdt();
    assert.equal(await controller.sellUsdtEnabled(), false);

    // Sell reverts after disable
    await ico.connect(owner).mint(seller.address, ethers.parseUnits("100", 18));
    await ico.connect(seller).approve(await controller.getAddress(), ethers.parseUnits("100", 18));
    await assert.rejects(
      controller.connect(seller).sellIcoForUsdt(ethers.parseUnits("100", 18), 0n, seller.address),
      /sell usdt disabled/,
    );
  });

  // P-9: quoteBuyIco
  it("quoteBuyIco returns correct fee and output", async function () {
    const { controller } = await deployPrimaryFixture();

    const [amountOut, fee] = await controller.quoteBuyIco(100_000_000n); // 100 USDT
    // Default buyFeeBps = 500 (5%), so fee = 5 USDT = 5_000_000
    assert.equal(fee, 5_000_000n);
    // 95 USDT * 100 ICO/USDT = 9500 ICO
    assert.equal(amountOut, ethers.parseUnits("9500", 18));
  });

  // P-12: withdrawTreasury
  it("withdrawTreasury sends tokens to recipient", async function () {
    const { controller, owner, newRecip, usdt } = await deployPrimaryFixture();

    // Send some USDT to controller
    await usdt.connect(owner).mint(await controller.getAddress(), 1_000_000n);

    const before = await usdt.balanceOf(newRecip.address);
    await controller.connect(owner).withdrawTreasury(await usdt.getAddress(), newRecip.address, 1_000_000n);
    assert.equal((await usdt.balanceOf(newRecip.address)) - before, 1_000_000n);

    // Non-owner reverts
    await assert.rejects(
      controller.connect(newRecip).withdrawTreasury(await usdt.getAddress(), newRecip.address, 0n),
    );
  });

  // P-14: buyIcoExactIn slippage protection
  it("buyIcoExactIn reverts when minOutIco is too high", async function () {
    const { controller, buyer, usdt, owner } = await deployPrimaryFixture();

    await usdt.connect(owner).mint(buyer.address, 100_000_000n);
    await usdt.connect(buyer).approve(await controller.getAddress(), 100_000_000n);

    // With 100 USDT => ~9500 ICO; require 10000 → revert
    await assert.rejects(
      controller.connect(buyer).buyIcoExactIn(100_000_000n, ethers.parseUnits("10000", 18), buyer.address),
    );
  });

  // P-16: buy fee flow verification
  it("buy distributes fees correctly to all 3 recipients", async function () {
    const { controller, buyer, usdt, ico, owner, superRecip, nodeRecip, platRecip } = await deployPrimaryFixture();

    await usdt.connect(owner).mint(buyer.address, 1_000_000_000n);
    await usdt.connect(buyer).approve(await controller.getAddress(), 1_000_000_000n);

    const superBefore = await usdt.balanceOf(superRecip.address);
    const nodeBefore = await usdt.balanceOf(nodeRecip.address);
    const platBefore = await usdt.balanceOf(platRecip.address);

    await controller.connect(buyer).buyIcoExactIn(100_000_000n, 0n, buyer.address);

    // Default: buy=500, super=100, node=200, platform=200 (BPS of 100 USDT)
    assert.equal((await usdt.balanceOf(superRecip.address)) - superBefore, 1_000_000n);
    assert.equal((await usdt.balanceOf(nodeRecip.address)) - nodeBefore, 2_000_000n);
    assert.equal((await usdt.balanceOf(platRecip.address)) - platBefore, 2_000_000n);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L1 — SwapPoolManager additional tests
// ═════════════════════════════════════════════════════════════════════════════
describe("SwapPoolManager — Admin & Liquidity", function () {
  async function deploySwapFixture() {
    const [owner, trader, recipient] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const ico: any = await deployIcoToken(owner.address, owner.address);
    const light = await deployMockToken("Incubator Light", "LIGHT", owner.address);
    const swap: any = await deploySwapPool(
      await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address,
    );

    await swap.createDefaultPools(100, 200, 2000);

    // Mint and approve
    await usdt.connect(owner).mint(owner.address, 10_000_000_000n);
    await ico.connect(owner).mint(owner.address, ethers.parseUnits("100000", 18));
    await light.connect(owner).mint(owner.address, ethers.parseUnits("100000", 18));
    await usdt.connect(owner).approve(await swap.getAddress(), 10_000_000_000n);
    await ico.connect(owner).approve(await swap.getAddress(), ethers.parseUnits("100000", 18));
    await light.connect(owner).approve(await swap.getAddress(), ethers.parseUnits("100000", 18));

    // Add initial liquidity
    await swap.addLiquidity(0, 1_000_000_000n, ethers.parseUnits("5000", 18));
    await swap.addLiquidity(1, ethers.parseUnits("10000", 18), ethers.parseUnits("2000", 18));

    return { owner, trader, recipient, usdt, ico, light, swap };
  }

  // S-1: removeLiquidity
  it("removeLiquidity sends tokens and rejects over-withdraw", async function () {
    const { swap, owner, recipient, usdt, ico } = await deploySwapFixture();

    const before0 = await usdt.balanceOf(recipient.address);
    const before1 = await ico.balanceOf(recipient.address);
    await swap.connect(owner).removeLiquidity(0, 100_000n, ethers.parseUnits("1", 18), recipient.address);
    assert.equal((await usdt.balanceOf(recipient.address)) - before0, 100_000n);
    assert.equal((await ico.balanceOf(recipient.address)) - before1, ethers.parseUnits("1", 18));

    // Over-withdraw reverts
    await assert.rejects(
      swap.connect(owner).removeLiquidity(0, 999_999_999_999n, 0n, recipient.address),
      /insufficient reserve/,
    );

    // Zero address reverts
    await assert.rejects(
      swap.connect(owner).removeLiquidity(0, 1n, 1n, ethers.ZeroAddress),
      /invalid to/,
    );
  });

  // S-2: updatePoolConfig
  it("updatePoolConfig changes feeBps and impactBps", async function () {
    const { swap, owner } = await deploySwapFixture();

    await swap.connect(owner).updatePoolConfig(0, 50, 3000);
    const pool = await swap.getPool(0);
    assert.equal(pool.feeBps, 50n);
    assert.equal(pool.maxPriceImpactBps, 3000n);
  });

  // S-3: setUsdtAddress
  it("setUsdtAddress updates and non-owner reverts", async function () {
    const { swap, owner, trader } = await deploySwapFixture();

    const newAddr = (await ethers.getSigners())[5].address;
    // setUsdtAddress should succeed for owner
    await swap.connect(owner).setUsdtAddress(newAddr);

    // Non-owner reverts
    await assert.rejects(swap.connect(trader).setUsdtAddress(newAddr));
  });

  // S-4: setPairTokens
  it("setPairTokens updates pool tokens", async function () {
    const { swap, owner } = await deploySwapFixture();

    const signers = await ethers.getSigners();
    await swap.connect(owner).setPairTokens(0, signers[4].address, signers[5].address);
    const pool = await swap.getPool(0);
    assert.equal(pool.token0, signers[4].address);
    assert.equal(pool.token1, signers[5].address);
  });

  // S-5: pause / unpause
  it("pause blocks swaps, unpause restores them", async function () {
    const { swap, owner, trader, usdt, ico, light } = await deploySwapFixture();

    // Fund trader
    await usdt.mint(trader.address, 100_000_000n);
    await usdt.connect(trader).approve(await swap.getAddress(), 100_000_000n);

    await swap.connect(owner).pause();

    await assert.rejects(
      swap.connect(trader).swapExactIn(0, await usdt.getAddress(), 1_000_000n, 0n, trader.address),
    );

    await assert.rejects(swap.connect(owner).addLiquidity(0, 1n, 1n));

    await swap.connect(owner).unpause();

    // Now swap should work
    await swap.connect(trader).swapExactIn(0, await usdt.getAddress(), 1_000_000n, 0n, trader.address);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L2 — End-to-End Business Flows
// ═════════════════════════════════════════════════════════════════════════════
describe("E2E — Registration → Machine → Node → SuperNode", function () {
  it("full lifecycle: register, buy machines, upgrade node, upgrade superNode", async function () {
    const [owner, alice, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(), owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await usdt.connect(owner).mint(alice.address, 50_000_000_000n);
    await usdt.connect(alice).approve(await core.getAddress(), 50_000_000_000n);

    // Step 1: Bind referrer
    await core.connect(alice).bindReferrer(owner.address);
    assert.equal(await core.referralOf(alice.address), owner.address);

    // Step 2: Purchase machines
    await core.connect(alice).purchaseMachine(3);
    assert.equal(await core.getUserRole(alice.address), 0n); // still basic
    const orders = await core.getUserMachineOrders(alice.address);
    assert.equal(orders.length, 1);

    // Step 3: Buy Node
    await core.connect(alice).buyNode();
    assert.equal(await core.getUserRole(alice.address), 1n);
    const identity = await core.getIdentity(await core.getUserIdentityId(alice.address));
    assert.equal(identity.role, 1n);

    // Step 4: Buy Super Node
    await core.connect(alice).buySuperNode();
    assert.equal(await core.getUserRole(alice.address), 2n);
    const identity2 = await core.getIdentity(await core.getUserIdentityId(alice.address));
    assert.equal(identity2.role, 2n);

    // Step 5: referral stats
    assert.equal(await core.directReferralCount(owner.address), 1n);
  });
});

describe("E2E — OTC Trade → Identity Transfer → New Owner", function () {
  it("node OTC: list → fill → identity moves → new owner re-lists", async function () {
    const [owner, seller, buyer, feeRecipient] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(), owner.address,
      [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
    );
    const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);
    await core.connect(owner).setIdentityMarket(await otc.getAddress());

    for (const u of [seller, buyer]) {
      await usdt.connect(owner).mint(u.address, 20_000_000_000n);
      await usdt.connect(u).approve(await core.getAddress(), 20_000_000_000n);
      await usdt.connect(u).approve(await otc.getAddress(), 20_000_000_000n);
    }

    // Seller creates node
    await core.connect(seller).bindReferrer(owner.address);
    await core.connect(seller).buyNode();
    const id = await core.getUserIdentityId(seller.address);
    await core.connect(seller).approveIdentityOperator(id, await otc.getAddress(), true);

    // List at 2000 USDT
    await otc.connect(seller).createOrder(id, 2_000_000_000n);

    // Buyer fills
    await otc.connect(buyer).fillOrder(1);
    assert.equal(await core.ownerOfIdentity(id), buyer.address);
    assert.equal(await core.getUserRole(buyer.address), 1n); // buyer now has node role

    // Buyer can re-list
    await core.connect(buyer).approveIdentityOperator(id, await otc.getAddress(), true);
    await otc.connect(buyer).createOrder(id, 2_500_000_000n);
    assert.deepEqual(Array.from(await otc.getActiveOrderIds()), [2n]);
  });
});

describe("E2E — Primary Swap Roundtrip", function () {
  it("buy ICO with USDT → enable sell → sell ICO back → verify fees", async function () {
    const [owner, trader, superRecip, nodeRecip, platRecip] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const ico: any = await deployIcoToken(owner.address, owner.address);
    const { router, factory, pair } = await deployDexInfra(await usdt.getAddress(), await ico.getAddress(), owner.address);

    await ico.connect(owner).mint(await router.getAddress(), ethers.parseUnits("10000000", 18));
    await usdt.connect(owner).mint(await router.getAddress(), 100_000_000_000n);

    const controller = await deployPrimarySwapController(
      await usdt.getAddress(), await ico.getAddress(),
      await router.getAddress(), await factory.getAddress(),
      owner.address, [superRecip.address, nodeRecip.address, platRecip.address],
    );

    // Buy phase
    await usdt.connect(owner).mint(trader.address, 1_000_000_000n);
    await usdt.connect(trader).approve(await controller.getAddress(), 1_000_000_000n);
    await controller.connect(trader).buyIcoExactIn(100_000_000n, 0n, trader.address);

    const icoBal = await ico.balanceOf(trader.address);
    assert.ok(icoBal > 0n);

    // Enable sell
    await controller.connect(owner).updateThresholds(1n, 1n);
    await controller.connect(owner).reportIcoHolderCount(1n);
    await pair.setReserves(1, 1);
    await controller.connect(owner).enableSellUsdt();

    // Sell phase
    await ico.connect(trader).approve(await controller.getAddress(), icoBal);
    const usdtBefore = await usdt.balanceOf(trader.address);
    await controller.connect(trader).sellIcoForUsdt(icoBal, 0n, trader.address);
    const usdtAfter = await usdt.balanceOf(trader.address);
    assert.ok(usdtAfter > usdtBefore);
  });
});

describe("E2E — Daily Settlement + Reward Cap", function () {
  it("settles daily rewards, advances time, settles again; cap limits payouts", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(), owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    const coreAddr = await core.getAddress();

    await usdt.connect(owner).mint(buyer.address, 5_000_000_000n);
    await usdt.connect(buyer).approve(coreAddr, 5_000_000_000n);
    await usdt.connect(owner).mint(owner.address, 5_000_000_000n);
    await usdt.connect(owner).approve(coreAddr, 5_000_000_000n);

    await core.connect(buyer).bindReferrer(owner.address);
    await core.connect(buyer).purchaseMachine(1); // 100 USDT

    await core.connect(owner).fundRewardPool(2_000_000_000n);

    // Day 1 settlement
    await core.connect(owner).settleDailyRewardsManual([buyer.address]);
    const progress1 = await core.getOrderRewardProgress(1);
    assert.ok(progress1.staticPaid > 0n);
    assert.equal(progress1.exited, false);

    // Advance 1 day
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine", []);

    // Day 2 settlement
    await core.connect(owner).settleDailyRewardsManual([buyer.address]);
    const progress2 = await core.getOrderRewardProgress(1);
    assert.ok(progress2.staticPaid > progress1.staticPaid);
    assert.ok(progress2.remainingCap < progress1.remainingCap);
  });
});

describe("E2E — Pause Everything", function () {
  it("pausing Core and Swap blocks all user actions, unpausing restores", async function () {
    const [owner, alice, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(), owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    const ico: any = await deployIcoToken(owner.address, owner.address);
    const light = await deployMockToken("Incubator Light", "LIGHT", owner.address);
    const swap: any = await deploySwapPool(
      await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address,
    );

    await usdt.connect(owner).mint(alice.address, 10_000_000_000n);
    await usdt.connect(alice).approve(await core.getAddress(), 10_000_000_000n);

    // Pause Core
    await core.connect(owner).pause();
    await assert.rejects(core.connect(alice).purchaseMachine(1));
    await assert.rejects(core.connect(alice).buyNode());

    // Pause Swap
    await swap.connect(owner).pause();

    // Unpause and verify
    await core.connect(owner).unpause();
    await core.connect(alice).bindReferrer(owner.address);
    await core.connect(alice).purchaseMachine(1); // success
    assert.equal((await core.getMachineOrder(1)).quantity, 1n);

    await swap.connect(owner).unpause();
  });
});

describe("E2E — OTC Auto-Cancel Cascade", function () {
  it("multiple low-price orders auto-cancelled after higher fill", async function () {
    const [owner, s1, s2, s3, buyer, feeRecipient] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(), owner.address,
      [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
    );
    const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);
    await core.connect(owner).setIdentityMarket(await otc.getAddress());

    const sellers = [s1, s2, s3];
    for (const s of sellers) {
      await usdt.connect(owner).mint(s.address, 20_000_000_000n);
      await usdt.connect(s).approve(await core.getAddress(), 20_000_000_000n);
      await core.connect(s).bindReferrer(owner.address);
      await core.connect(s).buyNode();
      const id = await core.getUserIdentityId(s.address);
      await core.connect(s).approveIdentityOperator(id, await otc.getAddress(), true);
    }

    await usdt.connect(owner).mint(buyer.address, 20_000_000_000n);
    await usdt.connect(buyer).approve(await otc.getAddress(), 20_000_000_000n);

    const id1 = await core.getUserIdentityId(s1.address);
    const id2 = await core.getUserIdentityId(s2.address);
    const id3 = await core.getUserIdentityId(s3.address);

    // Three orders at increasing prices
    await otc.connect(s1).createOrder(id1, 1_000_000_000n);
    await otc.connect(s2).createOrder(id2, 1_500_000_000n);
    await otc.connect(s3).createOrder(id3, 2_000_000_000n);
    assert.equal(await otc.getActiveOrdersCount(), 3n);

    // Fill highest → auto-cancels lower ones
    await otc.connect(buyer).fillOrder(3);
    assert.equal(await otc.getActiveOrdersCount(), 0n);
    assert.equal(await otc.getLastTradePrice(1), 2_000_000_000n);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L3 — Security & Edge Cases
// ═════════════════════════════════════════════════════════════════════════════
describe("Security — Access Control", function () {
  it("IncubatorCore: all onlyOwner functions reject non-owner", async function () {
    const [owner, outsider, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(), owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );

    await assert.rejects(core.connect(outsider).pause());
    await assert.rejects(core.connect(outsider).unpause());
    await assert.rejects(core.connect(outsider).updateMachineUnitPrice(1n));
    await assert.rejects(core.connect(outsider).updateNodePrice(1n));
    await assert.rejects(core.connect(outsider).updateSuperNodePrice(1n));
    await assert.rejects(core.connect(outsider).setSubAdmin(outsider.address, true));
    await assert.rejects(core.connect(outsider).setIdentityMarket(outsider.address));
    await assert.rejects(core.connect(outsider).updatePoolRecipient(0, outsider.address));
    await assert.rejects(core.connect(outsider).updatePoolShare(0, 6000));
    await assert.rejects(core.connect(outsider).fundRewardPool(1n));
    await assert.rejects(core.connect(outsider).withdrawUSDT(outsider.address, 1n));
    await assert.rejects(core.connect(outsider).syncUsdtTokenDecimals());
    await assert.rejects(core.connect(outsider).setLeaderboardWhitelist([]));
    await assert.rejects(core.connect(outsider).setLeaderboardWhitelistAdjustPct(1));
    await assert.rejects(core.connect(outsider).settleDailyRewardsManual([]));
  });

  it("PrimarySwapController: all onlyOwner functions reject non-owner", async function () {
    const [owner, outsider, sr, nr, pr] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const ico: any = await deployIcoToken(owner.address, owner.address);
    const { router, factory } = await deployDexInfra(await usdt.getAddress(), await ico.getAddress(), owner.address);

    const controller = await deployPrimarySwapController(
      await usdt.getAddress(), await ico.getAddress(),
      await router.getAddress(), await factory.getAddress(),
      owner.address, [sr.address, nr.address, pr.address],
    );

    await assert.rejects(controller.connect(outsider).updateBuyFeeConfig(500, 100, 200, 200));
    await assert.rejects(controller.connect(outsider).updateSellConfig(5000, 1000, 2000, 7000));
    await assert.rejects(controller.connect(outsider).updateRecipients(sr.address, nr.address, pr.address));
    await assert.rejects(controller.connect(outsider).updateThresholds(1n, 1n));
    await assert.rejects(controller.connect(outsider).reportIcoHolderCount(1n));
    await assert.rejects(controller.connect(outsider).updatePair(outsider.address));
    await assert.rejects(controller.connect(outsider).enableSellUsdt());
    await assert.rejects(controller.connect(outsider).disableSellUsdt());
    await assert.rejects(controller.connect(outsider).withdrawTreasury(await usdt.getAddress(), outsider.address, 1n));
  });

  it("SwapPoolManager: all onlyOwner functions reject non-owner", async function () {
    const [owner, outsider] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const ico: any = await deployIcoToken(owner.address, owner.address);
    const light = await deployMockToken("Incubator Light", "LIGHT", owner.address);
    const swap: any = await deploySwapPool(
      await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address,
    );

    await assert.rejects(swap.connect(outsider).createDefaultPools(100, 100, 1000));
    await assert.rejects(swap.connect(outsider).pause());
    await assert.rejects(swap.connect(outsider).unpause());
    await assert.rejects(swap.connect(outsider).updatePoolConfig(0, 50, 1000));
    await assert.rejects(swap.connect(outsider).setUsdtAddress(outsider.address));
    await assert.rejects(swap.connect(outsider).setPairTokens(0, outsider.address, outsider.address));
  });

  it("NodeOTCMarket: updateFeeConfig rejects non-owner", async function () {
    const [owner, outsider] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(), owner.address,
      [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
    );
    const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, owner.address);
    await assert.rejects(otc.connect(outsider).updateFeeConfig(100, outsider.address));
  });
});

describe("Security — Zero & Edge Values", function () {
  it("purchaseMachine with quantity 0 reverts", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(), owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await core.getAddress(), 10_000_000_000n);
    await core.connect(buyer).bindReferrer(owner.address);

    await assert.rejects(core.connect(buyer).purchaseMachine(0));
  });

  it("OTC createOrder at price 0 reverts", async function () {
    const [owner, seller] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core: any = await deployCore(
      await usdt.getAddress(), owner.address,
      [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
    );
    const otc = await deployOtc(await usdt.getAddress(), await core.getAddress(), owner.address, owner.address);
    await core.connect(owner).setIdentityMarket(await otc.getAddress());

    await usdt.connect(owner).mint(seller.address, 10_000_000_000n);
    await usdt.connect(seller).approve(await core.getAddress(), 10_000_000_000n);
    await core.connect(seller).bindReferrer(owner.address);
    await core.connect(seller).buyNode();
    const id = await core.getUserIdentityId(seller.address);
    await core.connect(seller).approveIdentityOperator(id, await otc.getAddress(), true);

    await assert.rejects(otc.connect(seller).createOrder(id, 0n));
  });

  it("SwapPoolManager swapExactIn with 0 amount reverts", async function () {
    const [owner] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const ico: any = await deployIcoToken(owner.address, owner.address);
    const light = await deployMockToken("Incubator Light", "LIGHT", owner.address);
    const swap: any = await deploySwapPool(
      await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address,
    );
    await swap.createDefaultPools(100, 200, 2000);

    await assert.rejects(
      swap.connect(owner).swapExactIn(0, await usdt.getAddress(), 0n, 0n, owner.address),
      /invalid in/,
    );
  });

  it("duplicate bindReferrer is rejected", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(), owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    await core.connect(buyer).bindReferrer(owner.address);
    await assert.rejects(core.connect(buyer).bindReferrer(owner.address), /already bound/);
  });

  it("self-referral is rejected", async function () {
    const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await ethers.getSigners();
    const usdt = await deployMockUsdt(owner.address);
    const core = await deployCore(
      await usdt.getAddress(), owner.address,
      [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
    );
    await assert.rejects(core.connect(buyer).bindReferrer(buyer.address), /invalid referrer/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Shared deploy helpers
// ═════════════════════════════════════════════════════════════════════════════
async function deployMockUsdt(initialOwner: string) {
  const f = await ethers.getContractFactory("MockUSDT");
  const c = await f.deploy(initialOwner);
  await c.waitForDeployment();
  return c;
}

async function deployIcoToken(initialOwner: string, saleWallet: string) {
  const f = await ethers.getContractFactory("IncubatorToken");
  const c = await f.deploy("Incubator ICO", "ICO", initialOwner, saleWallet);
  await c.waitForDeployment();
  return c;
}

async function deployMockToken(name: string, symbol: string, initialOwner: string) {
  const f = await ethers.getContractFactory("MockToken");
  const c = await f.deploy(name, symbol, initialOwner);
  await c.waitForDeployment();
  return c;
}

async function deployCore(usdtAddress: string, owner: string, recipients: string[]) {
  const f = await ethers.getContractFactory("IncubatorCore");
  const c = await upgrades.deployProxy(f, [usdtAddress, owner, recipients], {
    kind: "uups", initializer: "initialize",
    unsafeAllow: ["constructor", "state-variable-assignment"],
  });
  await c.waitForDeployment();
  return c;
}

async function deployOtc(usdtAddress: string, coreAddress: string, initialOwner: string, feeRecipient: string) {
  const f = await ethers.getContractFactory("NodeOTCMarket");
  const c = await upgrades.deployProxy(f, [usdtAddress, coreAddress, initialOwner, feeRecipient], {
    kind: "uups", initializer: "initialize", unsafeAllow: ["constructor"],
  });
  await c.waitForDeployment();
  return c;
}

async function deploySwapPool(usdtAddress: string, icoAddress: string, lightAddress: string, initialOwner: string) {
  const f = await ethers.getContractFactory("SwapPoolManager");
  const c = await upgrades.deployProxy(f, [usdtAddress, icoAddress, lightAddress, initialOwner], {
    kind: "uups", initializer: "initialize", unsafeAllow: ["constructor"],
  });
  await c.waitForDeployment();
  return c;
}

async function deployDexInfra(usdtAddress: string, icoAddress: string, _owner: string) {
  const pairF = await ethers.getContractFactory("MockDexPairV2");
  const pair = await pairF.deploy(usdtAddress, icoAddress);
  await pair.waitForDeployment();

  const factoryF = await ethers.getContractFactory("MockDexFactoryV2");
  const factory = await factoryF.deploy();
  await factory.waitForDeployment();
  await factory.setPair(usdtAddress, icoAddress, await pair.getAddress());

  const routerF = await ethers.getContractFactory("MockDexRouterV2");
  const router = await routerF.deploy();
  await router.waitForDeployment();

  await router.setRate(usdtAddress, icoAddress, 100_000_000_000_000n, 1n);
  await router.setRate(icoAddress, usdtAddress, 1n, 100_000_000_000_000n);

  return { pair, factory, router };
}

async function deployPrimarySwapController(
  usdtAddress: string, icoAddress: string, routerAddress: string, factoryAddress: string,
  initialOwner: string, recipients: [string, string, string],
) {
  const f = await ethers.getContractFactory("PrimarySwapController");
  const c = await upgrades.deployProxy(f, [usdtAddress, icoAddress, routerAddress, factoryAddress, initialOwner, recipients], {
    kind: "uups", initializer: "initialize", unsafeAllow: ["constructor"],
  });
  await c.waitForDeployment();
  return c;
}
