import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Sentry release upload only runs when these are configured (CI secrets).
// Local/dev builds and contributors without Sentry access build normally —
// sourcemaps are still generated but simply never uploaded.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg       = process.env.SENTRY_ORG;
const sentryProject   = process.env.SENTRY_PROJECT;
const sentryConfigured = !!(sentryAuthToken && sentryOrg && sentryProject);

// public/ files are copied verbatim (Vite define doesn't touch them),
// so stamp the version into dist/sw.js after the bundle is written.
function stampServiceWorker(): Plugin {
  return {
    name: 'stamp-sw',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js');
      if (!existsSync(swPath)) return;
      const sw = readFileSync(swPath, 'utf-8').replace(/%CACHE_VERSION%/g, `v${pkg.version}`);
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    stampServiceWorker(),
    // Uploads sourcemaps to Sentry for readable stack traces, then deletes
    // them from the dist/ output so they're never served publicly.
    ...(mode === 'production' && sentryConfigured ? [
      sentryVitePlugin({
        org: sentryOrg,
        project: sentryProject,
        authToken: sentryAuthToken,
        release: { name: pkg.version },
        sourcemaps: {
          filesToDeleteAfterUpload: ['./dist/**/*.js.map'],
        },
      }),
    ] : []),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    assetsInlineLimit: 0,
    // 'hidden' emits .map files for Sentry to consume but never references
    // them via //# sourceMappingURL comments — browsers/users can't fetch them.
    // Only emit sourcemaps when Sentry will actually consume + delete them.
    // Without that pipeline, leaving .map files in dist/ would leak readable
    // source to anyone who requests them from the deployed site.
    sourcemap: mode === 'production' && sentryConfigured ? 'hidden' : false,
    minify: 'esbuild',
    // Drop console.* and debugger statements in production — prevents leaking state
    esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks(id) {
          // Core vendor bundles
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/') || id.includes('node_modules/react-router/')) return 'vendor-react';
          if (id.includes('node_modules/@supabase/')) return 'vendor-supabase';
          if (id.includes('node_modules/framer-motion/')) return 'vendor-motion';
          if (id.includes('node_modules/lucide-react/')) return 'vendor-icons';
          if (id.includes('node_modules/@capacitor/')) return 'vendor-capacitor';
          // PDF libs are heavy — isolate them
          if (id.includes('node_modules/pdfjs-dist/') || id.includes('node_modules/pdf-')) return 'vendor-pdf';
          // Analytics/monitoring
          if (id.includes('node_modules/posthog') || id.includes('node_modules/mixpanel')) return 'vendor-analytics';
        },
      },
    },
    target: ['es2020', 'safari14', 'chrome80'],
    chunkSizeWarningLimit: 1000,
  },
  server: { port: 8100, host: true },
  base: process.env.BUILD_TARGET === 'mobile' ? './' : '/',
}));
