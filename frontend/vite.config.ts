import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    // The API is proxied in development so the browser sees one origin and the
    // httpOnly refresh cookie is sent without any cross-site cookie juggling.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  /*
   * Pre-bundle every runtime dependency up front.
   *
   * The routes are lazy, so Vite would otherwise meet some of these for the
   * first time when a screen is opened, re-run the optimiser and hand that
   * chunk a fresh `?v=` hash. Anything already on the page keeps the old hash,
   * and the app ends up holding two copies of React - at which point context
   * stops crossing between them and screens die with "useI18n must be used
   * inside <I18nProvider>" even though the provider is right there in the tree.
   *
   * Listing them makes the optimiser run once, at boot, with one hash.
   */
  optimizeDeps: {
    include: [
      '@hookform/resolvers/zod',
      '@radix-ui/react-accordion',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
      '@tanstack/react-query',
      'axios',
      'class-variance-authority',
      'clsx',
      'lucide-react',
      'react',
      'react-dom',
      'react-dom/client',
      'react-hook-form',
      'react-router-dom',
      'sonner',
      'tailwind-merge',
      'zod',
    ],
  },

  build: { outDir: 'dist', sourcemap: true },
});
