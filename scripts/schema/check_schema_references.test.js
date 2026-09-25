#!/usr/bin/env node
/**
 * Regression Test Suite for check_schema_references.js
 *
 * Verifies required regression cases:
 * CASE 1: Multiline .from('quiz_sessions').insert({\n  score_pct: 75\n}) with manifest missing score_pct => FAIL
 * CASE 2: Same multiline write with manifest containing score_pct => PASS
 * CASE 3: Multiline insert contains nonexistent arbitrary column => FAIL
 * CASE 4: Valid multiline insert => PASS
 * CASE 5: Nonexistent table => FAIL
 * BONUS: Client references nonexistent RPC => WARNING (documented non-fatal policy)
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

// Helper to execute check script and catch output
function runCheck(args = '') {
  try {
    const stdout = execSync(`node "${CHECK_SCRIPT}" ${args} 2>&1`, { stdio: 'pipe' }).toString();
    return { code: 0, output: stdout };
  } catch (err) {
    const output = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '');
    return { code: err.status || 1, output };
  }
}

// -----------------------------------------------------------------------------
// CASE 1: Multiline .from('quiz_sessions').insert({\n  score_pct: 75\n})
//         with manifest missing score_pct => FAIL
// -----------------------------------------------------------------------------
console.log('CASE 1: Multiline .from("quiz_sessions").insert({\\n  score_pct: 75\\n}) missing from manifest => FAIL');
const case1Fixture = path.join(__dirname, 'temp_case1_fixture.ts');
try {
  fs.writeFileSync(
    case1Fixture,
    `// Case 1: Multiline insert with score_pct\n` +
    `const { error } = await supabase\n` +
    `  .from('quiz_sessions')\n` +
    `  .insert({\n` +
    `    score_pct: 75\n` +
    `  });\n`
  );

  const res = runCheck(`--path "${case1Fixture}"`);
  if (res.code !== 0 && res.output.includes("Invalid column reference: 'score_pct' in .insert() on table 'quiz_sessions'")) {
    console.log('✓ CASE 1 Passed: Correctly failed on multiline score_pct insert when missing from manifest.');
  } else {
    console.error('❌ CASE 1 Failed. Expected failure on score_pct. Output:', res.output);
    process.exit(1);
  }
} finally {
  if (fs.existsSync(case1Fixture)) fs.unlinkSync(case1Fixture);
}

// -----------------------------------------------------------------------------
// CASE 2: Same multiline write with manifest containing score_pct => PASS
// -----------------------------------------------------------------------------
console.log('CASE 2: Same multiline write with manifest containing score_pct => PASS');
const case2Fixture = path.join(__dirname, 'temp_case2_fixture.ts');
const tempManifest = path.join(__dirname, 'temp-manifest-with-score-pct.json');
try {
  const manifestData = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf-8'));
  const tables = JSON.parse(JSON.stringify(manifestData.tables));
  if (!tables.quiz_sessions.includes('score_pct')) {
    tables.quiz_sessions.push('score_pct');
  }
  fs.writeFileSync(tempManifest, JSON.stringify({ ...manifestData, tables }, null, 2), 'utf-8');

  fs.writeFileSync(
    case2Fixture,
    `// Case 2: Multiline insert with score_pct after migration adds it\n` +
    `const { error } = await supabase\n` +
    `  .from('quiz_sessions')\n` +
    `  .insert({\n` +
    `    score_pct: 75\n` +
    `  });\n`
  );

  const res = runCheck(`--path "${case2Fixture}" --manifest "${tempManifest}"`);
  if (res.code === 0 && res.output.includes('PASSED')) {
    console.log('✓ CASE 2 Passed: Correctly passed when score_pct is present in manifest.');
  } else {
    console.error('❌ CASE 2 Failed. Output:', res.output);
    process.exit(1);
  }
} finally {
  if (fs.existsSync(case2Fixture)) fs.unlinkSync(case2Fixture);
  if (fs.existsSync(tempManifest)) fs.unlinkSync(tempManifest);
}

// -----------------------------------------------------------------------------
// CASE 3: Multiline insert contains nonexistent arbitrary column => FAIL
// -----------------------------------------------------------------------------
console.log('CASE 3: Multiline insert with nonexistent arbitrary column => FAIL');
const case3Fixture = path.join(__dirname, 'temp_case3_fixture.ts');
try {
  fs.writeFileSync(
    case3Fixture,
    `// Case 3: Arbitrary invalid column in multiline insert\n` +
    `const { error } = await supabase\n` +
    `  .from('profiles')\n` +
    `  .insert({\n` +
    `    full_name: 'Jane Doe',\n` +
    `    completely_nonexistent_col_xyz: 'bad'\n` +
    `  });\n`
  );

  const res = runCheck(`--path "${case3Fixture}"`);
  if (res.code !== 0 && res.output.includes("Invalid column reference: 'completely_nonexistent_col_xyz' in .insert() on table 'profiles'")) {
    console.log('✓ CASE 3 Passed: Correctly failed on nonexistent arbitrary column in multiline insert.');
  } else {
    console.error('❌ CASE 3 Failed. Output:', res.output);
    process.exit(1);
  }
} finally {
  if (fs.existsSync(case3Fixture)) fs.unlinkSync(case3Fixture);
}

// -----------------------------------------------------------------------------
// CASE 4: Valid multiline insert => PASS
// -----------------------------------------------------------------------------
console.log('CASE 4: Valid multiline insert => PASS');
const case4Fixture = path.join(__dirname, 'temp_case4_fixture.ts');
try {
  fs.writeFileSync(
    case4Fixture,
    `// Case 4: Valid multiline insert\n` +
    `const { data, error } = await supabase\n` +
    `  .from('profiles')\n` +
    `  .insert({\n` +
    `    full_name: 'Test Student',\n` +
    `    streak_count: 5,\n` +
    `    level: 2\n` +
    `  });\n`
  );

  const res = runCheck(`--path "${case4Fixture}"`);
  if (res.code === 0 && res.output.includes('PASSED')) {
    console.log('✓ CASE 4 Passed: Valid multiline insert accepted without violation.');
  } else {
    console.error('❌ CASE 4 Failed. Output:', res.output);
    process.exit(1);
  }
} finally {
  if (fs.existsSync(case4Fixture)) fs.unlinkSync(case4Fixture);
}

// -----------------------------------------------------------------------------
// CASE 5: Nonexistent table => FAIL
// -----------------------------------------------------------------------------
console.log('CASE 5: Nonexistent table => FAIL');
const case5Fixture = path.join(__dirname, 'temp_case5_fixture.ts');
try {
  fs.writeFileSync(
    case5Fixture,
    `// Case 5: Nonexistent table\n` +
    `export const loadData = () => supabase.from('phantom_nonexistent_table_xyz').select('*');\n`
  );

  const res = runCheck(`--path "${case5Fixture}"`);
  if (res.code !== 0 && res.output.includes("Reference to non-existent database table: 'phantom_nonexistent_table_xyz'")) {
    console.log('✓ CASE 5 Passed: Correctly failed on nonexistent table reference.');
  } else {
    console.error('❌ CASE 5 Failed. Output:', res.output);
    process.exit(1);
  }
} finally {
  if (fs.existsSync(case5Fixture)) fs.unlinkSync(case5Fixture);
}

// -----------------------------------------------------------------------------
// BONUS: Client references unverified RPC => WARNING (non-fatal)
// -----------------------------------------------------------------------------
console.log('BONUS: Unverified RPC stored function => WARNING (non-fatal policy)');
const bonusFixture = path.join(__dirname, 'temp_bonus_fixture.ts');
try {
  fs.writeFileSync(
    bonusFixture,
    `export const callProc = () => supabase.rpc('unverified_custom_rpc_function', {});\n`
  );

  const res = runCheck(`--path "${bonusFixture}"`);
  if (res.code === 0 && res.output.includes("Reference to unverified stored function: 'unverified_custom_rpc_function'")) {
    console.log('✓ BONUS Passed: Documented policy logs non-blocking schema warning for unverified RPC.');
  } else {
    console.error('❌ BONUS Failed. Output:', res.output);
    process.exit(1);
  }
} finally {
  if (fs.existsSync(bonusFixture)) fs.unlinkSync(bonusFixture);
}

console.log('==========================================================');
console.log('ALL 5 REGRESSION CASES (PLUS RPC WARNING CHECK) PASSED.');
console.log('==========================================================');
