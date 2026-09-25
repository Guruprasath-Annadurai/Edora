#!/usr/bin/env node
/**
 * Edora Schema Manifest Generator
 * Extracts tables, columns, and RPC functions from supabase/migrations/*.sql
 * Generates scripts/schema/schema-manifest.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'supabase/migrations');
const MANIFEST_FILE = path.join(__dirname, 'schema-manifest.json');

function parseSqlMigrations() {
  const schema = {
    tables: {},
    functions: new Set(),
    generatedAt: new Date().toISOString(),
  };

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // 1. Match CREATE TABLE statements
    const createTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.)?["']?([a-zA-Z0-9_]+)["']?\s*\(([\s\S]*?)\);/gi;
    let match;
    while ((match = createTableRegex.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      const body = match[2];

      if (!schema.tables[tableName]) {
        schema.tables[tableName] = new Set();
      }

      // Extract column definitions (lines not starting with CONSTRAINT, PRIMARY, FOREIGN, UNIQUE, CHECK)
      const lines = body.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim().replace(/--.*$/, '').trim();
        if (!line) continue;
        if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(line)) continue;

        const colMatch = line.match(/^["']?([a-zA-Z0-9_]+)["']?\s+([a-zA-Z0-9_()]+)/);
        if (colMatch) {
          const colName = colMatch[1].toLowerCase();
          schema.tables[tableName].add(colName);
        }
      }
    }

    // 1b. Match CREATE VIEW / MATERIALIZED VIEW statements
    const createViewRegex = /CREATE(?:\s+OR\s+REPLACE)?(?:\s+MATERIALIZED)?\s+VIEW\s+(?:public\.)?["']?([a-zA-Z0-9_]+)["']?/gi;
    let viewMatch;
    while ((viewMatch = createViewRegex.exec(content)) !== null) {
      const viewName = viewMatch[1].toLowerCase();
      if (!schema.tables[viewName]) {
        schema.tables[viewName] = new Set();
      }
    }

    // 2. Match ALTER TABLE statements and all ADD COLUMN clauses
    const alterTableRegex = /ALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:ONLY\s+)?(?:public\.)?["']?([a-zA-Z0-9_]+)["']?\s+([\s\S]*?);/gi;
    const SQL_NON_COLUMN_WORDS = new Set(['constraint', 'primary', 'foreign', 'unique', 'check', 'index']);
    while ((match = alterTableRegex.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      const body = match[2];
      const colRegex = /ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?["']?([a-zA-Z0-9_]+)["']?/gi;
      let cm;
      while ((cm = colRegex.exec(body)) !== null) {
        const colName = cm[1].toLowerCase();
        if (SQL_NON_COLUMN_WORDS.has(colName)) continue;
        if (!schema.tables[tableName]) {
          schema.tables[tableName] = new Set();
        }
        schema.tables[tableName].add(colName);
      }
    }

    // 3. Match CREATE FUNCTION / RPC statements
    const createFuncRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?["']?([a-zA-Z0-9_]+)["']?\s*\(/gi;
    while ((match = createFuncRegex.exec(content)) !== null) {
      const funcName = match[1].toLowerCase();
      schema.functions.add(funcName);
    }
  }

  // Convert Sets to sorted Arrays for serialisation
  const serialized = {
    generatedAt: schema.generatedAt,
    tables: {},
    functions: Array.from(schema.functions).sort(),
  };

  for (const [table, cols] of Object.entries(schema.tables)) {
    serialized.tables[table] = Array.from(cols).sort();
  }

  // Handle --check-stale flag
  const isCheckStale = process.argv.includes('--check-stale');
  if (isCheckStale && fs.existsSync(MANIFEST_FILE)) {
    const existing = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
    const tablesMatch = JSON.stringify(existing.tables) === JSON.stringify(serialized.tables);
    const functionsMatch = JSON.stringify(existing.functions) === JSON.stringify(serialized.functions);

    if (!tablesMatch || !functionsMatch) {
      console.error('::error::Checked-in schema-manifest.json is stale and does not match migrations.');
      console.error('Run "node scripts/schema/generate_schema_manifest.js" to regenerate the manifest.');
      process.exit(1);
    } else {
      console.log('✓ Checked-in schema-manifest.json is up-to-date with current migrations.');
      process.exit(0);
    }
  }

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(serialized, null, 2), 'utf-8');
  console.log(`✓ Schema manifest generated with ${Object.keys(serialized.tables).length} tables and ${serialized.functions.length} functions.`);
  console.log(`Saved to: ${MANIFEST_FILE}`);
}

parseSqlMigrations();
