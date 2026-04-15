import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  tokenPocketWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { defineChain, fallback, http } from 'viem';
import { createConfig } from 'wagmi';
import {
  CNC_MAINNET_BLOCK_EXPLORER_URL,
  CNC_MAINNET_CHAIN_ID,
  CNC_MAINNET_CHAIN_NAME,
  CNC_MAINNET_NATIVE_CURRENCY,
  CNC_MAINNET_RPC_URLS,
} from './config';

const cncMainnet = defineChain({
  id: CNC_MAINNET_CHAIN_ID,
  name: CNC_MAINNET_CHAIN_NAME,
  nativeCurrency: CNC_MAINNET_NATIVE_CURRENCY,
  rpcUrls: {
    default: { http: CNC_MAINNET_RPC_URLS },
    public: { http: CNC_MAINNET_RPC_URLS },
  },
  blockExplorers: {
    default: {
      name: 'CNC Explorer',
      url: CNC_MAINNET_BLOCK_EXPLORER_URL,
    },
  },
});

const cncMainnetTransport = fallback(
  CNC_MAINNET_RPC_URLS.map((url) =>
    http(url, {
      batch: false,
      retryCount: 2,
      retryDelay: 300,
      timeout: 8_000,
    }),
  ),
  {
    retryCount: 1,
    retryDelay: 200,
  },
);

const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || '730caccf77e6027ab577fedf9add2c25';

const connectors = connectorsForWallets(
  [
    {
      groupName: '推荐钱包',
      wallets: [
        tokenPocketWallet,
        okxWallet,
        metaMaskWallet,
        injectedWallet,     // 自动检测系统已安装的钱包
        walletConnectWallet, // 扫码连接
      ],
    },
  ],
  { appName: 'Incubator', projectId },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [cncMainnet],
  transports: {
    [cncMainnet.id]: cncMainnetTransport,
  },
  ssr: false,
});