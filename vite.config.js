import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 8765,
    host: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          charts: ['chart.js'],
          ui: ['cropperjs', 'flatpickr']
        }
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Granja Rancho do Viana',
        short_name: 'Granja Viana',
        id: './',
        description: 'Gestão financeira, estoque, produção e plantel da Granja Rancho do Viana.',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait-primary',
        background_color: '#e2e8f0',
        theme_color: '#172033',
        categories: ['business', 'productivity', 'finance'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true
      }
    })
  ]
});

