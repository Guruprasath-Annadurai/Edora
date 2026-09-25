#!/usr/bin/env node
/**
 * Unit Test for check_schema_references.js
 * Verifies that the guard passes on baseline code and accurately catches
 * phantom tables and the F17 score_pct defect pattern.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const CHECK_SCRIPT = path.join(__dirname, 'check_schema_references.js');

console.log('Running unit tests for check_schema_references.js...');

// Test 1: Real codebase baseline should pass
console.log('Test 1: Running schema reference guard on clean codebase...');
try {
  execSync(`node "${CHECK_SCRIPT}"`, { stdio: 'pipe' });
  console.log('✓ Test 1 Passed: Clean codebase passed schema reference check.');
} catch (err) {
  console.error('❌ Test 1 Failed:', err.stderr.toString());
  process.exit(1);
}

// Test 2: Injected phantom table should fail
console.log('Test 2: Verifying detection of phantom table reference...');
const phantomFile = path.join(ROOT_DIR, 'src/phantom_table_fixture.ts');
try {
  fs.writeFileSync(phantomFile, `import { supabase } from './lib/supabase';\nexport const getBogus = () => supabase.from('nonexistent_phantom_table').select('*');\n`);
  let failed = false;
  try {
    execSync(`node "${CHECK_SCRIPT}"`, { stdio: 'pipe' });
  } catch (err) {
    failed = true;
    const output = err.stderr.toString() + err.stdout.toString();
    if (output.includes("Reference to non-existent database table: 'nonexistent_phantom_table'")) {
      console.log('✓ Test 2 Passed: Successfully detected and blocked phantom table.');
    } else {
      console.error('❌ Test 2 Failed: Did not find expected error message:', output);
      process.exit(1);
    }
  }
  if (!failed) {
    console.error('❌ Test 2 Failed: Script exited with 0 on phantom table!');
    process.exit(1);
  }
} finally {
  if (fs.existsSync(phantomFile)) fs.unlinkSync(phantomFile);
}

// Test 3: Injected F17 score_pct defect pattern should fail
console.log('Test 3: Verifying detection of F17 score_pct column defect pattern...');
const f17File = path.join(ROOT_DIR, 'src/f17_defect_fixture.ts');
try {
  fs.writeFileSync(f17File, `// Attempting to record quiz attempt with score_pct\nsupabase.from('quiz_sessions').insert({ score_pct: 95 });\n`);
  let failed = false;
  try {
    execSync(`node "${CHECK_SCRIPT}"`, { stdio: 'pipe' });
  } catch (err) {
    failed = true;
    const output = err.stderr.toString() + err.stdout.toString();
    if (output.includes("Detected 'score_pct' column reference on 'quiz_sessions'")) {
      console.log('✓ Test 3 Passed: Successfully caught F17 score_pct schema drift.');
    } else {
      console.error('❌ Test 3 Failed: Did not find expected error message:', output);
      process.exit(1);
    }
  }
  if (!failed) {
    console.error('❌ Test 3 Failed: Script exited with 0 on F17 defect!');
    process.exit(1);
  }
} finally {
  if (fs.existsSync(f17File)) fs.unlinkSync(f17File);
}

console.log('==========================================================');
console.log('All check_schema_references unit tests PASSED.');
console.log('==========================================================');
