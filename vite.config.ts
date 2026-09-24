import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { createHash } from 'crypto';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Commit SHA for the in-app diagnostics screen (src/pages/settings/DiagnosticsPage.tsx).
// CI runners are always a clean checkout of a real commit, so GITHUB_SHA is
// authoritative there. Locally, fall back to the actual checked-out commit
// via git rather than hardcoding 'local' — a diagnostics screen that can't
// tell you which commit is running defeats its own purpose.
const buildSha = process.env.GITHUB_SHA
  ?? (() => { try { return execSync('git rev-parse HEAD').toString().trim(); } catch { return 'unknown'; } })();
const buildTime = new Date().toISOString();

// Gate 1 (4.1.0 build provenance) — everything below feeds dist/build-info.json,
// a runtime-fetchable sidecar written post-bundle (see writeBuildInfo() below),
// not baked into the JS bundle itself. It CAN'T be baked in: the bundle hash
// it carries is only knowable after Rollup has finished emitting files, so a
// value embedded via `define` (evaluated at config-time, before the bundle
// exists) would necessarily describe a different, earlier bundle than the one
// shipping it — a real chicken-and-egg constraint in any build-provenance
// scheme, not an oversight.

// Release channel, parsed from the actual version string rather than a
// separately-maintained flag — "4.1.0-alpha.1" implies "alpha" by
// construction, so there's nothing to keep in sync by hand.
const releaseChannel = (() => {
  const match = /-([a-z]+)\.\d+$/.exec(pkg.version);
  return match ? match[1] : 'stable';
})();

// Whether the working tree had uncommitted changes at build time — a release
// build with dirtyWorktree: true is a real signal something wasn't committed
// before shipping, worth surfacing rather than silently building anyway.
const dirtyWorktree = (() => {
  try { return execSync('git status --porcelain').toString().trim().length > 0; }
  catch { return null; } // git unavailable — honestly unknown, not "false"
})();

// Local migration head at build time — NOT a claim about what's actually
// applied to any live Supabase project. RISK-029 (docs/enterprise/RISK_REGISTER.md)
// already found local migration filenames don't reliably match Supabase's own
// applied-migration ledger, so this field is deliberately named and documented
// as "local, build-time" rather than "verified deployed" — overclaiming here
// would repeat exactly the mistake that risk was filed to prevent.
const localMigrationHead = (() => {
  try {
    const files = readdirSync('./supabase/migrations').filter(f => f.endsWith('.sql')).sort();
    return files.length ? files[files.length - 1] : null;
  } catch { return null; }
})();

// Edge Function source manifest — a content hash over the local
// supabase/functions/ tree's function names, NOT a live deployment-revision
// check. Proving actual deployed Edge Function state would require an
// authenticated call to Supabase's management API from inside a public
// client build, which this project deliberately never does (no
// project-scoped or service-role credential belongs in a shipped app bundle).
// This is a real, structural limitation of what a frontend build process can
// prove about a separately-deployed backend — named honestly, not worked
// around by embedding something it shouldn't.
const edgeFunctionManifest = (() => {
  try {
    const dirs = readdirSync('./supabase/functions', { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '_shared')
      .map(d => d.name)
      .sort();
    const hash = createHash('sha256').update(dirs.join(',')).digest('hex').slice(0, 12);
    return { functionCount: dirs.length, sourceHash: hash };
  } catch { return { functionCount: null, sourceHash: null }; }
})();

const ciRunId = process.env.GITHUB_RUN_ID ?? null;

// Writes dist/build-info.json after Rollup has emitted every asset, so the
// bundleHash field describes the actual shipped bundle (see the chicken-and-egg
// note above) rather than an earlier, incomplete view of it. Fetched at
// runtime by DiagnosticsPage.tsx — not embedded in the JS bundle.
function writeBuildInfo(): Plugin {
  return {
    name: 'write-build-info',
    apply: 'build',
    writeBundle(_options, bundle) {
      // Vite already content-hashes every output filename (e.g.
      // index.D7a5ofbC.js) — hashing the sorted list of those filenames
      // together is a legitimate, deterministic whole-bundle fingerprint,
      // and avoids re-reading every emitted file's bytes a second time.
      const fileNames = Object.keys(bundle).sort();
      const bundleHash = createHash('sha256').update(fileNames.join(',')).digest('hex').slice(0, 16);

      const buildInfo = {
        version: pkg.version,
        androidVersionCode: 53,
        releaseChannel,
        gitCommitSha: buildSha,
        buildTime,
        buildEnvironment: process.env.CI ? 'ci' : 'local',
        ciRunId,
        dirtyWorktree,
        bundleHash,
        bundleFileCount: fileNames.length,
        localMigrationHead,
        edgeFunctionManifest,
      };

      writeFileSync(
        path.resolve(__dirname, 'dist/build-info.json'),
        JSON.stringify(buildInfo, null, 2),
      );
    },
  };
}

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
    writeBuildInfo(),
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
  // Source the app version straight from package.json so it can never drift
  // out of sync with a manually-maintained VITE_APP_VERSION in .env — this
  // value feeds Sentry's release tag and PostHog's app_version property,
  // both used to correlate crashes/events with the actual shipped build.
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
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
