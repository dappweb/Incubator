import { ethers, upgrades } from "hardhat";
import * as assert from "node:assert/strict";

describe("PrimarySwapController", function () {
  it("charges 5% USDT fee on buy and swaps the remaining amount to ICO", async function () {
    const [owner, buyer, superNodeRecipient, nodePoolRecipient, platformRecipient] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const ico = await deployBurnableToken(owner.address);
    const { router, factory } = await deployDexInfra(await usdt.getAddress(), await ico.getAddress(), owner.address);

    await ico.connect(owner).mint(await router.getAddress(), ethers.parseUnits("1000000", 18));
    await usdt.connect(owner).mint(buyer.address, 1_000_000_000n);

    const controller = await deployController(
      await usdt.getAddress(),
      await ico.getAddress(),
      await router.getAddress(),
      await factory.getAddress(),
      owner.address,
      [superNodeRecipient.address, nodePoolRecipient.address, platformRecipient.address],
    );

    await usdt.connect(buyer).approve(await controller.getAddress(), 1_000_000_000n);

    const amountIn = 100_000_000n;
    await controller.connect(buyer).buyIcoExactIn(amountIn, 0n, buyer.address);

    assert.equal(await usdt.balanceOf(superNodeRecipient.address), 1_000_000n);
    assert.equal(await usdt.balanceOf(nodePoolRecipient.address), 2_000_000n);
    assert.equal(await usdt.balanceOf(platformRecipient.address), 2_000_000n);
    assert.equal(await ico.balanceOf(buyer.address), ethers.parseUnits("9500", 18));
  });

  it("enables ICO->USDT only after thresholds and applies burn/platform/liquidity plus 5% USDT fee", async function () {
    const [owner, seller, superNodeRecipient, nodePoolRecipient, platformRecipient] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const ico = await deployBurnableToken(owner.address);
    const { router, factory, pair } = await deployDexInfra(await usdt.getAddress(), await ico.getAddress(), owner.address);

    await usdt.connect(owner).mint(await router.getAddress(), 10_000_000_000n);
    await ico.connect(owner).mint(seller.address, ethers.parseUnits("1000", 18));

    const controller = await deployController(
      await usdt.getAddress(),
      await ico.getAddress(),
      await router.getAddress(),
      await factory.getAddress(),
      owner.address,
      [superNodeRecipient.address, nodePoolRecipient.address, platformRecipient.address],
    );

    await controller.connect(owner).updateThresholds(1n, 1n);
    await controller.connect(owner).reportIcoHolderCount(1n);
    await pair.setReserves(1, 1);
    await controller.connect(owner).enableSellUsdt();

    await ico.connect(seller).approve(await controller.getAddress(), ethers.parseUnits("1000", 18));

    await controller.connect(seller).sellIcoForUsdt(ethers.parseUnits("1000", 18), 0n, seller.address);

    assert.equal(await ico.balanceOf(platformRecipient.address), ethers.parseUnits("200", 18));
    assert.equal(await ico.balanceOf(await router.getAddress()), ethers.parseUnits("700", 18));
    assert.equal(await usdt.balanceOf(seller.address), 6_650_000n);
    assert.equal(await usdt.balanceOf(superNodeRecipient.address), 70_000n);
    assert.equal(await usdt.balanceOf(nodePoolRecipient.address), 140_000n);
    assert.equal(await usdt.balanceOf(platformRecipient.address), 140_000n);
  });

  it("blocks ICO->USDT before the sell gate is enabled", async function () {
    const [owner, seller, superNodeRecipient, nodePoolRecipient, platformRecipient] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const ico = await deployBurnableToken(owner.address);
    const { router, factory } = await deployDexInfra(await usdt.getAddress(), await ico.getAddress(), owner.address);

    const controller = await deployController(
      await usdt.getAddress(),
      await ico.getAddress(),
      await router.getAddress(),
      await factory.getAddress(),
      owner.address,
      [superNodeRecipient.address, nodePoolRecipient.address, platformRecipient.address],
    );

    await ico.connect(owner).mint(seller.address, ethers.parseUnits("100", 18));
    await ico.connect(seller).approve(await controller.getAddress(), ethers.parseUnits("100", 18));

    await assert.rejects(
      controller.connect(seller).sellIcoForUsdt(ethers.parseUnits("100", 18), 0n, seller.address),
      /sell usdt disabled/,
    );
  });
});

async function deployMockUsdt(initialOwner: string) {
  const factory = await ethers.getContractFactory("MockUSDT");
  const contract = await factory.deploy(initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployBurnableToken(initialOwner: string) {
  const factory = await ethers.getContractFactory("IncubatorToken");
  const contract = await factory.deploy("Incubator ICO", "ICO", initialOwner, initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployDexInfra(usdtAddress: string, icoAddress: string, owner: string) {
  const pairFactory = await ethers.getContractFactory("MockDexPairV2");
  const pair = await pairFactory.deploy(usdtAddress, icoAddress);
  await pair.waitForDeployment();

  const factoryFactory = await ethers.getContractFactory("MockDexFactoryV2");
  const factory = await factoryFactory.deploy();
  await factory.waitForDeployment();
  await factory.setPair(usdtAddress, icoAddress, await pair.getAddress());

  const routerFactory = await ethers.getContractFactory("MockDexRouterV2");
  const router = await routerFactory.deploy();
  await router.waitForDeployment();

  // 1 USDT = 100 ICO. USDT has 6 decimals, ICO has 18 decimals.
  await router.setRate(usdtAddress, icoAddress, 100_000_000_000_000n, 1n);
  await router.setRate(icoAddress, usdtAddress, 1n, 100_000_000_000_000n);

  return { pair, factory, router, owner };
}

async function deployController(
  usdtAddress: string,
  icoAddress: string,
  routerAddress: string,
  factoryAddress: string,
  initialOwner: string,
  recipients: [string, string, string],
) {
  const factory = await ethers.getContractFactory("PrimarySwapController");
  const contract = await upgrades.deployProxy(factory, [usdtAddress, icoAddress, routerAddress, factoryAddress, initialOwner, recipients], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await contract.waitForDeployment();
  return contract;
}