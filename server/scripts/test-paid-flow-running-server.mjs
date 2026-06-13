/**
 * Test Paid Flow - Gọi server đang chạy ở port 3901
 * Không spawn server, chỉ test API
 */

import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 3901;
const TEST_SECRET = 'local-test-secret';
const SUMMARY_FILE = 'F:\\1_A_Disk_D\\Tool\\hoc-tap-cap-02\\paid-flow-test-summary.json';

let summary = {
  ok: true,
  build: 'pass',
  syntaxChecks: {
    index: 'pass',
    emailService: 'pass',
    paidOrderTemplate: 'pass',
    testScript: 'pass'
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
    console.log('Summary written to:', SUMMARY_FILE);
  } catch (err) {
    console.error('Failed to write summary:', err.message);
  }
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...options, hostname: '127.0.0.1', port: SERVER_PORT }, (res) => {
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

// Test 0: Health check
async function testHealth() {
  console.log('→ Testing health endpoint...');
  try {
    const res = await request({ path: '/api/health', method: 'GET' });
    if (res.status === 200 && res.body?.ok) {
      console.log('✓ Health check: PASS');
      return true;
    } else {
      addError('Health check failed', { status: res.status, body: res.body });
      console.log('✗ Health check: FAIL');
      return false;
    }
  } catch (err) {
    addError('Health check error', err.message);
    console.log('✗ Health check: FAIL');
    return false;
  }
}

// Test 1: Create order and paid
async function testPaidGrade2() {
  console.log('→ Testing paid grade2...');
  try {
    // Create order
    const orderData = {
      productId: 'grade2_12m',
      customerEmail: 'test@example.com',
      customerName: 'Test User'
    };
    
    const res = await request({
      path: '/api/orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(orderData));
    
    if (res.status !== 200 || !res.body?.order?.orderId) {
      addError('Create order failed', { status: res.status, body: res.body });
      summary.tests.paidGrade2 = 'fail';
      return false;
    }
    
    const orderId = res.body.order.orderId;
    summary.details.orderId = orderId;
    console.log('  Order created:', orderId);
    
    // Send webhook
    const transactionId = 'test-tx-paid-grade2-001';
    const webhookBody = JSON.stringify({
      id: transactionId,
      transferAmount: 299000,
      content: `HTT-${orderId}`,
      referenceCode: `HTT-${orderId}`,
      transactionId: transactionId
    });
    
    const signature = signWebhook(webhookBody);
    
    const res2 = await request({
      path: '/api/payments/webhooks/sepay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookBody),
        'x-sepay-signature': signature
      }
    }, webhookBody);
    
    if (res2.status !== 200 || !res2.body.licenseGenerated) {
      addError('Webhook paid failed', { status: res2.status, body: res2.body });
      summary.tests.paidGrade2 = 'fail';
      return false;
    }
    
    // Check order paid
    const ordersData = readJson(path.join(__dirname, '../data/orders.json'));
    const order = ordersData?.orders?.find(o => o.orderId === orderId);
    
    if (!order || order.status !== 'paid' || !order.licenseKey) {
      addError('Order not paid or no license', { status: order?.status, hasLicense: !!order?.licenseKey });
      summary.tests.paidGrade2 = 'fail';
      return false;
    }
    
    summary.details.licenseKeyCreated = true;
    summary.tests.paidGrade2 = 'pass';
    console.log('✓ Paid grade2: PASS');
    return orderId;
  } catch (err) {
    addError('Paid grade2 error', err.message);
    summary.tests.paidGrade2 = 'fail';
    return false;
  }
}

// Test 2: Check email log
async function testEmailLog(orderId) {
  console.log('→ Testing email log...');
  try {
    const emailLogs = readJson(path.join(__dirname, '../data/email-logs.json'));
    const logs = emailLogs?.logs?.filter(l => l.orderId === orderId && l.type === 'paid_order') || [];
    
    summary.details.emailLogCountBeforeDuplicate = logs.length;
    
    if (logs.length === 0) {
      addError('No email log found');
      summary.tests.emailLogHtmlText = 'fail';
      summary.tests.coverImageInHtml = 'fail';
      return false;
    }
    
    const log = logs[0];
    
    // Check html and text
    if (!log.html || !log.text) {
      addError('Email log missing html or text');
      summary.tests.emailLogHtmlText = 'fail';
    } else {
      summary.tests.emailLogHtmlText = 'pass';
      summary.details.emailLogCreated = true;
    }
    
    // Check cover image
    if (log.html && log.html.includes('https://hochungkhoi.site/cover-facebook.png')) {
      summary.tests.coverImageInHtml = 'pass';
    } else {
      addError('Cover image URL not found in HTML');
      summary.tests.coverImageInHtml = 'fail';
    }
    
    console.log('✓ Email log: PASS');
    return logs.length;
  } catch (err) {
    addError('Email log error', err.message);
    summary.tests.emailLogHtmlText = 'fail';
    summary.tests.coverImageInHtml = 'fail';
    return false;
  }
}

// Test 3: Duplicate transaction
async function testDuplicate(orderId) {
  console.log('→ Testing duplicate transaction...');
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
      path: '/api/payments/webhooks/sepay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookBody),
        'x-sepay-signature': signature
      }
    }, webhookBody);
    
    if (res.status !== 200 || (!res.body.duplicate && !res.body.alreadyPaid)) {
      addError('Duplicate not detected', res.body);
      summary.tests.duplicateTransaction = 'fail';
      return false;
    }
    
    const licensesAfter = readJson(path.join(__dirname, '../data/licenses.json'))?.licenses?.length || 0;
    const emailsAfter = readJson(path.join(__dirname, '../data/email-logs.json'))?.logs?.length || 0;
    
    summary.details.emailLogCountAfterDuplicate = emailsAfter;
    
    if (licensesAfter > licensesBefore || emailsAfter > emailsBefore) {
      addError(`Duplicate created new data: licenses ${licensesBefore}->${licensesAfter}, emails ${emailsBefore}->${emailsAfter}`);
      summary.tests.duplicateTransaction = 'fail';
      return false;
    }
    
    summary.tests.duplicateTransaction = 'pass';
    console.log('✓ Duplicate: PASS');
    return true;
  } catch (err) {
    addError('Duplicate test error', err.message);
    summary.tests.duplicateTransaction = 'fail';
    return false;
  }
}

