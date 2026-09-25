#!/usr/bin/env node
/**
 * Edora Schema Reference Static CI Guard
 * Detects client/backend calls to non-existent database tables, functions,
 * and unmigrated column fields across multiline mutation chains (.insert, .update, .upsert).
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
const pathArgIdx = process.argv.indexOf('--path');
const TARGET_PATH = pathArgIdx !== -1 && process.argv[pathArgIdx + 1]
  ? path.resolve(process.cwd(), process.argv[pathArgIdx + 1])
  : null;
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

function extractBalanced(str, openChar = '(', closeChar = ')') {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let start = -1;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inString) {
      if (c === stringChar && str[i - 1] !== '\\') inString = false;
    } else if (c === "'" || c === '"' || c === '`') {
      inString = true;
      stringChar = c;
    } else if (c === openChar) {
      if (depth === 0) start = i;
      depth++;
    } else if (c === closeChar) {
      depth--;
      if (depth === 0) return str.substring(start + 1, i);
    }
  }
  return null;
}


function extractObjectBodies(payload) {
  const bodies = [];
  const trimmed = payload.trim();
  if (trimmed.startsWith('[')) {
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenDepth = 0;
    let inString = false;
    let stringChar = '';
    let objStart = -1;

    for (let i = 0; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (inString) {
        if (c === '\\') { i++; continue; }
        if (c === stringChar) inString = false;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        inString = true;
        stringChar = c;
        continue;
      }
      if (c === '[') { bracketDepth++; continue; }
      if (c === ']') { bracketDepth--; continue; }
      if (c === '(') { parenDepth++; continue; }
      if (c === ')') { parenDepth--; continue; }

      if (bracketDepth === 1 && parenDepth === 0) {
        if (c === '{') {
          if (braceDepth === 0) objStart = i;
          braceDepth++;
        } else if (c === '}') {
          braceDepth--;
          if (braceDepth === 0 && objStart !== -1) {
            bodies.push(trimmed.substring(objStart + 1, i));
            objStart = -1;
          }
        }
      } else if (bracketDepth > 1) {
        if (c === '{') braceDepth++;
        else if (c === '}') braceDepth--;
      }
    }
  } else if (trimmed.startsWith('{')) {
    const single = extractBalanced(trimmed, '{', '}');
    if (single !== null) bodies.push(single);
  }
  return bodies;
}

function extractTopLevelKeys(objBody) {
  const keys = [];
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let ternaryDepth = 0;
  const templateStack = [];

  let mode = 'SEEKING_KEY'; // 'SEEKING_KEY' | 'SEEKING_COLON_OR_COMMA' | 'IN_VALUE'
  let pendingKey = null;

  for (let i = 0; i < objBody.length; i++) {
    const c = objBody[i];
    const next = objBody[i + 1] || '';

    // Comment handling
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    // String handling
    if (inString) {
      if (stringChar === '`' && c === '$' && next === '{') {
        templateStack.push(braceDepth);
        inString = false;
        i++;
        braceDepth++;
        continue;
      }
      if (c === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (c === stringChar) {
        inString = false;
      }
      continue;
    }

    // Entering comments
    if (c === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    // Entering strings
    if (c === "'" || c === '"' || c === '`') {
      if (mode === 'SEEKING_KEY' && braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
        let strVal = '';
        const quote = c;
        i++;
        while (i < objBody.length) {
          if (objBody[i] === '\\') {
            strVal += objBody[i + 1] || '';
            i += 2;
            continue;
          }
          if (objBody[i] === quote) break;
          strVal += objBody[i];
          i++;
        }
        pendingKey = strVal;
        mode = 'SEEKING_COLON_OR_COMMA';
        continue;
      } else {
        inString = true;
        stringChar = c;
        continue;
      }
    }

    // Track braces/brackets/parens
    if (c === '{') {
      braceDepth++;
      continue;
    }
    if (c === '}') {
      if (templateStack.length > 0 && braceDepth === templateStack[templateStack.length - 1] + 1) {
        templateStack.pop();
        braceDepth--;
        inString = true;
        stringChar = '`';
        continue;
      }
      braceDepth--;
      continue;
    }
    if (c === '[') {
      bracketDepth++;
      continue;
    }
    if (c === ']') {
      bracketDepth--;
      continue;
    }
    if (c === '(') {
      parenDepth++;
      continue;
    }
    if (c === ')') {
      parenDepth--;
      continue;
    }

    const atDepth0 = (braceDepth === 0 && bracketDepth === 0 && parenDepth === 0);
    if (!atDepth0) continue;

    if (mode === 'SEEKING_KEY') {
      if (/\s/.test(c)) continue;

      if (c === '.' && next === '.' && objBody[i + 2] === '.') {
        // Spread operator ...foo
        i += 2;
        mode = 'IN_VALUE';
        continue;
      }

      if (/[a-zA-Z0-9_]/.test(c)) {
        let ident = '';
        while (i < objBody.length && /[a-zA-Z0-9_]/.test(objBody[i])) {
          ident += objBody[i];
          i++;
        }
        i--;
        pendingKey = ident;
        mode = 'SEEKING_COLON_OR_COMMA';
        continue;
      }
    } else if (mode === 'SEEKING_COLON_OR_COMMA') {
      if (/\s/.test(c)) continue;

      if (c === ':') {
        if (pendingKey) keys.push(pendingKey.toLowerCase());
        pendingKey = null;
        ternaryDepth = 0;
        mode = 'IN_VALUE';
        continue;
      }

      if (c === ',') {
        const reserved = ['true', 'false', 'null', 'undefined', 'return', 'await', 'async'];
        if (pendingKey && !reserved.includes(pendingKey.toLowerCase())) {
          keys.push(pendingKey.toLowerCase());
        }
        pendingKey = null;
        mode = 'SEEKING_KEY';
        continue;
      }

      pendingKey = null;
      mode = 'IN_VALUE';
    } else if (mode === 'IN_VALUE') {
      if (c === '?') {
        ternaryDepth++;
      } else if (c === ':') {
        if (ternaryDepth > 0) ternaryDepth--;
      } else if (c === ',') {
        if (ternaryDepth === 0) {
          mode = 'SEEKING_KEY';
        }
      }
    }
  }

  // Trailing shorthand property
  if (mode === 'SEEKING_COLON_OR_COMMA' && pendingKey) {
    const reserved = ['true', 'false', 'null', 'undefined', 'return', 'await', 'async'];
    if (!reserved.includes(pendingKey.toLowerCase())) {
      keys.push(pendingKey.toLowerCase());
    }
  }

  return keys;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 1. Line-by-line scanning for tables and RPC calls
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // Detect .from('table_name')
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

    // Detect .rpc('func_name')
    const rpcRegex = /\.rpc(?:\s*<[^>]+>)?\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*[,)]/g;
    let rpcMatch;
    while ((rpcMatch = rpcRegex.exec(line)) !== null) {
      const func = rpcMatch[1].toLowerCase();
      if (!knownFunctions.has(func)) {
        reportWarning(filePath, lineNo, `Reference to unverified stored function: '${func}'`);
      }
    }
  }

  // 2. Multiline Chained Mutation Parsing (.from('table').insert/update/upsert({...}))
  const fromChainRegex = /\.from(?:\s*<[^>]+>)?\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;
  let chainMatch;
  while ((chainMatch = fromChainRegex.exec(content)) !== null) {
    const table = chainMatch[1].toLowerCase();
    const tableCols = manifest.tables[table];
    if (!tableCols) continue; // If unknown or legacy, already flagged or permitted

    const afterFrom = content.substring(chainMatch.index + chainMatch[0].length);
    const windowText = afterFrom.substring(0, 2500);
    const opMatch = windowText.match(/\.(insert|update|upsert)\s*\(/);
    if (!opMatch) continue;

    // Ensure no other .from() intervenes before this operation
    const nextFromIdx = windowText.indexOf('.from(');
    if (nextFromIdx !== -1 && nextFromIdx < opMatch.index) continue;

    const op = opMatch[1];
    const afterOp = windowText.substring(opMatch.index + opMatch[0].length - 1);
    const argsContent = extractBalanced(afterOp, '(', ')');
    if (!argsContent) continue;

    const objectBodies = extractObjectBodies(argsContent);
    for (const objBody of objectBodies) {
      const checkedKeys = extractTopLevelKeys(objBody);
      for (const key of checkedKeys) {
        if (!tableCols.includes(key)) {
          const allowedForTable = exceptions.allowedVirtualColumns?.[table] || [];
          const allowedGlobal = exceptions.allowedVirtualColumns?.['*'] || [];
          if (allowedForTable.includes(key) || allowedGlobal.includes(key)) continue;

          const keyPos = content.indexOf(key, chainMatch.index);
          const lineNo = keyPos !== -1
            ? content.substring(0, keyPos).split('\n').length
            : content.substring(0, chainMatch.index).split('\n').length;

          reportError(
            filePath,
            lineNo,
            `Invalid column reference: '${key}' in .${op}() on table '${table}'. '${key}' does not exist in schema manifest (known columns: ${tableCols.slice(0, 8).join(', ')}...).`
          );
        }
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

if (TARGET_PATH) {
  if (fs.existsSync(TARGET_PATH)) {
    const stat = fs.statSync(TARGET_PATH);
    if (stat.isDirectory()) {
      walkDir(TARGET_PATH, ['.ts', '.tsx', '.js', '.jsx']);
    } else if (stat.isFile()) {
      scanFile(TARGET_PATH);
    }
  } else {
    console.error(`Error: Target path not found: ${TARGET_PATH}`);
    process.exit(1);
  }
} else {
  const targetDirs = [
    path.join(ROOT_DIR, 'src'),
    path.join(ROOT_DIR, 'supabase/functions'),
  ];

  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      walkDir(dir, ['.ts', '.tsx', '.js', '.jsx']);
    }
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
