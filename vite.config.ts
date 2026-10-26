import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Relative by default; the Pages workflow supplies the repository's absolute path.
const base = process.env.BASE_PATH || './'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // The Workbox glob covers every emitted icon; avoid duplicate manifest entries.
      includeManifestIcons: false,
      manifest: {
        id: './',
        name: 'My Language Journal',
        short_name: 'My Journal',
        description: 'A personal journal for English, Bahasa Melayu, and 中文.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f8f7f2',
        theme_color: '#f8f7f2',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: 'my-language-journal',
        globPatterns: ['**/*.{html,js,css,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Activation is explicitly requested by the user after saving edits.
        skipWaiting: false,
        clientsClaim: true,
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
})
