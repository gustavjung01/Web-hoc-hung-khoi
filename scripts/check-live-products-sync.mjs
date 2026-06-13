#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const SOURCE_PRODUCTS = path.resolve('server/data/products.json');
const SOURCE_INDEX = path.resolve('server/index.js');
const LIVE_PRODUCTS = process.env.LIVE_PRODUCTS_PATH || '/opt/hochungkhoi-backend/data/products.json';
const LIVE_INDEX = process.env.LIVE_INDEX_PATH || '/opt/hochungkhoi-backend/index.js';

const requiredProducts = [
  {
    id: 'grade6_12m',
    name: 'Lớp 06',
    appId: 'app-lop-06',
    appUrl: 'https://app.hochungkhoi.site/lop-06/',
  },
  {
    id: 'grade7_12m',
    name: 'Lớp 07',
    appId: 'app-lop-07',
    appUrl: 'https://app.hochungkhoi.site/lop-07/',
  },
];

const requiredIndexSnippets = [
  "'grade6_12m': 'https://app.hochungkhoi.site/lop-06/'",
  "'grade7_12m': 'https://app.hochungkhoi.site/lop-07/'",
  "if (gradeIds.length === 1 && gradeIds[0] === 6) return 'app-lop-06';",
  "if (gradeIds.length === 1 && gradeIds[0] === 7) return 'app-lop-07';",
  "if (['app-lop-06', 'lop-06', 'grade6', 'grade6_12m'].includes(value)) return 'app-lop-06';",
  "if (['app-lop-07', 'lop-07', 'grade7', 'grade7_12m'].includes(value)) return 'app-lop-07';",
];

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    throw new Error(`Không đọc được file: ${filePath}`);
  }
}

function readProducts(filePath) {
  const raw = readText(filePath);
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.products)) {
      throw new Error('products không phải array');
    }
    return data.products;
  } catch (error) {
    throw new Error(`File products.json lỗi JSON hoặc sai cấu trúc: ${filePath}`);
  }
}

function checkProducts(filePath, label) {
  const products = readProducts(filePath);
  const errors = [];

  for (const expected of requiredProducts) {
    const product = products.find((item) => item.id === expected.id);
    if (!product) {
      errors.push(`${label}: thiếu product ${expected.id}`);
      continue;
    }
    for (const [key, value] of Object.entries(expected)) {
      if (product[key] !== value) {
        errors.push(`${label}: ${expected.id}.${key} phải là ${value}, hiện là ${product[key]}`);
      }
    }
    if (product.isActive !== true) {
      errors.push(`${label}: ${expected.id}.isActive phải là true`);
    }
  }

  return errors;
}

function checkIndex(filePath, label) {
  const source = readText(filePath);
  return requiredIndexSnippets
    .filter((snippet) => !source.includes(snippet))
    .map((snippet) => `${label}: thiếu mapping trong index.js: ${snippet}`);
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const shouldSync = process.argv.includes('--sync-live');
let errors = [];

errors.push(...checkProducts(SOURCE_PRODUCTS, 'source products.json'));
errors.push(...checkIndex(SOURCE_INDEX, 'source index.js'));

if (fs.existsSync(LIVE_PRODUCTS)) {
  errors.push(...checkProducts(LIVE_PRODUCTS, 'live products.json'));
} else {
  errors.push(`live products.json: chưa tồn tại ở ${LIVE_PRODUCTS}`);
}

if (fs.existsSync(LIVE_INDEX)) {
  errors.push(...checkIndex(LIVE_INDEX, 'live index.js'));
} else {
  errors.push(`live index.js: chưa tồn tại ở ${LIVE_INDEX}`);
}

if (errors.length && shouldSync) {
  copyFile(SOURCE_PRODUCTS, LIVE_PRODUCTS);
  copyFile(SOURCE_INDEX, LIVE_INDEX);
  errors = [];
  errors.push(...checkProducts(LIVE_PRODUCTS, 'live products.json sau sync'));
  errors.push(...checkIndex(LIVE_INDEX, 'live index.js sau sync'));
}

if (errors.length) {
  console.error('CHECK FAILED:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  console.error('\nMuốn sync từ repo source sang backend live, chạy:');
  console.error('sudo LIVE_PRODUCTS_PATH=/opt/hochungkhoi-backend/data/products.json LIVE_INDEX_PATH=/opt/hochungkhoi-backend/index.js node scripts/check-live-products-sync.mjs --sync-live');
  process.exit(1);
}

console.log('OK: source/live products + index đều có Lớp 06, Lớp 07 và mapping app đúng.');
console.log(`Source products: ${SOURCE_PRODUCTS}`);
console.log(`Live products:   ${LIVE_PRODUCTS}`);
console.log(`Live index:      ${LIVE_INDEX}`);
