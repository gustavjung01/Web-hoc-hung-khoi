import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'src/HomePage.tsx';
let source = readFileSync(filePath, 'utf8');
let changed = false;

function replaceOnce(label, oldText, newText) {
  if (source.includes(newText)) {
    console.log(`OK: ${label} already patched.`);
    return;
  }

  if (!source.includes(oldText)) {
    throw new Error(`Không tìm thấy block cũ cho: ${label}. Dừng để tránh sửa sai.`);
  }

  source = source.replace(oldText, newText);
  changed = true;
  console.log(`OK: patched ${label}.`);
}

replaceOnce(
  'map Lớp 6 card to grade6_12m',
  `    hasWebApp: true,
    hasDesktop: true,
    link: 'https://app.hochungkhoi.site/lop-06/',
  },`,
  `    hasWebApp: true,
    hasDesktop: true,
    link: 'https://app.hochungkhoi.site/lop-06/',
    productId: 'grade6_12m',
  },`,
);

if (!source.includes("id: 'grade6_12m'")) {
  const grade7ProductMarker = `  {
    id: 'grade7_12m',`;

  if (!source.includes(grade7ProductMarker)) {
    throw new Error('Không tìm thấy marker product Lớp 7 để chèn product Lớp 6.');
  }

  const grade6Product = `  {
    id: 'grade6_12m',
    name: 'Lớp 06',
    description: 'Gói học tập cho học sinh Lớp 6, thời hạn 12 tháng',
    price: 349000,
    originalPrice: 399000,
    currency: 'VND',
    billingCycle: 'yearly',
    durationMonths: 12,
    gradeIds: [6],
    gradeNames: ['Lớp 6'],
    maxGrades: 1,
    features: [
      'Truy cập đầy đủ nội dung Lớp 6',
      'Giọng đọc tiêu chuẩn',
      'Luyện tập không giới hạn',
      'Theo dõi tiến độ học tập',
      'Hỗ trợ kỹ thuật qua Zalo',
    ],
    targetAudience: 'Học sinh lớp 6',
    isActive: true,
    sortOrder: 6,
    badge: null,
  },
`;

  source = source.replace(grade7ProductMarker, `${grade6Product}${grade7ProductMarker}`);
  changed = true;
  console.log('OK: inserted grade6_12m into frontend PRODUCT_CATALOG.');
} else {
  console.log('OK: grade6_12m already exists in frontend PRODUCT_CATALOG.');
}

replaceOnce(
  'direct app card purchase flow',
  `                      onClick={() => {
                        const cardProduct = app.productId ? PRODUCT_CATALOG.find((product) => product.id === app.productId) : null;
                        if (cardProduct) {
                          setCheckoutOrigin('catalog');
                          handlePurchaseCatalogProduct(cardProduct);
                          return;
                        }
                        setView('product-catalog');
                      }}`,
  `                      onClick={() => {
                        const gradeNumber = Number(String(app.classCode || '').replace(/\\D/g, ''));
                        const cardProduct =
                          (app.productId ? PRODUCT_CATALOG.find((product) => product.id === app.productId) : null) ||
                          PRODUCT_CATALOG.find((product) => product.isActive && Array.isArray(product.gradeIds) && product.gradeIds.includes(gradeNumber));

                        if (!cardProduct) {
                          alert('Sản phẩm lớp này chưa được mở bán.');
                          return;
                        }

                        setCheckoutOrigin('catalog');
                        handlePurchaseCatalogProduct(cardProduct);
                      }}`,
);

if (changed) {
  writeFileSync(filePath, source, 'utf8');
  console.log('OK: src/HomePage.tsx patched for direct app card purchase.');
} else {
  console.log('OK: no changes needed.');
}
