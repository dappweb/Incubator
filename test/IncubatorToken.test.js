const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("IncubatorToken", function () {
  it("burns unsold sale inventory through authorized executors and tracks totals", async function () {
    const [owner, saleWallet, burnOperator, holder] = await ethers.getSigners();

    const token = await deployIcoToken(owner.address, saleWallet.address);

    await token.connect(owner).mint(saleWallet.address, 1_000_000_000_000000000n);
    await token.connect(owner).mint(holder.address, 500_000_000_000000000n);
    await token.connect(owner).setBurnExecutor(burnOperator.address, true);

    const totalSupplyBefore = await token.totalSupply();

    await token.connect(burnOperator).burnUnsold(400_000_000_000000000n);
    await token.connect(holder).burn(100_000_000_000000000n);

    assert.equal(await token.balanceOf(saleWallet.address), 600_000_000_000000000n);
    assert.equal(await token.balanceOf(holder.address), 400_000_000_000000000n);
    assert.equal(await token.totalBurned(), 500_000_000_000000000n);
    assert.equal(totalSupplyBefore - (await token.totalSupply()), 500_000_000_000000000n);
  });

  it("rejects unsold burn from unauthorized accounts", async function () {
    const [owner, saleWallet, other] = await ethers.getSigners();

    const token = await deployIcoToken(owner.address, saleWallet.address);
    await token.connect(owner).mint(saleWallet.address, 1_000_000_000_000000000n);

    await assert.rejects(token.connect(other).burnUnsold(1n));
  });
});

async function deployIcoToken(initialOwner, saleWallet) {
  const factory = await ethers.getContractFactory("IncubatorToken");
  const contract = await factory.deploy("Incubator ICO", "ICO", initialOwner, saleWallet);
  await contract.waitForDeployment();
  return contract;
}