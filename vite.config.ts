import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json', // Cambiado a .json para máxima compatibilidad
        devOptions: {
          enabled: true
        },
        includeAssets: ['logo.png'],
        manifest: {
          name: 'CarbCalc - Diabetes Family',
          short_name: 'CarbCalc',
          description: 'Calculadora de carbohidratos para familias con diabetes',
          theme_color: '#f97316',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            // The only icon file is 512x512; declaring it as 192x192 too made browsers warn
            { src: 'logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          // Link-preview picture for social networks: phones never need it offline
          globIgnores: ['og-image.png'],
          // Never answer API calls or Firebase's sign-in helper pages with the cached app shell
          navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
          cleanupOutdatedCaches: true,
          // Push notification handlers (public/push-sw.js)
          importScripts: ['/push-sw.js'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        }
      })
    ],
    build: {
      rollupOptions: {
        output: {
          // Libraries change far less often than the app: separate files stay cached across updates
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('react') || id.includes('motion') || id.includes('scheduler')) return 'ui';
            return undefined;
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
