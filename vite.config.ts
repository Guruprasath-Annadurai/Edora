import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    assetsInlineLimit: 0,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['framer-motion', 'lucide-react'],
          'vendor-capacitor': ['@capacitor/core', '@capacitor/app', '@capacitor/preferences'],
        },
      },
    },
    target: ['es2020', 'safari13', 'chrome80'],
    chunkSizeWarningLimit: 1000,
  },
  server: { port: 8100, host: true },
  base: process.env.BUILD_TARGET === 'mobile' ? './' : '/',
}));
