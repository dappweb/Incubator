import { defineChain, fallback, http } from 'viem';
import { createConfig, injected } from 'wagmi';
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

export const wagmiConfig = createConfig({
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  chains: [cncMainnet],
  transports: {
    [cncMainnet.id]: cncMainnetTransport,
  },
  ssr: false,
});