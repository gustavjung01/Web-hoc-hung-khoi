/**
 * Test Paid Flow - Local Mode v2
 * Ghi summary JSON ra file ngoài repo
 * Không in log dài ra console
 */

import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 3901;
const TEST_SECRET = 'local-test-secret';
const SUMMARY_FILE = 'F:\\1_A_Disk_D\\Tool\\hoc-tap-cap-02\\paid-flow-test-summary.json';

let serverProcess = null;
let summary = {
  ok: true,
  build: 'unknown',
  syntaxChecks: {
    index: 'unknown',
    emailService: 'unknown',
    paidOrderTemplate: 'unknown',
    testScript: 'unknown'
  },
  tests: {
    paidGrade2: 'unknown',
    duplicateTransaction: 'unknown',
    amountMismatch: 'unknown',
    bundleSelectedGrades: 'unknown',
    emailLogHtmlText: 'unknown',
    coverImageInHtml: 'unknown'
  },
  details: {
    orderId: null,
    licenseKeyCreated: false,
    emailLogCreated: false,
    emailLogCountBeforeDuplicate: 0,
    emailLogCountAfterDuplicate: 0,
    coverUrl: 'https://hochungkhoi.site/cover-facebook.png'
  },
  errors: []
};

function addError(msg, err) {
  summary.ok = false;
  let errorMsg = msg;
  if (err) {
    if (typeof err === 'object') {
      errorMsg += ': ' + JSON.stringify(err).substring(0, 200);
    } else {
      errorMsg += ': ' + String(err);
    }
  }
  summary.errors.push(errorMsg);
}

function writeSummary() {
  try {
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('Failed to write summary:', err.message);
  }
}

// Start test server
async function startTestServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '..', 'index.js');
    serverProcess = spawn('node', [serverPath], {
      cwd: path.join(__dirname, '..'),
      env: { 
        ...process.env, 
        PORT: String(TEST_PORT), 
        SEPAY_WEBHOOK_SECRET: TEST_SECRET,
        EMAIL_MODE: 'test-log-only'
      },
      stdio: 'pipe'
    });
    
    let started = false;
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('running on port') && !started) {
        started = true;
        resolve();
      }
    });
    
    serverProcess.stderr.on('data', () => {});
    serverProcess.on('error', reject);
    
    setTimeout(() => {
      if (!started) {
        started = true;
        resolve();
      }
    }, 5000);
  });
}

function stopTestServer() {
  if (serverProcess) {
    serverProcess.kill();
  }
}

// Wait for health check
async function waitForHealth() {
  for (let i = 0; i < 10; i++) {
    try {
      const res = await request({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/health',
        method: 'GET'
      });
      if (res.status === 200) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// HTTP request helper
function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function signWebhook(body) {
  return crypto.createHmac('sha256', TEST_SECRET).update(body, 'utf8').digest('hex');
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// Test 1: Create order
async function testCreateOrderGrade2() {
  try {
    const orderData = {
      productId: 'grade2_12m',
      customerEmail: 'test@example.com',
      customerName: 'Test User'
    };
    
    const res = await request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(orderData))
      }
    }, JSON.stringify(orderData));
    
    if (res.status === 200 && res.body.ok && res.body.orderId) {
      summary.tests.paidGrade2 = 'pass';
      summary.details.orderId = res.body.orderId;
      return res.body.orderId;
    } else {
      summary.tests.paidGrade2 = 'fail';
      addError(`Create order failed: status=${res.status}, body=${JSON.stringify(res.body).substring(0, 100)}`);
      return null;
    }
  } catch (err) {
    summary.tests.paidGrade2 = 'fail';
    addError('Create order error', err);
    return null;
  }
}

// Test 2: Valid webhook
async function testValidWebhook(orderId) {
  try {
    const transactionId = 'test-tx-paid-grade2-001';
    const webhookBody = JSON.stringify({
      id: transactionId,
      transferAmount: 299000,
      content: `HTT-${orderId}`,
      referenceCode: `HTT-${orderId}`,
      transactionId: transactionId
    });
    
    const signature = signWebhook(webhookBody);
    
    const res = await request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/payments/webhooks/sepay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookBody),
        'x-sepay-signature': signature
      }
    }, webhookBody);
    
    if (res.status === 200 && res.body.ok && res.body.licenseGenerated) {
      return true;
    } else {
      addError('Valid webhook failed', res.body);
      return false;
    }
  } catch (err) {
    addError('Valid webhook error', err);
    return false;
  }
}

// Test 3: Check order and license
async function testCheckOrderLicense(orderId) {
  try {
    const ordersData = readJson(path.join(__dirname, '../data/orders.json'));
    const order = ordersData?.orders?.find(o => o.orderId === orderId);
    
    if (!order || order.status !== 'paid' || !order.licenseKey) {
      summary.tests.paidGrade2 = 'fail';
      addError('Order not paid or no license');
      return false;
    }
    
    summary.details.licenseKeyCreated = true;
    
    const licensesData = readJson(path.join(__dirname, '../data/licenses.json'));
    const license = licensesData?.licenses?.find(l => l.licenseKey === order.licenseKey);
    
    if (!license || license.status !== 'active') {
      addError('License not active');
      return false;
    }
    
    return order.licenseKey;
  } catch (err) {
    addError('Check order/license error', err);
    return false;
  }
}

