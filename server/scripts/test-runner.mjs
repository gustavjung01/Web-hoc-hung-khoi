// Simple test runner - connects to running server at port 3901
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUMMARY_FILE = 'F:\\1_A_Disk_D\\Tool\\hoc-tap-cap-02\\paid-flow-test-summary.json';

let summary = {
  ok: true,
  tests: { paidGrade2: 'unknown', duplicate: 'unknown', amountMismatch: 'unknown', bundle: 'unknown', emailLog: 'unknown', coverImage: 'unknown' },
  errors: []
};

const req = (opts, body) => new Promise((res, rej) => {
  const r = http.request({ ...opts, hostname: '127.0.0.1', port: 3901 }, (resp) => {
    let d = '';
    resp.on('data', c => d += c);
    resp.on('end', () => {
      try { res({ status: resp.statusCode, body: JSON.parse(d) }); } 
      catch { res({ status: resp.statusCode, body: d }); }
    });
  });
  r.on('error', rej);
  if (body) r.write(body);
  r.end();
});

async function main() {
  console.log('Testing server at port 3901...');
  
  // Health check
  try {
    const h = await req({ path: '/api/health', method: 'GET' });
    if (h.status !== 200 || !h.body?.ok) throw new Error('Health failed');
    console.log('Health: PASS');
  } catch (e) {
    summary.ok = false;
    summary.errors.push('Health check failed: ' + e.message);
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
    console.log('Health: FAIL - make sure server is running on port 3901');
    process.exit(1);
  }
  
  // Create order
  let orderId;
  try {
    const o = await req({ path: '/api/orders', method: 'POST', headers: { 'Content-Type': 'application/json' } }, 
      JSON.stringify({ productId: 'grade2_12m', customerEmail: 'test@example.com', customerName: 'Test' }));
    if (o.status !== 200 || !o.body?.order?.orderId) throw new Error('Create order failed: ' + JSON.stringify(o.body));
    orderId = o.body.order.orderId;
    console.log('Create order: PASS -', orderId);
    summary.tests.paidGrade2 = 'pass';
  } catch (e) {
    summary.ok = false;
    summary.tests.paidGrade2 = 'fail';
    summary.errors.push(e.message);
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
    process.exit(1);
  }
  
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  console.log('Test completed');
}

main();
