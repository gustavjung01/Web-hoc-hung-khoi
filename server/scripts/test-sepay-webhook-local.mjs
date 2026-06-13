/**
 * Test script for SePay webhook local testing
 * Usage: node scripts/test-sepay-webhook-local.mjs
 * 
 * Set SEPAY_WEBHOOK_SECRET env var before running:
 *   $env:SEPAY_WEBHOOK_SECRET="test-secret" (PowerShell)
 *   export SEPAY_WEBHOOK_SECRET="test-secret" (Bash)
 */

import crypto from 'crypto';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://localhost:3001').trim();
const WEBHOOK_SECRET = process.env.SEPAY_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error('Error: SEPAY_WEBHOOK_SECRET not set');
  console.error('Please set it: $env:SEPAY_WEBHOOK_SECRET="your-test-secret"');
  process.exit(1);
}

// Test payload
const testPayload = {
  code: 'ORDER-TEST-001',
  transferAmount: 100000,
  accountNumber: '1234567890',
  transactionId: 'TXN-' + Date.now(),
  content: 'Test payment',
};

/**
 * Generate HMAC-SHA256 signature
 */
function generateSignature(payload, secret) {
  const rawBody = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
}

/**
 * Make HTTP request
 */
async function makeRequest(method, path, body = null, headers = {}) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const responseBody = await response.text();
    return {
      status: response.status,
      body: responseBody,
    };
  } catch (error) {
    return {
      status: 'ERROR',
      body: error.message,
    };
  }
}

/**
 * Run tests
 */
async function runTests() {
  console.log('=== SePay Webhook Local Tests ===\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Webhook Secret: [${WEBHOOK_SECRET ? 'SET' : 'NOT SET'}] (length: ${WEBHOOK_SECRET?.length || 0})\n`);

  let passed = 0;
  let failed = 0;

  // Test 1: Health check
  console.log('1. GET /api/health');
  const health = await makeRequest('GET', '/api/health');
  console.log(`   Status: ${health.status}`);
  if (health.status === 200) {
    console.log('   ✅ PASS');
    passed++;
  } else {
    console.log('   ❌ FAIL');
    console.log(`   Response: ${health.body}`);
    failed++;
  }

  // Test 2: Missing signature
  console.log('\n2. POST /api/payments/webhooks/sepay (missing signature)');
  const missingSig = await makeRequest('POST', '/api/payments/webhooks/sepay', testPayload);
  console.log(`   Status: ${missingSig.status}`);
  if (missingSig.status === 401) {
    console.log('   ✅ PASS (401 as expected)');
    passed++;
  } else {
    console.log('   ❌ FAIL (expected 401)');
    console.log(`   Response: ${missingSig.body}`);
    failed++;
  }

  // Test 3: Wrong signature
  console.log('\n3. POST /api/payments/webhooks/sepay (wrong signature)');
  const wrongSig = await makeRequest('POST', '/api/payments/webhooks/sepay', testPayload, {
    'x-sepay-signature': 'invalid-signature-12345',
  });
  console.log(`   Status: ${wrongSig.status}`);
  if (wrongSig.status === 403) {
    console.log('   ✅ PASS (403 as expected)');
    passed++;
  } else {
    console.log('   ❌ FAIL (expected 403)');
    console.log(`   Response: ${wrongSig.body}`);
    failed++;
  }

  // Test 4: Valid signature
  console.log('\n4. POST /api/payments/webhooks/sepay (valid signature)');
  const validSignature = generateSignature(testPayload, WEBHOOK_SECRET);
  const validSig = await makeRequest('POST', '/api/payments/webhooks/sepay', testPayload, {
    'x-sepay-signature': validSignature,
  });
  console.log(`   Status: ${validSig.status}`);
  if (validSig.status === 200) {
    console.log('   ✅ PASS (200 as expected)');
    passed++;
  } else {
    console.log('   ❌ FAIL (expected 200)');
    console.log(`   Response: ${validSig.body}`);
    failed++;
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}/4`);
  console.log(`Failed: ${failed}/4`);
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