// Test 4: Check email log
async function testCheckEmailLog(orderId) {
  try {
    const emailLogs = readJson(path.join(__dirname, '../data/email-logs.json'));
    const logs = emailLogs?.logs?.filter(l => l.orderId === orderId && l.type === 'paid_order') || [];
    
    summary.details.emailLogCountBeforeDuplicate = logs.length;
    
    if (logs.length === 0) {
      summary.tests.emailLogHtmlText = 'fail';
      summary.tests.coverImageInHtml = 'fail';
      addError('No email log found');
      return false;
    }
    
    const log = logs[0];
    
    if (!log.html || !log.text) {
      summary.tests.emailLogHtmlText = 'fail';
      addError('Email log missing html or text');
    } else {
      summary.tests.emailLogHtmlText = 'pass';
      summary.details.emailLogCreated = true;
    }
    
    if (log.html && log.html.includes('https://hochungkhoi.site/cover-facebook.png')) {
      summary.tests.coverImageInHtml = 'pass';
    } else {
      summary.tests.coverImageInHtml = 'fail';
      addError('Cover image URL not found in HTML');
    }
    
    return logs.length;
  } catch (err) {
    summary.tests.emailLogHtmlText = 'fail';
    summary.tests.coverImageInHtml = 'fail';
    addError('Check email log error', err);
    return false;
  }
}

// Test 5: Duplicate transaction
async function testDuplicateTransaction(orderId) {
  try {
    const transactionId = 'test-tx-paid-grade2-001';
    const webhookBody = JSON.stringify({
      id: transactionId,
      transferAmount: 299000,
      content: `HTT-${orderId}`,
      referenceCode: `HTT-${orderId}`,
      transactionId: transactionId
    });
    
    const signature = signWebhook(webhookBody);
    
    const licensesBefore = readJson(path.join(__dirname, '../data/licenses.json'))?.licenses?.length || 0;
    const emailsBefore = readJson(path.join(__dirname, '../data/email-logs.json'))?.logs?.length || 0;
    
    const res = await request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/payments/webhooks/sepay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookBody),
        'x-sepay-signature': signature
      }
    }, webhookBody);
    
    if (res.status !== 200 || (!res.body.duplicate && !res.body.alreadyPaid)) {
      summary.tests.duplicateTransaction = 'fail';
      addError('Duplicate not detected', res.body);
      return false;
    }
    
    const licensesAfter = readJson(path.join(__dirname, '../data/licenses.json'))?.licenses?.length || 0;
    const emailsAfter = readJson(path.join(__dirname, '../data/email-logs.json'))?.logs?.length || 0;
    
    summary.details.emailLogCountAfterDuplicate = emailsAfter;
    
    if (licensesAfter > licensesBefore || emailsAfter > emailsBefore) {
      summary.tests.duplicateTransaction = 'fail';
      addError(`Duplicate created new data: licenses ${licensesBefore}->${licensesAfter}, emails ${emailsBefore}->${emailsAfter}`);
      return false;
    }
    
    summary.tests.duplicateTransaction = 'pass';
    return true;
  } catch (err) {
    summary.tests.duplicateTransaction = 'fail';
    addError('Duplicate test error', err);
    return false;
  }
}

// Test 6: Amount mismatch
async function testAmountMismatch() {
  try {
    const orderData = {
      productId: 'grade2_12m',
      customerEmail: 'test2@example.com',
      customerName: 'Test User 2'
    };
    
    const res = await request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(orderData))
      }
    }, JSON.stringify(orderData));
    
    if (!res.body.orderId) {
      addError('Amount mismatch: create order failed');
      summary.tests.amountMismatch = 'fail';
      return false;
    }
    
    const orderId = res.body.orderId;
    const transactionId = 'test-tx-wrong-amount-001';
    const webhookBody = JSON.stringify({
      id: transactionId,
      transferAmount: 100000,
      content: `HTT-${orderId}`,
      referenceCode: `HTT-${orderId}`,
      transactionId: transactionId
    });
    
    const signature = signWebhook(webhookBody);
    
    const res2 = await request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/payments/webhooks/sepay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookBody),
        'x-sepay-signature': signature
      }
    }, webhookBody);
    
    if (res2.status !== 200 || !res2.body.message?.includes('Amount mismatch')) {
      summary.tests.amountMismatch = 'fail';
      addError('Amount mismatch not detected', res2.body);
      return false;
    }
    
    const ordersData = readJson(path.join(__dirname, '../data/orders.json'));
    const order = ordersData?.orders?.find(o => o.orderId === orderId);
    
    if (order?.status === 'paid') {
      summary.tests.amountMismatch = 'fail';
      addError('Order marked paid with wrong amount');
      return false;
    }
    
    summary.tests.amountMismatch = 'pass';
    return true;
  } catch (err) {
    summary.tests.amountMismatch = 'fail';
    addError('Amount mismatch test error', err);
    return false;
  }
}