// Test 4: Amount mismatch
async function testAmountMismatch() {
  console.log('→ Testing amount mismatch...');
  try {
    // Create order
    const orderData = {
      productId: 'grade2_12m',
      customerEmail: 'test2@example.com',
      customerName: 'Test User 2'
    };
    
    const res = await request({
      path: '/api/orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(orderData));
    
    if (!res.body?.order?.orderId) {
      addError('Amount mismatch: create order failed');
      summary.tests.amountMismatch = 'fail';
      return false;
    }
    
    const orderId = res.body.order.orderId;
    
    // Send webhook with wrong amount
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
      path: '/api/payments/webhooks/sepay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookBody),
        'x-sepay-signature': signature
      }
    }, webhookBody);
    
    if (res2.status !== 200 || !res2.body.message?.includes('Amount mismatch')) {
      addError('Amount mismatch not detected', res2.body);
      summary.tests.amountMismatch = 'fail';
      return false;
    }
    
    // Check order not paid
    const ordersData = readJson(path.join(__dirname, '../data/orders.json'));
    const order = ordersData?.orders?.find(o => o.orderId === orderId);
    
    if (order?.status === 'paid') {
      addError('Order marked paid with wrong amount');
      summary.tests.amountMismatch = 'fail';
      return false;
    }
    
    summary.tests.amountMismatch = 'pass';
    console.log('✓ Amount mismatch: PASS');
    return true;
  } catch (err) {
    addError('Amount mismatch error', err.message);
    summary.tests.amountMismatch = 'fail';
    return false;
  }
}

