import { ethers } from "hardhat";
async function main() {
  const proxy = "0xECD96148D33A8ca8F86cd701d445FB3bbe7592E2";
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const provider = ethers.provider;
  const raw = await provider.getStorage(proxy, IMPL_SLOT);
  const impl = ethers.getAddress("0x" + raw.slice(-40));
  console.log("Proxy   :", proxy);
  console.log("Impl    :", impl);
  const code = await provider.getCode(impl);
  console.log("ImplSize:", (code.length - 2) / 2, "bytes");
  // call new functions
  const core = await ethers.getContractAt([
    "function publicSettleEnabled() view returns (bool)",
    "function minPoolSettleAmount() view returns (uint256)",
    "function roleListsBootstrapped() view returns (bool)",
    "function nodeListLength() view returns (uint256)",
    "function superNodeListLength() view returns (uint256)",
    "function lastNodePoolSettleDay() view returns (uint256)",
    "function lastSuperNodePoolSettleDay() view returns (uint256)",
  ], proxy);
  console.log("publicSettleEnabled  :", await core.publicSettleEnabled());
  console.log("minPoolSettleAmount  :", (await core.minPoolSettleAmount()).toString());
  console.log("roleListsBootstrapped:", await core.roleListsBootstrapped());
  console.log("nodeListLength       :", (await core.nodeListLength()).toString());
  console.log("superNodeListLength  :", (await core.superNodeListLength()).toString());
  console.log("lastNodePoolSettleDay:", (await core.lastNodePoolSettleDay()).toString());
  console.log("lastSuperNodeSettleDay:", (await core.lastSuperNodePoolSettleDay()).toString());
}
main().catch(e => { console.error(e); process.exit(1); });
