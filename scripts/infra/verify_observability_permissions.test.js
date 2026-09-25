#!/usr/bin/env node
/**
 * Static Test: Verify Observability Migration Access Controls
 * Asserts that 20260925150000_infra_observability_views.sql revokes privileges
 * from anon and authenticated on all declared views.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const MIGRATION_FILE = path.join(
  ROOT_DIR,
  'supabase/migrations/20260925150000_infra_observability_views.sql'
);

console.log('Running static privilege verification on observability migration...');

const content = fs.readFileSync(MIGRATION_FILE, 'utf-8');

const views = [
  'v_ai_gateway_hourly_metrics',
  'v_ai_provider_fallback_summary',
  'v_quiz_session_health',
  'v_database_table_sizes',
];

for (const view of views) {
  // Check REVOKE
  const revokeRegex = new RegExp(
    `REVOKE\\s+ALL\\s+ON\\s+(?:public\\.)?${view}\\s+FROM\\s+[^;]*anon[^;]*authenticated`,
    'i'
  );
  assert.ok(
    revokeRegex.test(content),
    `Migration must explicitly REVOKE ALL on ${view} from anon and authenticated.`
  );

  // Check GRANT to service_role and postgres only
  const grantRegex = new RegExp(
    `GRANT\\s+SELECT\\s+ON\\s+(?:public\\.)?${view}\\s+TO\\s+service_role,\\s*postgres`,
    'i'
  );
  assert.ok(
    grantRegex.test(content),
    `Migration must strictly GRANT SELECT on ${view} to service_role, postgres.`
  );

  console.log(`✓ Verified security hardening for view: ${view}`);
}

console.log('==========================================================');
console.log('Observability view security verification PASSED.');
console.log('==========================================================');