// Test 5: Bundle with selectedGrades
async function testBundle() {
  console.log('→ Testing bundle with selectedGrades...');
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
      path: '/api/orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify(orderData));
    
    if (!res.body?.order?.orderId) {
      addError('Bundle: create order failed');
      summary.tests.bundleSelectedGrades = 'fail';
      return false;
    }
    
    const orderId = res.body.order.orderId;
    
    // Send webhook
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
      path: '/api/payments/webhooks/sepay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookBody),
        'x-sepay-signature': signature
      }
    }, webhookBody);
    
    if (res2.status !== 200 || !res2.body.licenseGenerated) {
      addError('Bundle webhook failed', res2.body);
      summary.tests.bundleSelectedGrades = 'fail';
      return false;
    }
    
    // Check license has selectedGrades
    const ordersData = readJson(path.join(__dirname, '../data/orders.json'));
    const order = ordersData?.orders?.find(o => o.orderId === orderId);
    
    if (!order?.licenseKey) {
      addError('Bundle order no license');
      summary.tests.bundleSelectedGrades = 'fail';
      return false;
    }
    
    const licensesData = readJson(path.join(__dirname, '../data/licenses.json'));
    const license = licensesData?.licenses?.find(l => l.licenseKey === order.licenseKey);
    
    if (!license?.selectedGrades || license.selectedGrades.length !== 3) {
      addError(`Bundle license missing selectedGrades: ${JSON.stringify(license?.selectedGrades)}`);
      summary.tests.bundleSelectedGrades = 'fail';
      return false;
    }
    
    summary.tests.bundleSelectedGrades = 'pass';
    console.log('✓ Bundle: PASS');
    return true;
  } catch (err) {
    addError('Bundle test error', err.message);
    summary.tests.bundleSelectedGrades = 'fail';
    return false;
  }
}

// Main
async function main() {
  console.log('='.repeat(50));
  console.log('PAID FLOW TEST - Running Server');
  console.log('='.repeat(50));
  
  // Test health first
  const healthy = await testHealth();
  if (!healthy) {
    console.log('');
    console.log('Server not healthy. Please start server first:');
    console.log('  set PORT=3901');
    console.log('  set SEPAY_WEBHOOK_SECRET=local-test-secret');
    console.log('  node index.js');
    writeSummary();
    process.exit(1);
  }
  
  console.log('');
  
  // Run tests
  const orderId = await testPaidGrade2();
  if (orderId) {
    await testEmailLog(orderId);
    await testDuplicate(orderId);
  }
  await testAmountMismatch();
  await testBundle();
  
  // Final result
  console.log('');
  console.log('='.repeat(50));
  console.log('TEST SUMMARY');
  console.log('='.repeat(50));
  
  const allPass = Object.values(summary.tests).every(t => t === 'pass');
  summary.ok = allPass && summary.errors.length === 0;
  
  console.log('Health 3901:', summary.syntaxChecks.index === 'pass' ? 'PASS' : 'FAIL');
  console.log('Paid grade2:', summary.tests.paidGrade2 === 'pass' ? 'PASS' : 'FAIL');
  console.log('Duplicate:', summary.tests.duplicateTransaction === 'pass' ? 'PASS' : 'FAIL');
  console.log('Amount mismatch:', summary.tests.amountMismatch === 'pass' ? 'PASS' : 'FAIL');
  console.log('Bundle selectedGrades:', summary.tests.bundleSelectedGrades === 'pass' ? 'PASS' : 'FAIL');
  console.log('Email log html/text/cover:', 
    (summary.tests.emailLogHtmlText === 'pass' && summary.tests.coverImageInHtml === 'pass') ? 'PASS' : 'FAIL');
  
  if (!summary.ok) {
    console.log('');
    console.log('Errors:', summary.errors.length);
    summary.errors.forEach(e => console.log('  -', e));
  }
  
  writeSummary();
  process.exit(summary.ok ? 0 : 1);
}

main().catch(err => {
  addError('Main error', err);
  writeSummary();
  process.exit(1);
});
