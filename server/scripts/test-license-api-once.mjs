/**
 * Test License API Script
 * Usage: node server/scripts/test-license-api-once.mjs [licenseKey]
 * 
 * Tests backend verify/activate endpoints.
 * No full key in output, only status/masked.
 */

import https from 'https';
import http from 'http';

const API_BASE = 'hochungkhoi.site';
const TEST_EMAIL = 'gustavjung01@gmail.com';
const TEST_DEVICE_ID = 'qa-test-' + Date.now();

// Get license key from arg or use placeholder
const licenseKey = process.argv[2] || 'HHK7-TEST-TEST';

function makeRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_BASE,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function isJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

async function testVerify() {
  console.log('\n=== Testing POST /api/licenses/verify ===');
  
  try {
    const response = await makeRequest('/api/licenses/verify', 'POST', {
      licenseKey: licenseKey,
      customerEmail: TEST_EMAIL,
      deviceId: TEST_DEVICE_ID,
      deviceName: 'QA Test Device'
    });

    console.log(`HTTP Status: ${response.statusCode}`);
    console.log(`Content-Type: ${response.headers['content-type'] || 'N/A'}`);
    
    if (response.statusCode === 404) {
      console.log('❌ FAIL: Endpoint not found (404)');
      console.log('Response:', response.body.substring(0, 200));
      return false;
    }
    
    if (isJson(response.body)) {
      const data = JSON.parse(response.body);
      console.log('✅ PASS: Returns JSON');
      console.log('Response keys:', Object.keys(data).join(', '));
      
      if (data.ok) {
        console.log('✅ License valid');
        if (data.entitlement?.productId) {
          console.log(`Product: ${data.entitlement.productId}`);
        }
        if (data.entitlement?.allowedGrades) {
          console.log(`Grades: ${data.entitlement.allowedGrades.join(', ')}`);
        }
      } else {
        console.log(`⚠️  License check result: ${data.status || data.error || 'unknown'}`);
      }
      return true;
    } else {
      console.log('❌ FAIL: Returns HTML or non-JSON');
      console.log('Preview:', response.body.substring(0, 150));
      return false;
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
    return false;
  }
}

async function testActivate() {
  console.log('\n=== Testing POST /api/licenses/activate ===');
  
  try {
    const response = await makeRequest('/api/licenses/activate', 'POST', {
      licenseKey: licenseKey,
      customerEmail: TEST_EMAIL,
      deviceId: TEST_DEVICE_ID,
      deviceName: 'QA Test Device',
      appId: 'app-cap-01'
    });

    console.log(`HTTP Status: ${response.statusCode}`);
    console.log(`Content-Type: ${response.headers['content-type'] || 'N/A'}`);
    
    if (response.statusCode === 404) {
      console.log('❌ FAIL: Endpoint not found (404)');
      console.log('Response:', response.body.substring(0, 200));
      return false;
    }
    
    if (isJson(response.body)) {
      const data = JSON.parse(response.body);
      console.log('✅ PASS: Returns JSON');
      console.log('Response keys:', Object.keys(data).join(', '));
      
      if (data.ok) {
        console.log('✅ Activation successful');
        if (data.entitlement?.productId) {
          console.log(`Product: ${data.entitlement.productId}`);
        }
        if (data.entitlement?.allowedGrades) {
          console.log(`Grades: ${data.entitlement.allowedGrades.join(', ')}`);
        }
      } else {
        console.log(`⚠️  Activation result: ${data.status || data.error || 'unknown'}`);
        if (data.status === 'device_limit_exceeded') {
          console.log('   Device limit reached - key already used on other devices');
        }
      }
      return true;
    } else {
      console.log('❌ FAIL: Returns HTML or non-JSON');
      console.log('Preview:', response.body.substring(0, 150));
      return false;
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
    return false;
  }
}

// Main
console.log('=== License API Test ===');
console.log(`Testing with key: ${licenseKey.substring(0, 4)}-****-****-${licenseKey.slice(-4)}`);
console.log(`Email: ${TEST_EMAIL}`);
console.log(`Device: ${TEST_DEVICE_ID}`);

const verifyOk = await testVerify();
const activateOk = await testActivate();

console.log('\n=== Summary ===');
console.log(`Verify API: ${verifyOk ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Activate API: ${activateOk ? '✅ PASS' : '❌ FAIL'}`);

process.exit(verifyOk && activateOk ? 0 : 1);
