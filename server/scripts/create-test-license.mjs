/**
 * Internal Test License Creation Script
 * Usage: node server/scripts/create-test-license.mjs
 * 
 * Creates a test license for QA purposes only.
 * - No public endpoint
 * - No email sent by default
 * - Key printed once to terminal (do not commit logs)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const LICENSES_FILE = path.join(DATA_DIR, 'licenses.json');

// Test license config
const TEST_LICENSE = {
  email: 'gustavjung01@gmail.com',
  productId: 'leaf_grade1_12m',
  productName: 'Lớp Lá + Lớp 1',
  appId: 'app-cap-01',
  selectedGrades: [0, 1],
  allowedGrades: [0, 1],
  durationMonths: 12,
  deviceLimit: 2
};

function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = 4;
  const segmentLength = 4;
  let key = 'HHK-';
  for (let s = 0; s < segments; s++) {
    for (let i = 0; i < segmentLength; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (s < segments - 1) key += '-';
  }
  return key;
}

function getExpiryDate(months) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

function loadLicenses() {
  try {
    const data = fs.readFileSync(LICENSES_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.licenses || parsed || [];
  } catch (e) {
    console.log('No existing licenses file or empty, starting fresh');
    return [];
  }
}

function saveLicenses(licenses) {
  // Backup existing file
  if (fs.existsSync(LICENSES_FILE)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFile = path.join(DATA_DIR, `licenses.json.bak-${timestamp}`);
    fs.copyFileSync(LICENSES_FILE, backupFile);
    console.log(`Backup created: ${backupFile}`);
  }
  
  // Save with proper structure
  const data = { licenses };
  fs.writeFileSync(LICENSES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function createTestLicense() {
  const now = new Date().toISOString();
  const licenseKey = generateLicenseKey();
  
  const license = {
    licenseKey,
    orderId: `TEST-${Date.now()}`,
    productId: TEST_LICENSE.productId,
    productName: TEST_LICENSE.productName,
    appId: TEST_LICENSE.appId,
    customerEmail: TEST_LICENSE.email,
    allowedGrades: TEST_LICENSE.allowedGrades,
    selectedGrades: TEST_LICENSE.selectedGrades,
    status: 'active',
    startDate: now,
    expiryDate: getExpiryDate(TEST_LICENSE.durationMonths),
    expiresAt: getExpiryDate(TEST_LICENSE.durationMonths),
    deviceLimit: TEST_LICENSE.deviceLimit,
    createdAt: now,
    updatedAt: now,
    activations: []
  };
  
  return license;
}

// Main
console.log('=== Creating Test License ===\n');

const licenses = loadLicenses();
const newLicense = createTestLicense();

// Check for duplicate key
const existing = licenses.find(l => l.licenseKey === newLicense.licenseKey);
if (existing) {
  console.error('ERROR: Generated key already exists, please run again');
  process.exit(1);
}

licenses.push(newLicense);
saveLicenses(licenses);

console.log('✅ Test license created successfully\n');
console.log('--- METADATA (safe to log) ---');
console.log(`Email: ${newLicense.customerEmail}`);
console.log(`Product ID: ${newLicense.productId}`);
console.log(`Product Name: ${newLicense.productName}`);
console.log(`App ID: ${newLicense.appId}`);
console.log(`Allowed Grades: ${newLicense.allowedGrades.join(', ')}`);
console.log(`Status: ${newLicense.status}`);
console.log(`Expires: ${newLicense.expiresAt}`);
console.log(`Device Limit: ${newLicense.deviceLimit}`);
console.log('');
console.log('--- FULL KEY (USE ONCE, DO NOT COMMIT LOG) ---');
console.log(`License Key: ${newLicense.licenseKey}`);
console.log('');
console.log('--- MASKED KEY (for reports) ---');
console.log(`Key: ${newLicense.licenseKey.substring(0, 4)}-****-****-${newLicense.licenseKey.slice(-4)}`);
console.log('');
console.log('Next steps:');
console.log('1. Copy the FULL KEY above for QA testing');
console.log('2. Test verify API: POST /api/licenses/verify');
console.log('3. Test activate API: POST /api/licenses/activate');
console.log('4. DO NOT commit this log or the full key');
