import { sendPaidOrderEmail, getEmailConfig, getEmailStats } from './emailService.js';

const TEST_EMAIL = 'khuongbinh.info@gmail.com';

console.log('=== EMAIL COVER/BRAND TEST ===');
console.log('To:', TEST_EMAIL);
console.log('Config:', getEmailConfig());
console.log('');

const testOrder = {
  orderId: 'ord_cover_test_' + Date.now(),
  productName: 'Lớp Lá + Lớp 01',
  amount: 299000,
  customerEmail: TEST_EMAIL,
  selectedGrades: []
};

const testLicense = {
  licenseKey: 'HHK7-XK9P-M2NQ-VB4W',
  appId: 'app-cap-01',
  startDate: new Date().toISOString(),
  expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
};

const testProduct = {
  name: 'Lớp Lá + Lớp 01',
  id: 'leaf_grade1_12m'
};

console.log('1. FIRST SEND:');
const r1 = await sendPaidOrderEmail({
  to: TEST_EMAIL,
  order: testOrder,
  license: testLicense,
  product: testProduct
});

console.log('   Status:', r1.ok ? 'OK' : 'FAILED');
console.log('   Mode:', r1.mode);
console.log('   Provider:', r1.provider || 'N/A');

console.log('');
console.log('2. DUPLICATE:');
const r2 = await sendPaidOrderEmail({
  to: TEST_EMAIL,
  order: testOrder,
  license: testLicense,
  product: testProduct
});
console.log('   Skipped:', r2.skipped ? 'YES' : 'NO');

console.log('');
console.log('=== TEST COMPLETE ===');
console.log('Check inbox for:');
console.log('- Subject: Học Hứng Khởi - Mã kích hoạt gói học của bạn');
console.log('- Cover image at top');
console.log('- Full license key in email body');
console.log('Check log has masked key only');
