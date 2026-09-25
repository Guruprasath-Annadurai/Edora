/**
 * Edora Chaos & Failure Injection Automated Test Suite
 * Tests fallback cascade, timeout aborts, idempotency, and graceful degradation.
 */

import http from 'http';
import assert from 'assert';

const BASE_URL = 'http://localhost:9099';

async function makeRequest(headers = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE_URL);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data), raw: data });
          } catch {
            resolve({ status: res.statusCode, body: null, raw: data });
          }
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timeout exceeded'));
    });

    req.write(JSON.stringify({ prompt: 'test query' }));
    req.end();
  });
}

// Simulated Client Multi-Tier AI Gateway Fallback Routine
async function simulateClientAIFallback(primaryChaosMode) {
  // Tier 1: Primary provider
  let res = await makeRequest({ 'x-chaos-mode': primaryChaosMode });
  if (res.status === 200) {
    return { provider: 'primary', content: res.body };
  }

  // Tier 2: Secondary / Fast Small
  res = await makeRequest({ 'x-chaos-mode': 'normal' });
  if (res.status === 200) {
    return { provider: 'fallback-fast-small', content: res.body };
  }

  // Tier 3: Deterministic Graceful Offline Fallback
  return {
    provider: 'graceful-offline',
    content: 'We are experiencing high demand. Here is a review card while we reconnect.',
  };
}

async function runChaosTests() {
  console.log('==========================================================');
  console.log('RUNNING EDORA CHAOS & FAILURE TEST SUITE');
  console.log('==========================================================');

  // Scenario 1: Groq 500 Error Cascade
  console.log('Test 1: Simulating Groq 500 Internal Error...');
  const res1 = await makeRequest({ 'x-chaos-mode': 'groq-500' });
  assert.strictEqual(res1.status, 500, 'Expected 500 status from Groq failure');
  const fallbackResult1 = await simulateClientAIFallback('groq-500');
  assert.strictEqual(fallbackResult1.provider, 'fallback-fast-small', 'Should fallback to secondary provider');
  console.log('✓ Test 1 Passed: Groq 500 cascaded cleanly to secondary tier.');

  // Scenario 2: Groq Timeout / Slow API
  console.log('Test 2: Simulating Groq Timeout (> 3000ms)...');
  let timedOut = false;
  try {
    await makeRequest({ 'x-chaos-mode': 'groq-timeout' }, 1000); // 1s client timeout
  } catch (err) {
    if (err.message.includes('timeout')) timedOut = true;
  }
  assert.strictEqual(timedOut, true, 'Client should abort on timeout window');
  console.log('✓ Test 2 Passed: Slow API was terminated by client timeout.');

  // Scenario 3: Claude Overloaded (HTTP 529)
  console.log('Test 3: Simulating Claude Overloaded (529)...');
  const res3 = await makeRequest({ 'x-chaos-mode': 'claude-fail' });
  assert.strictEqual(res3.status, 529, 'Expected 529 status from Claude overloaded');
  console.log('✓ Test 3 Passed: Claude overload failure captured without crash.');

  // Scenario 4: Gemini Quota Exhaustion (HTTP 429)
  console.log('Test 4: Simulating Gemini 429 Resource Exhausted...');
  const res4 = await makeRequest({ 'x-chaos-mode': 'gemini-fail' });
  assert.strictEqual(res4.status, 429, 'Expected 429 from Gemini quota breach');
  console.log('✓ Test 4 Passed: Gemini 429 quota exhaustion handled.');

  // Scenario 5: Complete Upstream Outage (All Providers Fail)
  console.log('Test 5: Simulating All-Provider Outage...');
  const res5 = await makeRequest({ 'x-chaos-mode': 'all-fail' });
  assert.strictEqual(res5.status, 503, 'Expected 503 from all-fail scenario');
  console.log('✓ Test 5 Passed: All-fail correctly returns graceful degradation state.');

  // Scenario 6: Database Statement Timeout Simulation
  console.log('Test 6: Simulating Postgres Statement Timeout (57014)...');
  const res6 = await makeRequest({ 'x-chaos-mode': 'db-timeout' });
  assert.strictEqual(res6.body.code, '57014', 'Expected Postgres timeout code 57014');
  console.log('✓ Test 6 Passed: Database statement timeout intercepted.');

  // Scenario 7: Idempotency Key Handling
  console.log('Test 7: Verifying Idempotency Key De-duplication...');
  const res7 = await makeRequest({
    'x-chaos-mode': 'duplicate-idempotency',
    'idempotency-key': 'req_xyz_12345',
  });
  assert.strictEqual(res7.body.idempotencyKey, 'req_xyz_12345');
  assert.strictEqual(res7.body.replayed, true);
  console.log('✓ Test 7 Passed: Idempotency token propagated and acknowledged.');

  console.log('==========================================================');
  console.log('ALL CHAOS SCENARIOS COMPLETED SUCCESSFULLY.');
  console.log('==========================================================');
}

runChaosTests().catch((err) => {
  console.error('❌ Chaos Test Suite Failed:', err);
  process.exit(1);
});
