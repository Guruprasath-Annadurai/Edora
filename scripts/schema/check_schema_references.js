#!/usr/bin/env node
/**
 * Edora Schema Reference Static CI Guard
 * Detects client/backend calls to non-existent database tables, functions,
 * and flagged missing column patterns (such as the F17 score_pct defect).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const manifestArgIdx = process.argv.indexOf('--manifest');
const MANIFEST_PATH = manifestArgIdx !== -1 && process.argv[manifestArgIdx + 1]
  ? path.resolve(process.cwd(), process.argv[manifestArgIdx + 1])
  : path.join(__dirname, 'schema-manifest.json');
const EXCEPTIONS_PATH = path.join(__dirname, 'schema-exceptions.json');

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`Error: Schema manifest not found at ${MANIFEST_PATH}. Run generate_schema_manifest.js first.`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
const exceptions = fs.existsSync(EXCEPTIONS_PATH)
  ? JSON.parse(fs.readFileSync(EXCEPTIONS_PATH, 'utf-8'))
  : { allowedTables: [], allowedRpcFunctions: [], legacyUnmigratedTables: [], allowedVirtualColumns: {} };

const legacyTableMap = new Map();
if (Array.isArray(exceptions.legacyUnmigratedTables)) {
  for (const item of exceptions.legacyUnmigratedTables) {
    legacyTableMap.set(item.table.toLowerCase(), item.reason);
  }
}

const knownTables = new Set([
  ...Object.keys(manifest.tables),
  ...(exceptions.allowedTables || []),
]);

const knownFunctions = new Set([
  ...(manifest.functions || []),
  ...(exceptions.allowedRpcFunctions || []),
]);

let violations = 0;
let warnings = 0;

function reportError(filePath, lineNo, message) {
  console.error(`::error file=${filePath},line=${lineNo}::[Schema Drift] ${message}`);
  violations++;
}

function reportWarning(filePath, lineNo, message) {
  console.warn(`::warning file=${filePath},line=${lineNo}::[Schema Warning] ${message}`);
  warnings++;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // 1. Detect .from('table_name') or .from<Type>('table_name')
    const fromRegex = /\.from(?:\s*<[^>]+>)?\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;
    let fromMatch;
    while ((fromMatch = fromRegex.exec(line)) !== null) {
      const table = fromMatch[1].toLowerCase();
      if (legacyTableMap.has(table)) {
        reportWarning(
          filePath,
          lineNo,
          `Reference to documented legacy/unmigrated table: '${table}'. Reason: ${legacyTableMap.get(table)}`
        );
      } else if (!knownTables.has(table)) {
        reportError(filePath, lineNo, `Reference to non-existent database table: '${table}'`);
      }
    }

    // 2. Detect .rpc('func_name')
    const rpcRegex = /\.rpc(?:\s*<[^>]+>)?\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*[,)]/g;
    let rpcMatch;
    while ((rpcMatch = rpcRegex.exec(line)) !== null) {
      const func = rpcMatch[1].toLowerCase();
      if (!knownFunctions.has(func)) {
        reportWarning(filePath, lineNo, `Reference to unverified stored function: '${func}'`);
      }
    }

    // 3. Dynamic Column Reference Validation based on Schema Manifest
    // If code references quiz_sessions and score_pct, verify column existence in manifest:
    if (/quiz_sessions/i.test(line) && /score_pct/i.test(line)) {
      const quizColumns = manifest.tables['quiz_sessions'] || [];
      if (!quizColumns.includes('score_pct')) {
        reportError(
          filePath,
          lineNo,
          `Detected 'score_pct' column reference on 'quiz_sessions', but 'score_pct' does not exist in schema manifest for 'quiz_sessions' (known columns: ${quizColumns.join(', ')}).`
        );
      }
    }
  }
}

function walkDir(dir, filterExts) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        walkDir(fullPath, filterExts);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (filterExts.includes(ext) && !entry.name.endsWith('.d.ts')) {
        scanFile(fullPath);
      }
    }
  }
}

console.log('==========================================================');
console.log('EDORA DATABASE SCHEMA REFERENCE GUARD');
console.log(`Checking codebase against ${knownTables.size} tables and ${knownFunctions.size} RPC functions...`);
console.log('==========================================================');

const targetDirs = [
  path.join(ROOT_DIR, 'src'),
  path.join(ROOT_DIR, 'supabase/functions'),
];

for (const dir of targetDirs) {
  if (fs.existsSync(dir)) {
    walkDir(dir, ['.ts', '.tsx', '.js', '.jsx']);
  }
}

console.log('==========================================================');
if (violations > 0) {
  console.error(`❌ FAILED: ${violations} schema reference violation(s) detected.`);
  process.exit(1);
} else {
  console.log(`✓ PASSED: All table and critical schema references are valid (${warnings} non-blocking warnings).`);
  console.log('==========================================================');
  process.exit(0);
}
