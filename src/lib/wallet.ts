import { BrowserProvider } from "ethers";
import { SEPOLIA_CHAIN_ID, SEPOLIA_HEX_CHAIN_ID } from "../config";

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("未检测到钱包插件，请先安装 MetaMask");
  }

  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();

  return {
    provider,
    signer,
    address: await signer.getAddress(),
    chainId: Number(network.chainId),
  };
}

export async function checkConnection() {
  if (!window.ethereum) return null;
  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_accounts", []);
  if (accounts.length > 0) {
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();
    return {
      provider,
      signer,
      address: await signer.getAddress(),
      chainId: Number(network.chainId),
    };
  }
  return null;
}

export function listenToWalletEvents(
  onAccountsChanged: (accounts: string[]) => void,
  onChainChanged: (chainId: string) => void
) {
  if (!window.ethereum) return () => {};

  window.ethereum.on("accountsChanged", onAccountsChanged);
  window.ethereum.on("chainChanged", onChainChanged);

  return () => {
    window.ethereum?.removeListener("accountsChanged", onAccountsChanged);
    window.ethereum?.removeListener("chainChanged", onChainChanged);
  };
}

export async function ensureSepoliaNetwork() {
  if (!window.ethereum) {
    throw new Error("未检测到钱包插件");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_HEX_CHAIN_ID }],
    });
  } catch (error) {
    const err = error as { code?: number };
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_HEX_CHAIN_ID,
            chainName: "Sepolia",
            rpcUrls: ["https://rpc.sepolia.org"],
            nativeCurrency: {
              name: "Sepolia ETH",
              symbol: "SEP",
              decimals: 18,
            },
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    } else {
      throw error;
    }
  }
}

export function isOnSepolia(chainId: number) {
  return chainId === SEPOLIA_CHAIN_ID;
}
