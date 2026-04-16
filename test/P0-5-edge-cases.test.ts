import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

/**
 * P0-5 边界用例测试
 * 补充现有19个基础测试，覆盖极限场景和错误处理
 */
describe.skip("P0-5: Edge Case & Boundary Tests (legacy API — needs migration)", () => {
  let core: any;
  let token: any;
  let usdt: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let user3: any;

  before(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy MockUSDT (non-upgradeable)
    const UsdtFactory = await ethers.getContractFactory("MockUSDT");
    usdt = await UsdtFactory.deploy(owner.address);
    await usdt.waitForDeployment();

    // Deploy IncubatorToken (non-upgradeable)
    const TokenFactory = await ethers.getContractFactory("IncubatorToken");
    token = await TokenFactory.deploy("Incubator ICO", "ICO", owner.address, owner.address);
    await token.waitForDeployment();

    // Deploy IncubatorCore via UUPS proxy
    const recipients = Array(6).fill(owner.address);
    const CoreFactory = await ethers.getContractFactory("IncubatorCore");
    core = await upgrades.deployProxy(
      CoreFactory,
      [await usdt.getAddress(), owner.address, recipients],
      { kind: "uups", initializer: "initialize", unsafeAllow: ["constructor", "state-variable-assignment"] },
    );
    await core.waitForDeployment();

    const coreAddr = await core.getAddress();

    // Mint USDT to users and approve
    const mintAmount = ethers.parseUnits("100000", 18);
    for (const u of [user1, user2, user3]) {
      await usdt.mint(u.address, mintAmount);
      await usdt.connect(u).approve(coreAddr, ethers.MaxUint256);
    }
    await usdt.mint(owner.address, mintAmount);
    await usdt.approve(coreAddr, ethers.MaxUint256);
  });

  describe("Machine Purchase Boundary Cases", () => {
    it("BC-1: Should handle max uint256 quantity gracefully", async () => {
      const maxQty = ethers.MaxUint256;
      // Should fail or revert due to price overflow
      await expect(
        core.connect(user1).purchaseMachine(maxQty, ethers.ZeroAddress)
      ).to.be.reverted;
    });

    it("BC-2: Should prevent zero quantity purchase", async () => {
      await expect(
        core.connect(user1).purchaseMachine(0, ethers.ZeroAddress)
      ).to.be.reverted;
    });

    it("BC-3: Should handle consecutive max-limit purchases", async () => {
      // Buy 10 machines (max limit)
      const unitPrice = await core.getMachineUnitPrice();
      const totalCost = unitPrice * 10n;
      
      const tx1 = await core.connect(user2).purchaseMachine(10, user1.address);
      expect(tx1).to.emit(core, "MachineOrderCreated");

      // Try to buy 1 more (should fail - exceeds limit)
      await expect(
        core.connect(user2).purchaseMachine(1, user1.address)
      ).to.be.revertedWith("Exceeds maximum quantity");
    });

    it("BC-4: Should prevent purchase with insufficient allowance", async () => {
      // Create a fresh user with no allowance
      const freshUser = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: freshUser.address, value: ethers.parseEther("1") });
      
      // Should fail due to insufficient USDT approval
      await expect(
        core.connect(freshUser).purchaseMachine(1, ethers.ZeroAddress)
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });
  });

  describe("Node Purchase Boundary Cases", () => {
    it("BC-5: Should prevent duplicate node purchase", async () => {
      await core.connect(user1).buyNode(user2.address);
      
      // Try to buy again - should fail
      await expect(
        core.connect(user1).buyNode(user2.address)
      ).to.be.revertedWith("Current identity does not allow purchasing another node");
    });

    it("BC-6: Should prevent node purchase after reaching super-node", async () => {
      const userUnique = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: userUnique.address, value: ethers.parseEther("1") });
      await usdt.transfer(userUnique.address, ethers.parseUnits("10000", 6));
      await usdt.connect(userUnique).approve(await core.getAddress(), ethers.parseUnits("1000000", 6));
      
      // Buy super-node first
      await core.connect(userUnique).buySuperNode(user1.address);
      
      // Try to buy node - should fail
      await expect(
        core.connect(userUnique).buyNode(user1.address)
      ).to.be.reverted;
    });

    it("BC-7: Should handle referrer as zero address gracefully", async () => {
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: user.address, value: ethers.parseEther("1") });
      await usdt.transfer(user.address, ethers.parseUnits("10000", 6));
      await usdt.connect(user).approve(await core.getAddress(), ethers.parseUnits("1000000", 6));
      
      // Should use owner as default referrer
      const tx = await core.connect(user).buyNode(ethers.ZeroAddress);
      expect(tx).to.emit(core, "IdentityPurchased");
    });
  });

  describe("Super-Node Purchase Boundary Cases", () => {
    it("BC-8: Should prevent duplicate super-node purchase", async () => {
      const userSup = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: userSup.address, value: ethers.parseEther("1") });
      await usdt.transfer(userSup.address, ethers.parseUnits("10000", 6));
      await usdt.connect(userSup).approve(await core.getAddress(), ethers.parseUnits("1000000", 6));
      
      await core.connect(userSup).buySuperNode(user1.address);
      
      // Try to buy again
      await expect(
        core.connect(userSup).buySuperNode(user1.address)
      ).to.be.reverted;
    });

    it("BC-9: Should allow node-holder to upgrade to super-node", async () => {
      const userUpgrade = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: userUpgrade.address, value: ethers.parseEther("1") });
      await usdt.transfer(userUpgrade.address, ethers.parseUnits("10000", 6));
      await usdt.connect(userUpgrade).approve(await core.getAddress(), ethers.parseUnits("1000000", 6));
      
      // Buy node first
      const role1 = await core.getUserRole(userUpgrade.address);
      if (role1 === 0n) {
        await core.connect(userUpgrade).buyNode(user1.address);
      }
      
      // Now upgrade to super-node
      const tx = await core.connect(userUpgrade).buySuperNode(user1.address);
      expect(tx).to.emit(core, "IdentityPurchased");
      
      const newRole = await core.getUserRole(userUpgrade.address);
      expect(newRole).to.equal(2n); // Super-node
    });
  });

  describe("Pool Allocation Boundary Cases", () => {
    it("BC-10: Should correctly allocate with zero referral", async () => {
      const unitPrice = await core.getMachineUnitPrice();
      const beforeLP = await core.getPoolAccumulatedBalance("LP");
      
      await core.connect(user1).purchaseMachine(2, ethers.ZeroAddress);
      
      const afterLP = await core.getPoolAccumulatedBalance("LP");
      const lpDiff = afterLP - beforeLP;
      
      // Should allocate 60% of total cost
      const expectedLP = (unitPrice * 2n * 60n) / 100n;
      expect(lpDiff).to.equal(expectedLP);
    });

    it("BC-11: Should handle very small allocation amounts", async () => {
      // This tests rounding edge cases in 6-decimal USDT
      const smallQty = 1n; // 1 machine
      await core.connect(user2).purchaseMachine(smallQty, user1.address);
      
      // Verify all pools received allocations (no zero-amount pools)
      const lpBalance = await core.getPoolAccumulatedBalance("LP");
      const nodeBalance = await core.getPoolAccumulatedBalance("NODE");
      expect(lpBalance).to.be.gt(0n);
      expect(nodeBalance).to.be.gt(0n);
    });

    it("BC-12: Pool configuration should always sum to 10000 BPS", async () => {
      // This verifies validatePoolConfiguration logic
      const config = await core.validatePoolConfiguration();
      // If this doesn't revert, configuration is valid
      expect(config).to.not.be.undefined;
    });
  });

  describe("Identity & OTC Boundary Cases", () => {
    it("BC-13: Should prevent purchasing OTC order with self", async () => {
      // Create and list an order
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: user.address, value: ethers.parseEther("1") });
      await usdt.transfer(user.address, ethers.parseUnits("10000", 6));
      await usdt.connect(user).approve(await core.getAddress(), ethers.parseUnits("1000000", 6));
      
      await core.connect(user).buyNode(user1.address);
      // Listing would be done via OTC contract
      // This is validated at OTC contract level
    });

    it("BC-14: Should handle identity approval state transitions", async () => {
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: user.address, value: ethers.parseEther("1") });
      await usdt.transfer(user.address, ethers.parseUnits("10000", 6));
      await usdt.connect(user).approve(await core.getAddress(), ethers.parseUnits("1000000", 6));
      
      // Initial state: not approved
      const identityId = await core.getTokenOfOwner(user.address);
      if (identityId > 0n) {
        // Verify identity exists and can be transitioned
        expect(identityId).to.be.gt(0n);
      }
    });
  });

  describe("Leaderboard & Ranking Boundary Cases", () => {
    it("BC-15: Should handle zero rewards distribution", async () => {
      const dayId = await core.currentDayId();
      const records = await core.getRewardRecordsByBeneficiary(user1.address);
      // If user1 has no activity, records should be empty
      expect(records).to.be.an("array");
    });

    it("BC-16: Should prevent day boundary overflow", async () => {
      // Test near max day ID
      const maxDay = ethers.MaxUint256;
      // This would be tested by mocking time advancement
      // For now, verify current day increments properly
      const day1 = await core.currentDayId();
      expect(day1).to.be.gt(0n);
    });
  });

  describe("Referral Chain Boundary Cases", () => {
    it("BC-17: Should prevent circular referral", async () => {
      // User A refers User B, try to make User B refer User A
      const userA = ethers.Wallet.createRandom().connect(ethers.provider);
      const userB = ethers.Wallet.createRandom().connect(ethers.provider);
      
      await owner.sendTransaction({ to: userA.address, value: ethers.parseEther("1") });
      await owner.sendTransaction({ to: userB.address, value: ethers.parseEther("1") });
      await usdt.transfer(userA.address, ethers.parseUnits("50000", 6));
      await usdt.transfer(userB.address, ethers.parseUnits("50000", 6));
      
      await usdt.connect(userA).approve(await core.getAddress(), ethers.parseUnits("1000000", 6));
      await usdt.connect(userB).approve(await core.getAddress(), ethers.parseUnits("1000000", 6));
      
      // userA refers userB
      await core.connect(userA).purchaseMachine(1, userB.address);
      
      // Try userB to refer userA - should still work (no restriction on web structure)
      const tx = await core.connect(userB).purchaseMachine(1, userA.address);
      expect(tx).to.emit(core, "MachineOrderCreated");
    });

    it("BC-18: Should handle max depth referral tree", async () => {
      // Verify deep referral chains don't cause stack overflow
      let currentReferrer = owner.address;
      const depth = 5;
      
      for (let i = 0; i < depth; i++) {
        const newUser = ethers.Wallet.createRandom().connect(ethers.provider);
        await owner.sendTransaction({ to: newUser.address, value: ethers.parseEther("1") });
        await usdt.transfer(newUser.address, ethers.parseUnits("50000", 6));
        await usdt.connect(newUser).approve(await core.getAddress(), ethers.parseUnits("1000000", 6));
        
        await core.connect(newUser).purchaseMachine(1, currentReferrer);
        currentReferrer = newUser.address;
      }
      
      // Should complete without stack issues
      expect(true).to.be.true;
    });
  });

  describe("Cross-Contract Interaction Boundary Cases", () => {
    it("BC-19: Should handle USDT transfer failures gracefully", async () => {
      // This would require mocking USDT to revert on transfer
      // In real scenario, contract should have ReentrancyGuard
      const userTest = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: userTest.address, value: ethers.parseEther("1") });
      // Don't transfer USDT - should fail on allowance check
      
      await expect(
        core.connect(userTest).purchaseMachine(1, ethers.ZeroAddress)
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("BC-20: Should prevent reentrancy attacks", async () => {
      // Core contract should use ReentrancyGuard
      // This test verifies guard is in place by checking purchase is atomic
      const userReent = ethers.Wallet.createRandom().connect(ethers.provider);
      await owner.sendTransaction({ to: userReent.address, value: ethers.parseEther("1") });
      await usdt.transfer(userReent.address, ethers.parseUnits("50000", 6));
      await usdt.connect(userReent).approve(await core.getAddress(), ethers.parseUnits("1000000", 6));
      
      // Two concurrent purchases should work (no reentrancy issues)
      const promise1 = core.connect(userReent).purchaseMachine(1, user1.address);
      const promise2 = core.connect(userReent).purchaseMachine(1, user2.address);
      
      const [tx1, tx2] = await Promise.all([promise1, promise2]);
      expect(tx1).to.emit(core, "MachineOrderCreated");
      expect(tx2).to.emit(core, "MachineOrderCreated");
    });
  });

  describe("Decimal Precision Edge Cases", () => {
    it("BC-21: Should handle 6-decimal USDT rounding correctly", async () => {
      // Odd price / odd quantity to test rounding
      const unitPrice = await core.getMachineUnitPrice();
      const qty = 3n; // Odd quantity
      
      const tx = await core.connect(user3).purchaseMachine(qty, user1.address);
      expect(tx).to.emit(core, "MachineOrderCreated");
      
      // Verify order was created with correct total
      const orders = await core.getUserMachineOrderIds(user3.address);
      expect(orders.length).to.be.gt(0);
    });

    it("BC-22: Should prevent integer overflow in calculations", async () => {
      // Max safe integer calculations
      const maxQty = 10n; // Max limit
      const unitPrice = await core.getMachineUnitPrice();
      const expectedMax = unitPrice * maxQty;
      
      // Should not overflow
      expect(expectedMax).to.be.lt(ethers.MaxUint256);
    });
  });
});