// Test 7: Bundle with selectedGrades
async function testBundleSelectedGrades() {
  try {
    const orderData = {
      productId: 'bundle_3_grades_12m',
      customerEmail: 'test3@example.com',
      customerName: 'Test User 3',
      selectedGrades: [
        { id: 1, name: 'Lớp 1' },
        { id: 2, name: 'Lớp 2' },
        { id: 3, name: 'Lớp 3' }
      ]
    };
    
    const res = await request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(orderData))
      }
    }, JSON.stringify(orderData));
    
    if (!res.body.orderId) {
      summary.tests.bundleSelectedGrades = 'fail';
      addError('Bundle: create order failed');
      return false;
    }
    
    const orderId = res.body.orderId;
    const transactionId = 'test-tx-bundle-001';
    const webhookBody = JSON.stringify({
      id: transactionId,
      transferAmount: 599000,
      content: `HTT-${orderId}`,
      referenceCode: `HTT-${orderId}`,
      transactionId: transactionId
    });
    
    const signature = signWebhook(webhookBody);
    
    const res2 = await request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/payments/webhooks/sepay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookBody),
        'x-sepay-signature': signature
      }
    }, webhookBody);
    
    if (res2.status !== 200 || !res2.body.licenseGenerated) {
      summary.tests.bundleSelectedGrades = 'fail';
      addError('Bundle webhook failed', res2.body);
      return false;
    }
    
    const ordersData = readJson(path.join(__dirname, '../data/orders.json'));
    const order = ordersData?.orders?.find(o => o.orderId === orderId);
    
    if (!order?.licenseKey) {
      summary.tests.bundleSelectedGrades = 'fail';
      addError('Bundle order no license');
      return false;
    }
    
    const licensesData = readJson(path.join(__dirname, '../data/licenses.json'));
    const license = licensesData?.licenses?.find(l => l.licenseKey === order.licenseKey);
    
    if (!license?.selectedGrades || license.selectedGrades.length !== 3) {
      summary.tests.bundleSelectedGrades = 'fail';
      addError(`Bundle license missing selectedGrades: ${JSON.stringify(license?.selectedGrades)}`);
      return false;
    }
    
    summary.tests.bundleSelectedGrades = 'pass';
    return true;
  } catch (err) {
    summary.tests.bundleSelectedGrades = 'fail';
    addError('Bundle test error', err);
    return false;
  }
}

// Run syntax checks
async function runSyntaxChecks() {
  const checks = [
    { file: 'index.js', key: 'index' },
    { file: 'emailService.js', key: 'emailService' },
    { file: 'emailTemplates/paidOrder.js', key: 'paidOrderTemplate' },
    { file: 'scripts/test-paid-flow-v2.mjs', key: 'testScript' }
  ];
  
  for (const check of checks) {
    try {
      const filePath = path.join(__dirname, '..', check.file);
      const result = await new Promise((resolve) => {
        const proc = spawn('node', ['--check', filePath], { stdio: 'pipe' });
        proc.on('exit', (code) => resolve(code === 0));
        proc.on('error', () => resolve(false));
      });
      summary.syntaxChecks[check.key] = result ? 'pass' : 'fail';
      if (!result) {
        addError(`Syntax check failed: ${check.file}`);
      }
    } catch {
      summary.syntaxChecks[check.key] = 'fail';
      addError(`Syntax check error: ${check.file}`);
    }
  }
}

// Main runner
async function main() {
  console.log('Starting paid flow test...');
  console.log('Step 1: Running syntax checks...');
  
  // Run syntax checks
  await runSyntaxChecks();
  
  if (Object.values(summary.syntaxChecks).some(v => v === 'fail')) {
    summary.ok = false;
    summary.build = 'fail';
    writeSummary();
    console.log('Syntax checks failed, exiting');
    process.exit(1);
  }
  
  summary.build = 'pass';
  console.log('Step 2: Starting test server...');
  
  // Start server
  try {
    await startTestServer();
    const healthy = await waitForHealth();
    if (!healthy) {
      addError('Server health check failed');
      summary.ok = false;
      writeSummary();
      stopTestServer();
      process.exit(1);
    }
  } catch (err) {
    addError('Failed to start server', err);
    summary.ok = false;
    writeSummary();
    stopTestServer();
    process.exit(1);
  }
  
  // Run tests
  const orderId = await testCreateOrderGrade2();
  if (orderId) {
    await testValidWebhook(orderId);
    await testCheckOrderLicense(orderId);
    await testCheckEmailLog(orderId);
    await testDuplicateTransaction(orderId);
    await testAmountMismatch();
    await testBundleSelectedGrades();
  }
  
  // Determine final result
  const testResults = Object.values(summary.tests);
  if (testResults.some(r => r === 'fail' || r === 'unknown')) {
    summary.ok = false;
  }
  
  stopTestServer();
  writeSummary();
  
  console.log(`Test completed. Summary: ${summary.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Summary file: ${SUMMARY_FILE}`);
  
  process.exit(summary.ok ? 0 : 1);
}

main().catch(err => {
  addError('Main error', err);
  stopTestServer();
  writeSummary();
  process.exit(1);
});
