import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_E2E_TESTING': JSON.stringify(process.env.VITE_E2E_TESTING || 'false')
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.jpg'],
      manifest: {
        id: '/',
        start_url: '/',
        name: 'Jeevanshilp Group System',
        short_name: 'Jeevanshilp Group',
        description: 'Jeevanshilp Group with offline accounting',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'logo.jpg',
            sizes: '192x192',
            type: 'image/jpeg'
          },
          {
            src: 'logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg'
          },
          {
            src: 'logo.jpg',
            sizes: '512x512',
            type: 'image/jpeg',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      }
    })
  ],
})
