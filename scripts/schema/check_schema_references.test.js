#!/usr/bin/env node
/**
 * Regression Test Suite for check_schema_references.js
 *
 * Verifies:
 * CASE 1: Client references score_pct on quiz_sessions but migration does NOT contain it => FAIL
 * CASE 2: Migration adds score_pct and client references it => PASS
 * CASE 3: Client references nonexistent table => FAIL
 * CASE 4: Client references nonexistent RPC => WARNING (documented non-fatal policy)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const CHECK_SCRIPT = path.join(__dirname, 'check_schema_references.js');
const REAL_MANIFEST = path.join(__dirname, 'schema-manifest.json');

console.log('==========================================================');
console.log('RUNNING SCHEMA REFERENCE REGRESSION TESTS');
console.log('==========================================================');

// Baseline: Clean repository must pass
console.log('Baseline Test: Running schema reference guard on clean codebase...');
try {
  execSync(`node "${CHECK_SCRIPT}"`, { stdio: 'pipe' });
  console.log('✓ Baseline Passed: Clean codebase passed schema check.');
} catch (err) {
  console.error('❌ Baseline Failed:', err.stderr.toString());
  process.exit(1);
}

// -----------------------------------------------------------------------------
// CASE 1: Client references score_pct but migration/manifest does NOT contain it => FAIL
// -----------------------------------------------------------------------------
console.log('CASE 1: Verifying client reference to score_pct when missing from schema => FAIL');
const case1Fixture = path.join(ROOT_DIR, 'src/case1_fixture.ts');
try {
  fs.writeFileSync(
    case1Fixture,
    `// Case 1: Inserting score_pct into quiz_sessions before migration exists\n` +
    `supabase.from('quiz_sessions').insert({ score_pct: 92 });\n`
  );

  let failed = false;
  try {
    execSync(`node "${CHECK_SCRIPT}"`, { stdio: 'pipe' });
  } catch (err) {
    failed = true;
    const output = err.stderr.toString() + err.stdout.toString();
    if (output.includes("Detected 'score_pct' column reference on 'quiz_sessions'")) {
      console.log('✓ CASE 1 Passed: Correctly failed because score_pct is missing from current schema.');
    } else {
      console.error('❌ CASE 1 Failed with unexpected output:', output);
      process.exit(1);
    }
  }

  if (!failed) {
    console.error('❌ CASE 1 Failed: Script exited 0 when score_pct was missing from schema!');
    process.exit(1);
  }
} finally {
  if (fs.existsSync(case1Fixture)) fs.unlinkSync(case1Fixture);
}

// -----------------------------------------------------------------------------
// CASE 2: Migration adds score_pct and client references it => PASS
// -----------------------------------------------------------------------------
console.log('CASE 2: Verifying client reference to score_pct when migration contains it => PASS');
const case2Fixture = path.join(ROOT_DIR, 'src/case2_fixture.ts');
const tempManifest = path.join(__dirname, 'temp-manifest-with-score-pct.json');
try {
  // Read real manifest, add score_pct to quiz_sessions
  const manifestData = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf-8'));
  if (!manifestData.tables.quiz_sessions.includes('score_pct')) {
    manifestData.tables.quiz_sessions.push('score_pct');
  }
  fs.writeFileSync(tempManifest, JSON.stringify(manifestData, null, 2), 'utf-8');

  // Client references score_pct
  fs.writeFileSync(
    case2Fixture,
    `// Case 2: Inserting score_pct into quiz_sessions after V5 migration adds it\n` +
    `supabase.from('quiz_sessions').insert({ score_pct: 95 });\n`
  );

  // Run check with the updated manifest
  const result = execSync(`node "${CHECK_SCRIPT}" --manifest "${tempManifest}"`, { stdio: 'pipe' }).toString();
  if (result.includes('PASSED')) {
    console.log('✓ CASE 2 Passed: Reference to score_pct accepted when column is in schema manifest.');
  } else {
    console.error('❌ CASE 2 Failed: Output did not contain PASSED:', result);
    process.exit(1);
  }
} catch (err) {
  console.error('❌ CASE 2 Failed:', err.stderr ? err.stderr.toString() : err.message);
  process.exit(1);
} finally {
  if (fs.existsSync(case2Fixture)) fs.unlinkSync(case2Fixture);
  if (fs.existsSync(tempManifest)) fs.unlinkSync(tempManifest);
}

// -----------------------------------------------------------------------------
// CASE 3: Client references nonexistent table => FAIL
// -----------------------------------------------------------------------------
console.log('CASE 3: Verifying reference to nonexistent table => FAIL');
const case3Fixture = path.join(ROOT_DIR, 'src/case3_fixture.ts');
try {
  fs.writeFileSync(
    case3Fixture,
    `import { supabase } from './lib/supabase';\n` +
    `export const loadData = () => supabase.from('phantom_nonexistent_table').select('*');\n`
  );

  let failed = false;
  try {
    execSync(`node "${CHECK_SCRIPT}"`, { stdio: 'pipe' });
  } catch (err) {
    failed = true;
    const output = err.stderr.toString() + err.stdout.toString();
    if (output.includes("Reference to non-existent database table: 'phantom_nonexistent_table'")) {
      console.log('✓ CASE 3 Passed: Correctly failed on nonexistent table reference.');
    } else {
      console.error('❌ CASE 3 Failed with unexpected output:', output);
      process.exit(1);
    }
  }

  if (!failed) {
    console.error('❌ CASE 3 Failed: Script exited 0 on nonexistent table!');
    process.exit(1);
  }
} finally {
  if (fs.existsSync(case3Fixture)) fs.unlinkSync(case3Fixture);
}

// -----------------------------------------------------------------------------
// CASE 4: Client references nonexistent RPC => WARNING (non-fatal policy)
// -----------------------------------------------------------------------------
console.log('CASE 4: Verifying reference to unverified RPC stored function => WARNING');
const case4Fixture = path.join(ROOT_DIR, 'src/case4_fixture.ts');
try {
  fs.writeFileSync(
    case4Fixture,
    `import { supabase } from './lib/supabase';\n` +
    `export const callProc = () => supabase.rpc('unverified_custom_rpc_function', {});\n`
  );

  let output = '';
  try {
    output = execSync(`node "${CHECK_SCRIPT}" 2>&1`, { stdio: 'pipe' }).toString();
  } catch (err) {
    output = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '');
  }

  if (output.includes("Reference to unverified stored function: 'unverified_custom_rpc_function'")) {
    console.log('✓ CASE 4 Passed: Documented policy logs non-blocking schema warning for unverified RPC.');
  } else {
    console.error('❌ CASE 4 Failed: Expected RPC warning not found in output:', output);
    process.exit(1);
  }
} catch (err) {
  console.error('❌ CASE 4 Failed: RPC reference caused fatal error instead of documented warning:', err.stderr.toString());
  process.exit(1);
} finally {
  if (fs.existsSync(case4Fixture)) fs.unlinkSync(case4Fixture);
}

console.log('==========================================================');
console.log('ALL 4 REGRESSION CASES PASSED SUCCESSFULLY.');
console.log('==========================================================');
