/**
 * Unit Test for support_identifier.js
 */

import assert from 'assert';
import { generateSupportId } from './support_identifier.js';

console.log('Running unit tests for support_identifier.js...');

const testUid1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const testUid2 = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const secretKey = 'super-secret-hmac-test-key-512';

// Test 1: Format validation
const id1 = generateSupportId(testUid1, secretKey);
assert.match(id1, /^ED-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/, 'Format must match ED-XXXX-XXXX-XXXX-XXXX');
console.log(`✓ Test 1 Passed: Generated valid format (${id1})`);

// Test 2: Deterministic output for same user and key
const id1Repeat = generateSupportId(testUid1, secretKey);
assert.strictEqual(id1, id1Repeat, 'Output must be deterministic for identical input and key');
console.log('✓ Test 2 Passed: Deterministic generation verified.');

// Test 3: Uniqueness across distinct user IDs
const id2 = generateSupportId(testUid2, secretKey);
assert.notStrictEqual(id1, id2, 'Distinct user IDs must produce distinct tokens');
console.log('✓ Test 3 Passed: Distinct tokens generated for different user UUIDs.');

// Test 4: Key isolation (different secret key produces different token)
const idKey2 = generateSupportId(testUid1, 'different-secret-key');
assert.notStrictEqual(id1, idKey2, 'Different secret keys must produce distinct tokens');
console.log('✓ Test 4 Passed: Secret key rotation alters support token.');

console.log('All support_identifier unit tests PASSED.');
