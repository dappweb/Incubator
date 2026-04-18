import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) {
            return 'react-vendor'
          }

          if (id.includes('/node_modules/ethers/')) {
            return 'ethers-vendor'
          }

          if (id.includes('/node_modules/@tanstack/')) {
            return 'query-vendor'
          }

          if (id.includes('/node_modules/@rainbow-me/')) {
            return 'rainbowkit-vendor'
          }

          if (id.includes('/node_modules/wagmi/')) {
            return 'wagmi-vendor'
          }

          if (id.includes('/node_modules/viem/')) {
            return 'viem-vendor'
          }

          if (id.includes('/node_modules/@walletconnect/')) {
            return 'walletconnect-vendor'
          }

          if (id.includes('/node_modules/@reown/')) {
            return 'reown-vendor'
          }

          const match = id.match(/node_modules\/(?:\.pnpm\/)?(?:@[^/]+\/)?([^/@]+)/)
          return match ? `vendor-${match[1]}` : 'vendor-misc'
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['t3.test2dapp.xyz'],
  },
})
