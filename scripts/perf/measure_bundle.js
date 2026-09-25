#!/usr/bin/env node
/**
 * Edora Performance Measurement Tool: Bundle Composition & Gzip Sizer
 * Analyzes dist/ assets to report initial JS, chunk sizes, and asset weight.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function analyzeBundle() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`Error: 'dist' directory not found at ${DIST_DIR}.`);
    console.error(`Run 'npm run build' before analyzing bundle performance.`);
    process.exit(1);
  }

  const assetsDir = path.join(DIST_DIR, 'assets');
  const targetDir = fs.existsSync(assetsDir) ? assetsDir : DIST_DIR;

  const files = fs.readdirSync(targetDir);
  const chunks = [];

  let totalRawBytes = 0;
  let totalGzipBytes = 0;
  let initialJsRawBytes = 0;
  let initialJsGzipBytes = 0;
  let lazyJsRawBytes = 0;
  let lazyJsGzipBytes = 0;

  for (const file of files) {
    const filePath = path.join(targetDir, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    const rawBuffer = fs.readFileSync(filePath);
    const rawSize = stat.size;
    const gzipSize = zlib.gzipSync(rawBuffer).length;

    totalRawBytes += rawSize;
    totalGzipBytes += gzipSize;

    const ext = path.extname(file).toLowerCase();
    const isInitial = file.startsWith('index-') || file.startsWith('vendor-') || file === 'index.html';

    if (ext === '.js') {
      if (isInitial) {
        initialJsRawBytes += rawSize;
        initialJsGzipBytes += gzipSize;
      } else {
        lazyJsRawBytes += rawSize;
        lazyJsGzipBytes += gzipSize;
      }
    }

    chunks.push({
      fileName: file,
      ext,
      rawSize,
      gzipSize,
      isInitial,
    });
  }

  chunks.sort((a, b) => b.gzipSize - a.gzipSize);

  console.log('========================================================================');
  console.log('EDORA V5 FRONTEND BUNDLE PERFORMANCE AUDIT');
  console.log('========================================================================');
  console.log(`Directory: ${targetDir}`);
  console.log(`Initial Startup JS (Estimated):  ${formatBytes(initialJsRawBytes)} raw | ${formatBytes(initialJsGzipBytes)} gzip`);
  console.log(`Total Lazy-Loaded JS Chunks:     ${formatBytes(lazyJsRawBytes)} raw | ${formatBytes(lazyJsGzipBytes)} gzip`);
  console.log(`Total Client Distribution Size:  ${formatBytes(totalRawBytes)} raw | ${formatBytes(totalGzipBytes)} gzip`);
  console.log('------------------------------------------------------------------------');
  console.log('TOP 10 LARGEST ASSETS (BY GZIP SIZE):');
  console.log('------------------------------------------------------------------------');
  console.log(
    'File Name'.padEnd(45) +
    'Type'.padEnd(10) +
    'Raw Size'.padEnd(14) +
    'Gzip Size'
  );

  const top10 = chunks.slice(0, 10);
  for (const c of top10) {
    console.log(
      c.fileName.padEnd(45) +
      c.ext.padEnd(10) +
      formatBytes(c.rawSize).padEnd(14) +
      formatBytes(c.gzipSize)
    );
  }

  console.log('------------------------------------------------------------------------');
  const oversized = chunks.filter(c => c.gzipSize > 100 * 1024);
  if (oversized.length > 0) {
    console.log(`⚠️  ${oversized.length} asset(s) exceed 100 KB gzipped:`);
    oversized.forEach(o => console.log(`   • ${o.fileName} (${formatBytes(o.gzipSize)} gzipped)`));
  } else {
    console.log('✓ All chunks within recommended 100 KB gzipped threshold.');
  }
  console.log('========================================================================');
}

analyzeBundle();
