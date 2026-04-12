import { BrowserProvider } from "ethers";
import {
    BSC_TESTNET_CHAIN_ID,
    BSC_TESTNET_HEX_CHAIN_ID,
    ICO_TOKEN_ADDRESS,
    LIGHT_TOKEN_ADDRESS,
    USDT_CONTRACT_ADDRESS,
} from "../config";

type WalletWatchToken = {
  address: string;
  symbol: string;
  decimals: number;
};

type WalletSetupResult = {
  addedTokenCount: number;
  attemptedTokenCount: number;
};

const WATCHABLE_TOKENS: WalletWatchToken[] = [
  { address: USDT_CONTRACT_ADDRESS, symbol: "USDT", decimals: 6 },
  { address: ICO_TOKEN_ADDRESS, symbol: "ICO", decimals: 18 },
  { address: LIGHT_TOKEN_ADDRESS, symbol: "LIGHT", decimals: 18 },
];

const PROJECT_TOKENS: Record<"ICO" | "LIGHT", WalletWatchToken> = {
  ICO: { address: ICO_TOKEN_ADDRESS, symbol: "ICO", decimals: 18 },
  LIGHT: { address: LIGHT_TOKEN_ADDRESS, symbol: "LIGHT", decimals: 18 },
};

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

async function watchTokenInWallet(token: WalletWatchToken) {
  if (!window.ethereum || !token.address) {
    return false;
  }

  try {
    const result = await window.ethereum.request({
      method: "wallet_watchAsset",
      params: [
        {
          type: "ERC20",
          options: {
            address: token.address,
            symbol: token.symbol,
            decimals: token.decimals,
          },
        },
      ],
    });

    return result === true;
  } catch {
    return false;
  }
}

export async function addProjectTokenToWallet(symbol: "ICO" | "LIGHT") {
  const token = PROJECT_TOKENS[symbol];
  if (!token?.address) {
    throw new Error(`${symbol} token is not configured`);
  }

  const added = await watchTokenInWallet(token);
  if (!added) {
    // User rejected or wallet doesn't support wallet_watchAsset
    // Still return token as info, but indicate user needs to add manually if desired
    return token;
  }

  return token;
}

export async function setupWalletAfterConnect(): Promise<WalletSetupResult> {
  await ensureBscTestnetNetwork();

  const validTokens = WATCHABLE_TOKENS.filter((token) => token.address);
  if (validTokens.length === 0) {
    return { addedTokenCount: 0, attemptedTokenCount: 0 };
  }

  const watchResults = await Promise.all(validTokens.map((token) => watchTokenInWallet(token)));
  const addedTokenCount = watchResults.filter(Boolean).length;

  return {
    addedTokenCount,
    attemptedTokenCount: validTokens.length,
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

  window.ethereum.on?.("accountsChanged", onAccountsChanged);
  window.ethereum.on?.("chainChanged", onChainChanged);

  return () => {
    window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
    window.ethereum?.removeListener?.("chainChanged", onChainChanged);
  };
}

export async function ensureBscTestnetNetwork() {
  if (!window.ethereum) {
    throw new Error("未检测到钱包插件");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BSC_TESTNET_HEX_CHAIN_ID }],
    });
  } catch (error) {
    const err = error as { code?: number };
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BSC_TESTNET_HEX_CHAIN_ID,
            chainName: "BSC Testnet",
            rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545"],
            nativeCurrency: {
              name: "tBNB",
              symbol: "tBNB",
              decimals: 18,
            },
            blockExplorerUrls: ["https://testnet.bscscan.com"],
          },
        ],
      });
    } else {
      throw error;
    }
  }
}

export function isOnBscTestnet(chainId: number) {
  return chainId === BSC_TESTNET_CHAIN_ID;
}
