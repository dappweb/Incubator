import assert from "node:assert/strict";
import { ethers } from "hardhat";

describe("NodeOTCMarket", function () {
  it("prevents duplicate listings and settles completed trades", async function () {
    const [owner, seller, buyer, feeRecipient] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const identity = await deployIdentityNft(owner.address);
    const otc = await deployOtc(await usdt.getAddress(), owner.address, feeRecipient.address);

    await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
    await usdt.connect(buyer).approve(await otc.getAddress(), 10_000_000_000n);

    await identity.connect(owner).mintNode(seller.address);
    const tokenId = await identity.tokenOfOwner(seller.address);

    await identity.connect(seller).approve(await otc.getAddress(), tokenId);

    await otc.connect(seller).createOrder(await identity.getAddress(), tokenId, 2_000_000_000n);
    assert.deepEqual(await otc.getActiveOrderIds(), [1n]);
    assert.equal(await otc.getAssetActiveOrder(await identity.getAddress(), tokenId), 1n);

    await assert.rejects(
      otc.connect(seller).createOrder(await identity.getAddress(), tokenId, 2_100_000_000n),
    );

    const sellerBalanceBefore = await usdt.balanceOf(seller.address);
    const feeBalanceBefore = await usdt.balanceOf(feeRecipient.address);

    await otc.connect(buyer).fillOrder(1);

    assert.equal(await identity.ownerOf(tokenId), buyer.address);
    assert.deepEqual(await otc.getActiveOrderIds(), []);
    assert.equal(await otc.getAssetActiveOrder(await identity.getAddress(), tokenId), 0n);

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

async function deployIdentityNft(initialOwner: string) {
  const factory = await ethers.getContractFactory("IdentityNFT");
  const contract = await factory.deploy(initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployOtc(usdtAddress: string, initialOwner: string, feeRecipient: string) {
  const factory = await ethers.getContractFactory("NodeOTCMarket");
  const contract = await factory.deploy(usdtAddress, initialOwner, feeRecipient);
  await contract.waitForDeployment();
  return contract;
}