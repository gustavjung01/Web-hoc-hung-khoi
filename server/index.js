/**
 * Học Chung Khởi Backend API
 * Product Catalog + Order + License Management
 * For hochungkhoi.site
 */

import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clerk JWT verification via JWKS endpoint
// CLERK_SECRET_KEY used to distinguish test vs live instance from key prefix
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || '';
const CLERK_JWKS_URL = process.env.CLERK_JWKS_URL ||
  (CLERK_SECRET_KEY.startsWith('sk_live_')
    ? 'https://api.clerk.com/v1/jwks'
    : CLERK_SECRET_KEY.startsWith('sk_test_')
    ? 'https://api.clerk.com/v1/jwks'
    : 'https://api.clerk.com/v1/jwks');

if (CLERK_SECRET_KEY) {
  console.log(`[Clerk] JWT verification enabled (${CLERK_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST'} mode)`);
} else {
  console.warn('[Clerk] WARNING: CLERK_SECRET_KEY not set â€” token verification limited to format only');
}

// In-memory JWKS cache (refetched every 10 minutes)
let _jwksCache = null;
let _jwksCacheTime = 0;
const JWKS_CACHE_TTL = 10 * 60 * 1000;

async function getJwks() {
  if (_jwksCache && (Date.now() - _jwksCacheTime) < JWKS_CACHE_TTL) {
    return _jwksCache;
  }
  try {
    const res = await fetch(CLERK_JWKS_URL, {
      headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
    });
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    _jwksCache = await res.json();
    _jwksCacheTime = Date.now();
    return _jwksCache;
  } catch (err) {
    console.error('[Clerk JWKS] Fetch error:', err.message);
    return null;
  }
}

async function verifyClerkToken(token) {
  // Split and validate JWT structure
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [headerB64, payloadB64, sigB64] = parts;

  // Decode header to get kid
  let header;
  try {
    const headerJson = Buffer.from(headerB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    header = JSON.parse(headerJson);
  } catch {
    throw new Error('Invalid token header');
  }

  if (!header.kid) throw new Error('Token missing kid');
  if (!header.alg || !['RS256', 'RS384', 'RS512'].includes(header.alg)) {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  // Fetch JWKS and find matching key
  const jwks = await getJwks();
  if (!jwks) throw new Error('Could not fetch JWKS');

  const key = (jwks.keys || []).find(k => k.kid === header.kid);
  if (!key) throw new Error(`Key ${header.kid} not found in JWKS`);

  // Import public key from JWK (n/e) â€” Clerk Production JWKS does not include x5c
  const pubKey = await crypto.subtle.importKey(
    'jwk',
    { kty: key.kty, n: key.n, e: key.e, alg: key.alg || 'RS256', use: 'sig' },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // Verify signature
  const sig = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const signedData = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');

  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    pubKey,
    sig,
    signedData
  );
  if (!valid) throw new Error('Signature verification failed');

  // Decode and return payload
  const payloadJson = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(payloadJson);
}

// Import email service (test-log-only mode)
import { sendPaidOrderEmail, isEmailAlreadyLogged } from './emailService.js';

// CORS for App Cáº¥p 01 and local dev
const CORS_ORIGINS = [
  'https://app.hochungkhoi.site',
  'https://hochungkhoi.site',
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

const app = express();
const PORT = process.env.PORT || 3001;

// CORS middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    for (const allowed of CORS_ORIGINS) {
      if (allowed instanceof RegExp && allowed.test(origin)) {
        return callback(null, true);
      }
      if (typeof allowed === 'string' && allowed === origin) {
        return callback(null, true);
      }
    }
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-License-Key', 'x-license-key', 'X-Dopi-Key', 'x-dopi-key', 'x-ai-app-profile'],
  credentials: true,
}));

// Config from env
const SEPAY_WEBHOOK_SECRET = process.env.SEPAY_WEBHOOK_SECRET;

// AI Assistant Config from env
const AI_ENABLED = /^(true|1|yes)$/i.test(process.env.AI_ENABLED);
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai_compatible';
const AI_BASE_URL = process.env.AI_BASE_URL;
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL_FAST = process.env.AI_MODEL_FAST || 'claude-haiku-4-5';
const AI_MODEL_MAIN = process.env.AI_MODEL_MAIN || 'claude-sonnet-4-7';
const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS, 10) || 30000;
const AI_MAX_TOKENS_SALES = parseInt(process.env.AI_MAX_TOKENS_SALES, 10) || 300;
const AI_MAX_TOKENS_EXPLAIN = parseInt(process.env.AI_MAX_TOKENS_EXPLAIN, 10) || 500;
const AI_MAX_TOKENS_LESSON = parseInt(process.env.AI_MAX_TOKENS_LESSON, 10) || 700;
const AI_MAX_TOKENS_PRACTICE = parseInt(process.env.AI_MAX_TOKENS_PRACTICE, 10) || 900;
const AI_MAX_USER_CHARS = parseInt(process.env.AI_MAX_USER_CHARS, 10) || 1000;
const AI_MAX_HISTORY_MESSAGES = parseInt(process.env.AI_MAX_HISTORY_MESSAGES, 10) || 6;
const AI_SEND_EMPTY_TOOLS = /^(true|1|yes)$/i.test(process.env.AI_SEND_EMPTY_TOOLS);

if (AI_ENABLED) {
  console.log(`[AI] AI Assistant enabled (Provider: ${AI_PROVIDER})`);
  if (!AI_BASE_URL || !AI_API_KEY) {
    console.error('[AI] CRITICAL: AI_BASE_URL or AI_API_KEY is not configured. AI will not function.');
  }
} else {
  console.log('[AI] AI Assistant is disabled.');
}

const DATA_DIR = path.join(__dirname, 'data');
const WEBHOOK_LOG_FILE = path.join(DATA_DIR, 'webhook-events.jsonl');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const LICENSES_FILE = path.join(DATA_DIR, 'licenses.json');
const ACTIVATIONS_FILE = path.join(DATA_DIR, 'activations.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const AI_CAPACITY_WALLETS_FILE = path.join(DATA_DIR, 'ai-capacity-wallets.json');
const DOPI_RECHARGE_KEYS_FILE = path.join(DATA_DIR, 'dopi-recharge-keys.json');
const AI_PROVIDERS_FILE = path.join(DATA_DIR, 'ai-providers.json');
const WEB_SUPPORT_CONFIG_FILE = path.join(DATA_DIR, 'web-support-config.json');
const WEB_SUPPORT_LOG_FILE = path.join(DATA_DIR, 'web-support-logs.jsonl');

function getDefaultAiPricingConfig() {
  return {
    enabled: true,
    dopiValueVnd: 100,
    tasks: {
      chat: { inputPer1k: 1.0, outputPer1k: 1.0, multiplier: 1.0 },
      explain_lesson: { inputPer1k: 1.25, outputPer1k: 1.45, multiplier: 1.15 },
      generate_practice: { inputPer1k: 1.3, outputPer1k: 1.6, multiplier: 1.2 },
      deep_search: { inputPer1k: 1.6, outputPer1k: 2.1, multiplier: 1.8 },
    }
  };
}

function getDefaultAiProvidersConfig() {
  return {
    activeProvider: 'claude',
    providers: {
      claude: {
        name: 'Claude (AI Prime Tech)',
        baseUrl: '',
        authToken: '',
        model: 'claude-3-haiku-20240307',
        enabled: true
      },
      gemini: {
        name: 'Google Gemini (Direct)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: '',
        model: 'gemini-2.0-flash',
        enabled: false
      },
      vertex: {
        name: 'Google Vertex AI',
        projectId: '',
        location: 'us-central1',
        credentialsJson: '',
        model: 'gemini-2.0-flash',
        enabled: false
      },
      dialogflow_cx: {
        name: 'Google Chat / Dopi Gia Su',
        baseUrl: 'https://dialogflow.googleapis.com/v3',
        projectId: 'web-hochungkhoi-chatbot',
        location: 'global',
        credentialsJson: '',
        model: '79129181-d156-4071-8bde-e8088f849e91',
        languageCode: 'vi',
        enabled: false
      },
      google_agent_search: {
        name: 'Google Search / Sales Bot',
        baseUrl: 'https://discoveryengine.googleapis.com/v1',
        projectId: 'web-hochungkhoi-chatbot',
        location: 'global',
        credentialsJson: '',
        model: 'hoc-chung-khoi-tu-van_1780386592569',
        servingConfigId: 'default_serving_config',
        enabled: false
      }
    },
    pricing: getDefaultAiPricingConfig(),
  };
}

function migrateAiProvidersConfig(data) {
  const defaults = getDefaultAiProvidersConfig();
  const source = data && typeof data === 'object' ? data : {};
  const sourceProviders = source.providers && typeof source.providers === 'object' ? source.providers : {};
  const providers = {
    ...defaults.providers,
    ...sourceProviders,
  };

  if (sourceProviders.vertex_agent && !sourceProviders.google_agent_search) {
    const legacy = sourceProviders.vertex_agent || {};
    providers.google_agent_search = {
      ...defaults.providers.google_agent_search,
      ...legacy,
      name: defaults.providers.google_agent_search.name,
      baseUrl: String(legacy.baseUrl || defaults.providers.google_agent_search.baseUrl || '').trim() || defaults.providers.google_agent_search.baseUrl,
      projectId: String(legacy.projectId || defaults.providers.google_agent_search.projectId || '').trim() || defaults.providers.google_agent_search.projectId,
      location: String(legacy.location || defaults.providers.google_agent_search.location || '').trim() || defaults.providers.google_agent_search.location,
      credentialsJson: String(legacy.credentialsJson || '').trim(),
      model: String(legacy.model || '').trim() || defaults.providers.google_agent_search.model,
      servingConfigId: String(legacy.servingConfigId || '').trim() || defaults.providers.google_agent_search.servingConfigId,
      enabled: Boolean(legacy.enabled),
    };
  }

  delete providers.vertex_agent;

  return {
    ...defaults,
    ...source,
    activeProvider: source.activeProvider === 'vertex_agent' ? 'google_agent_search' : (source.activeProvider || defaults.activeProvider),
    providers,
    pricing: normalizeAiPricingConfig(source.pricing || defaults.pricing, defaults.pricing),
  };
}

const SYSTEM_AI_CREDIT_PRODUCTS = [
  {
    id: 'ai_credit_trial',
    name: 'Trải nghiệm',
    description: 'Gói Dopi AI nhỏ cho nhu cầu dùng thử.',
    sortOrder: 10,
    badge: 'Trải nghiệm',
  },
  {
    id: 'ai_credit_basic',
    name: 'Cơ bản',
    description: 'Gói Dopi AI cân bằng cho nhu cầu học thường xuyên.',
    sortOrder: 11,
    badge: 'Cơ bản',
  },
  {
    id: 'ai_credit_saver',
    name: 'Siêu tiết kiệm',
    description: 'Gói Dopi AI tiết kiệm cho nhu cầu dùng nhiều hơn.',
    sortOrder: 12,
    badge: 'Siêu tiết kiệm',
  },
];

const SYSTEM_AI_CREDIT_PRODUCT_IDS = new Set(SYSTEM_AI_CREDIT_PRODUCTS.map((product) => product.id));

function normalizeSystemAiCreditProductId(productId) {
  const raw = String(productId || '').trim().toLowerCase();
  if (!raw) return '';
  if (SYSTEM_AI_CREDIT_PRODUCT_IDS.has(raw)) return raw;

  const compact = raw
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (SYSTEM_AI_CREDIT_PRODUCT_IDS.has(compact)) return compact;

  const legacyAliasMap = {
    'ai_credit_50': 'ai_credit_trial',
    'ai credit 50': 'ai_credit_trial',
    '50': 'ai_credit_trial',
    'ai_credit_80': 'ai_credit_trial',
    'ai credit 80': 'ai_credit_trial',
    '80': 'ai_credit_trial',
    'ai_credit_120': 'ai_credit_basic',
    'ai credit 120': 'ai_credit_basic',
    '120': 'ai_credit_basic',
    'ai_credit_180': 'ai_credit_basic',
    'ai credit 180': 'ai_credit_basic',
    '180': 'ai_credit_basic',
    'ai_credit_300': 'ai_credit_saver',
    'ai credit 300': 'ai_credit_saver',
    '300': 'ai_credit_saver',
    'ai_credit_400': 'ai_credit_saver',
    'ai credit 400': 'ai_credit_saver',
    '400': 'ai_credit_saver',
    'ai_credit_900': 'ai_credit_saver',
    'ai credit 900': 'ai_credit_saver',
    '900': 'ai_credit_saver',
  };
  if (legacyAliasMap[raw]) return legacyAliasMap[raw];

  return raw;
}

function isSystemAiCreditProductId(productId) {
  return SYSTEM_AI_CREDIT_PRODUCT_IDS.has(normalizeSystemAiCreditProductId(productId));
}

function getSystemAiCreditProductPreset(productId) {
  const normalizedProductId = normalizeSystemAiCreditProductId(productId);
  return SYSTEM_AI_CREDIT_PRODUCTS.find((product) => product.id === normalizedProductId) || null;
}

function getCurrentDopiValueVnd() {
  const aiConfig = loadAiProviders();
  const pricing = normalizeAiPricingConfig(aiConfig.pricing || getDefaultAiPricingConfig(), getDefaultAiPricingConfig());
  const dopiValueVnd = Number(pricing.dopiValueVnd);
  return Number.isFinite(dopiValueVnd) && dopiValueVnd > 0 ? dopiValueVnd : 100;
}

function deriveAiCreditUnitsFromPrice(price, dopiValueVnd = getCurrentDopiValueVnd()) {
  const parsedPrice = Number(price);
  const parsedDopiValue = Number(dopiValueVnd);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return 0;
  const unit = Number.isFinite(parsedDopiValue) && parsedDopiValue > 0 ? parsedDopiValue : 100;
  return Math.max(1, Math.round(parsedPrice / unit));
}

function normalizeAiCreditProductRecord(product, preset) {
  const fallbackPreset = preset || null;
  const price = Number(product?.price);
  const originalPrice = Number(product?.originalPrice);
  const basePrice = Number.isFinite(originalPrice) && originalPrice > 0
    ? originalPrice
    : (Number.isFinite(price) && price > 0 ? price : 0);

  return {
    id: fallbackPreset?.id || String(product?.id || '').trim(),
    name: fallbackPreset?.name || String(product?.name || '').trim(),
    description: String(product?.description || fallbackPreset?.description || '').trim(),
    price: Number.isFinite(price) ? price : 0,
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : (Number.isFinite(price) ? price : 0),
    currency: 'VND',
    type: 'ai_credit',
    credits: deriveAiCreditUnitsFromPrice(basePrice),
    features: Array.isArray(product?.features) ? product.features : [],
    isActive: product?.isActive !== undefined ? Boolean(product.isActive) : true,
    sortOrder: Number.isFinite(Number(product?.sortOrder))
      ? Number(product.sortOrder)
      : (fallbackPreset?.sortOrder || 0),
    badge: product?.badge !== undefined ? (product.badge ? String(product.badge).trim() : null) : (fallbackPreset?.badge || null),
    createdAt: product?.createdAt || null,
    updatedAt: product?.updatedAt || null,
  };
}

function normalizeAiCreditProducts(products) {
  return SYSTEM_AI_CREDIT_PRODUCTS.map((preset) => {
    const existing = Array.isArray(products)
      ? products.find((product) => normalizeSystemAiCreditProductId(product.id || product.productId) === preset.id)
      : null;
    return normalizeAiCreditProductRecord(existing || preset, preset);
  });
}

function migrateAiCreditProductCatalog(data) {
  if (!data || !Array.isArray(data.products)) {
    return { data: data || { products: [] }, changed: false };
  }

  let changed = false;
  const nextProducts = data.products.map((product) => {
    const normalizedId = normalizeSystemAiCreditProductId(product?.id || product?.productId);
    const preset = getSystemAiCreditProductPreset(normalizedId);
    if (!preset) return product;

    const migrated = normalizeAiCreditProductRecord({
      ...product,
      id: normalizedId,
      type: 'ai_credit',
    }, preset);

    const originalId = String(product?.id || product?.productId || '').trim();
    if (
      product?.type !== 'ai_credit'
      || originalId !== normalizedId
      || String(product?.name || '').trim() !== migrated.name
      || Number(product?.credits) !== Number(migrated.credits)
      || Number(product?.price) !== Number(migrated.price)
      || Number(product?.originalPrice) !== Number(migrated.originalPrice)
      || String(product?.currency || '').trim().toUpperCase() !== 'VND'
    ) {
      changed = true;
    }

    return migrated;
  });

  if (changed) {
    data.products = nextProducts;
    try {
      writeJson(PRODUCTS_FILE, data);
    } catch (err) {
      console.error('[Products] Failed to migrate AI credit catalog:', err);
    }
  }

  return { data, changed };
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files if not exist
function initDataFile(filePath, defaultData = {}) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}
initDataFile(ORDERS_FILE, { orders: [] });
initDataFile(LICENSES_FILE, { licenses: [] });
initDataFile(ACTIVATIONS_FILE, { activations: [] });
initDataFile(AI_CAPACITY_WALLETS_FILE, { wallets: [], transactions: [] });
initDataFile(DOPI_RECHARGE_KEYS_FILE, { keys: [] });
initDataFile(AI_PROVIDERS_FILE, getDefaultAiProvidersConfig());
initDataFile(WEB_SUPPORT_CONFIG_FILE, getDefaultWebSupportConfig());

// Raw body parser for webhook verification (must be before express.json())
const rawBodySaver = (req, res, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
};

// Parse JSON but keep raw body for HMAC verification
app.use(express.json({ verify: rawBodySaver }));

// ===== DATA ACCESS HELPERS =====

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadProducts() {
  const data = readJson(PRODUCTS_FILE);
  const migrated = migrateAiCreditProductCatalog(data);
  return migrated.data?.products || [];
}

function loadProductsData() {
  const data = readJson(PRODUCTS_FILE);
  return migrateAiCreditProductCatalog(data).data;
}

function loadOrders() {
  const data = readJson(ORDERS_FILE);
  return data?.orders || [];
}

function saveOrders(orders) {
  writeJson(ORDERS_FILE, { orders });
}

function loadLicenses() {
  const data = readJson(LICENSES_FILE);
  return data?.licenses || [];
}

function saveLicenses(licenses) {
  writeJson(LICENSES_FILE, { licenses });
}

function loadActivations() {
  const data = readJson(ACTIVATIONS_FILE);
  return data?.activations || [];
}

function saveActivations(activations) {
  writeJson(ACTIVATIONS_FILE, { activations });
}

function loadAiCapacityWallets() {
  const data = readJson(AI_CAPACITY_WALLETS_FILE);
  return {
    wallets: data?.wallets || [],
    transactions: data?.transactions || []
  };
}

function saveAiCapacityWallets(wallets, transactions) {
  writeJson(AI_CAPACITY_WALLETS_FILE, { wallets, transactions });
}

function normalizeDopiKeyRecord(record = {}) {
  const key = normalizeDopiKey(record.key);
  const customerEmail = String(record.customerEmail || record.ownerEmail || '').toLowerCase().trim();
  const walletIdFromRecord = String(record.walletId || record.customerWalletId || '').trim();
  const walletId = customerEmail
    ? `email:${customerEmail}`
    : (walletIdFromRecord || (record.id ? `dopi:${record.id}` : null));
  const status = String(record.status || '').toLowerCase().trim();

  return {
    ...record,
    key: key || record.key || null,
    walletId,
    ownerEmail: customerEmail || null,
    customerEmail: customerEmail || null,
    customerWalletId: String(record.customerWalletId || '').trim() || walletId || null,
    redeemedByWalletId: String(record.redeemedByWalletId || '').trim() || null,
    remainingDopi: Number.isFinite(Number(record.remainingDopi)) ? Math.max(0, Math.floor(Number(record.remainingDopi))) : null,
    spentDopi: Number.isFinite(Number(record.spentDopi)) ? Math.max(0, Math.floor(Number(record.spentDopi))) : null,
    status: status === 'void' ? 'void' : 'active',
  };
}

function loadDopiRechargeKeys() {
  const data = readJson(DOPI_RECHARGE_KEYS_FILE);
  return (data?.keys || []).map(normalizeDopiKeyRecord);
}

function saveDopiRechargeKeys(keys) {
  writeJson(DOPI_RECHARGE_KEYS_FILE, { keys: (Array.isArray(keys) ? keys : []).map(normalizeDopiKeyRecord) });
}

function findDopiKeyRecordByKey(inputKey) {
  const normalizedKey = normalizeDopiKey(inputKey);
  if (!normalizedKey) {
    return null;
  }

  return loadDopiRechargeKeys().find((record) => normalizeDopiKey(record.key) === normalizedKey) || null;
}

function getDopiKeyTotalAmount(keyRecord) {
  const total = Number(keyRecord?.amountDopi || 0);
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
}

function getDopiKeyRemainingAmount(keyRecord) {
  const total = getDopiKeyTotalAmount(keyRecord);
  const remaining = Number(keyRecord?.remainingDopi);
  if (Number.isFinite(remaining)) {
    return Math.max(0, Math.min(total, Math.floor(remaining)));
  }
  return total;
}

function isDopiKeyOwnedByWallet(keyRecord, walletId, legacyEmail = null) {
  if (!keyRecord) return false;
  const normalizedWalletId = String(walletId || '').trim();
  const normalizedEmail = String(legacyEmail || '').toLowerCase().trim();
  const recordWalletId = String(keyRecord.walletId || keyRecord.customerWalletId || keyRecord.redeemedByWalletId || '').trim();
  const recordEmail = String(keyRecord.ownerEmail || keyRecord.customerEmail || keyRecord.redeemedByEmail || '').toLowerCase().trim();
  const resolvedWalletId = String(resolveDopiWalletId(keyRecord) || '').trim();

  return Boolean(
    (normalizedWalletId && (recordWalletId === normalizedWalletId || resolvedWalletId === normalizedWalletId)) ||
    (normalizedEmail && recordEmail === normalizedEmail)
  );
}

function seedDopiKeyQuotasForWallet(walletId, legacyEmail = null) {
  const normalizedWalletId = String(walletId || '').trim();
  const normalizedEmail = String(legacyEmail || '').toLowerCase().trim();
  if (!normalizedWalletId && !normalizedEmail) {
    return { success: false, reason: 'Missing wallet id' };
  }

  const { wallets } = normalizeAiWalletRecords(...Object.values(loadAiCapacityWallets()));
  const wallet = findAiWallet(wallets, normalizedWalletId, normalizedEmail);
  if (!wallet) {
    return { success: false, reason: 'Wallet not found' };
  }

  const keys = loadDopiRechargeKeys();
  const walletKeys = keys
    .map((record, index) => ({ index, record }))
    .filter(({ record }) => isDopiKeyOwnedByWallet(record, wallet.walletId || normalizedWalletId, wallet.email || normalizedEmail));

  if (walletKeys.length === 0) {
    return { success: true, seeded: false, walletId: wallet.walletId || normalizedWalletId, remaining: 0, totalQuota: 0 };
  }

  const now = new Date().toISOString();
  const totalQuota = walletKeys.reduce((sum, { record }) => sum + getDopiKeyTotalAmount(record), 0);
  let changed = false;
  const nextKeys = [...keys];
  let totalRemaining = 0;

  for (const { index, record } of walletKeys) {
    const totalAmount = getDopiKeyTotalAmount(record);
    const isVoid = String(record.status || '').toLowerCase().trim() === 'void';
    const hasRemaining = Number.isFinite(Number(record.remainingDopi));
    const hasSpent = Number.isFinite(Number(record.spentDopi));
    const remaining = isVoid
      ? 0
      : hasRemaining
        ? Math.max(0, Math.min(totalAmount, Math.floor(Number(record.remainingDopi))))
        : (hasSpent ? Math.max(0, totalAmount - Math.max(0, Math.min(totalAmount, Math.floor(Number(record.spentDopi))))) : totalAmount);
    const spent = isVoid
      ? 0
      : hasSpent
        ? Math.max(0, Math.min(totalAmount, Math.floor(Number(record.spentDopi))))
        : Math.max(0, totalAmount - remaining);
    const nextRecord = normalizeDopiKeyRecord({
      ...keys[index],
      remainingDopi: remaining,
      spentDopi: spent,
      updatedAt: now,
    });

    if (
      Number(nextRecord.remainingDopi) !== Number(keys[index].remainingDopi) ||
      Number(nextRecord.spentDopi) !== Number(keys[index].spentDopi)
    ) {
      changed = true;
    }

    nextKeys[index] = nextRecord;
    totalRemaining += remaining;
  }

  if (changed) {
    saveDopiRechargeKeys(nextKeys);
  }

  return {
    success: true,
    seeded: changed,
    walletId: wallet.walletId || normalizedWalletId,
    remaining: totalRemaining,
    totalQuota,
  };
}

function consumeDopiKeyQuota(inputKey, amountToDeduct, walletId, legacyEmail = null) {
  const normalizedKey = normalizeDopiKey(inputKey);
  const amount = Number(amountToDeduct || 0);
  if (!normalizedKey || !Number.isInteger(amount) || amount <= 0) {
    return { success: false, reason: 'Invalid parameters' };
  }

  const keys = loadDopiRechargeKeys();
  const keyIndex = keys.findIndex((record) => normalizeDopiKey(record.key) === normalizedKey);
  if (keyIndex === -1) {
    return { success: false, reason: 'Dopi key not found' };
  }

  const keyRecord = normalizeDopiKeyRecord(keys[keyIndex]);
  const totalAmount = getDopiKeyTotalAmount(keyRecord);
  const currentRemaining = Number.isFinite(Number(keyRecord.remainingDopi))
    ? Math.max(0, Math.floor(Number(keyRecord.remainingDopi)))
    : totalAmount;

  if (currentRemaining < amount) {
    return { success: false, reason: 'Insufficient key balance', currentBalance: currentRemaining, keyRecord };
  }

  const now = new Date().toISOString();
  const updatedRemaining = currentRemaining - amount;
  keys[keyIndex] = normalizeDopiKeyRecord({
    ...keyRecord,
    remainingDopi: updatedRemaining,
    spentDopi: Math.max(0, totalAmount - updatedRemaining),
    redeemedByWalletId: keyRecord.redeemedByWalletId || walletId || null,
    updatedAt: now,
  });
  saveDopiRechargeKeys(keys);

  return {
    success: true,
    keyRecord: keys[keyIndex],
    keyId: keyRecord.id,
    walletId: resolveDopiWalletId(keyRecord) || walletId || null,
    remainingBalance: updatedRemaining,
  };
}

function resolveDopiWalletId(keyRecord) {
  if (!keyRecord) return null;

  const customerEmail = String(keyRecord.customerEmail || keyRecord.ownerEmail || '').toLowerCase().trim();
  const walletId = String(keyRecord.walletId || keyRecord.customerWalletId || '').trim();

  if (customerEmail) return `email:${customerEmail}`;
  if (walletId) return walletId;
  return keyRecord.id ? `dopi:${keyRecord.id}` : null;
}

function ensureDopiWalletForKey(keyRecord) {
  const amount = Number(keyRecord?.amountDopi || 0);
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, reason: 'Invalid Dopi amount' };
  }

  const walletId = resolveDopiWalletId(keyRecord);
  if (!walletId) {
    return { success: false, reason: 'Missing Dopi wallet id' };
  }

  const ownerEmail = String(keyRecord.customerEmail || keyRecord.ownerEmail || '').toLowerCase().trim();
  return addAiCapacityToWallet(
    walletId,
    `dopi:${keyRecord.id}`,
    keyRecord.productId || null,
    amount,
    ownerEmail || null
  );
}

function getDefaultWebSupportConfig() {
  return {
    enabled: true,
    providerType: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    projectId: '',
    location: 'global',
    apiKey: '',
    authToken: '',
    credentialsJson: '',
    model: 'gemini-2.0-flash',
    languageCode: 'vi',
    servingConfigId: 'default_serving_config',
    systemPrompt: `Bạn là nhân viên hỗ trợ chính thức của Học Hứng Khởi.
Luôn trả lời thân thiện, ngắn gọn, rõ ràng, đúng trọng tâm.
Không tự xưng Claude, Gemini, OpenAI hay bất kỳ model nào.
Nếu người dùng hỏi về gói học, kích hoạt, thanh toán, đăng nhập, hãy hướng dẫn chính xác.
Nếu người dùng để lại số điện thoại hoặc email, hãy ghi nhận lịch sử và báo rằng bộ phận hỗ trợ sẽ liên hệ lại.
Nếu câu hỏi ngoài phạm vi, hãy trả lời lịch sự và hướng người dùng liên hệ hỗ trợ.`,
    telegram: {
      enabled: false,
      botToken: '',
      chatId: '',
      notifyOnNewChat: true,
      notifyOnLead: true,
      notifyOnEveryMessage: false,
    },
    pricing: {
      enabled: false,
      tasks: {
        chat: { inputPer1k: 1.0, outputPer1k: 1.0, multiplier: 1.0 },
        explain_lesson: { inputPer1k: 1.2, outputPer1k: 1.4, multiplier: 1.15 },
        deep_search: { inputPer1k: 1.5, outputPer1k: 2.0, multiplier: 1.8 },
        summarize: { inputPer1k: 0.9, outputPer1k: 1.1, multiplier: 1.05 },
      }
    }
  };
}


function normalizeWebSupportProviderType(providerType) {
  const value = String(providerType || '').trim();
  if (value === 'vertex_agent' || value === 'agent_search' || value === 'discovery_engine') return 'google_agent_search';
  return value || 'gemini';
}

function normalizeWebSupportPricingTask(taskValue, fallbackTask) {
  const fallback = fallbackTask || { inputPer1k: 0, outputPer1k: 0, multiplier: 1 };
  const inputPer1k = Number(taskValue?.inputPer1k);
  const outputPer1k = Number(taskValue?.outputPer1k);
  const multiplier = Number(taskValue?.multiplier);

  return {
    inputPer1k: Number.isFinite(inputPer1k) ? inputPer1k : fallback.inputPer1k,
    outputPer1k: Number.isFinite(outputPer1k) ? outputPer1k : fallback.outputPer1k,
    multiplier: Number.isFinite(multiplier) ? multiplier : fallback.multiplier,
  };
}

function loadWebSupportConfig() {
  const data = readJson(WEB_SUPPORT_CONFIG_FILE);
  const defaults = getDefaultWebSupportConfig();
  const telegramData = data?.telegram || {};
  const pricingData = data?.pricing || {};
  const config = {
    ...defaults,
    ...(data || {}),
    providerType: normalizeWebSupportProviderType(data?.providerType),
    telegram: {
      ...defaults.telegram,
      ...telegramData,
      notifyOnNewChat: telegramData.notifyOnNewChat ?? defaults.telegram.notifyOnNewChat,
      notifyOnLead: telegramData.notifyOnLead ?? defaults.telegram.notifyOnLead,
      notifyOnEveryMessage: false,
    },
    pricing: {
      ...defaults.pricing,
      ...pricingData,
      tasks: {
        ...defaults.pricing.tasks,
        ...(pricingData.tasks || {}),
      },
    }
  };

  if (config.providerType === 'google_agent_search') {
    config.baseUrl = 'https://discoveryengine.googleapis.com/v1';
    config.location = config.location || 'global';
    config.servingConfigId = String(config.servingConfigId || '').trim() || 'default_serving_config';
  }

  if (config.providerType === 'dialogflow_cx') {
    config.baseUrl = 'https://dialogflow.googleapis.com/v3';
    config.location = config.location || 'global';
    config.languageCode = String(config.languageCode || '').trim() || 'vi';
  }

  if (config.providerType === 'vertex_gemini') {
    config.baseUrl = config.baseUrl || 'https://aiplatform.googleapis.com/v1';
    config.location = config.location || 'us-central1';
  }

  return config;
}

function saveWebSupportConfig(config) {
  writeJson(WEB_SUPPORT_CONFIG_FILE, config);
}

let _webSupportOAuthCache = {
  fingerprint: '',
  accessToken: '',
  expiresAtMs: 0,
};

function base64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function normalizeServiceAccountCredentials(credentialsJson) {
  const raw = String(credentialsJson || '').trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractServiceAccountProjectId(credentialsJson) {
  const credentials = normalizeServiceAccountCredentials(credentialsJson);
  return String(credentials?.project_id || '').trim();
}

function normalizeVertexModelValue(modelValue) {
  return String(modelValue || '')
    .trim()
    .replace(/^models\//, '')
    .split('/')
    .filter(Boolean)
    .pop() || '';
}

async function getAccessTokenFromServiceAccountJson(credentialsJson, signal) {
  const credentials = normalizeServiceAccountCredentials(credentialsJson);
  if (!credentials) {
    throw new Error('Invalid Google Cloud credentials JSON.');
  }

  const fingerprint = crypto
    .createHash('sha256')
    .update(`${credentials.client_email}::${credentials.private_key}::${credentials.token_uri || ''}`)
    .digest('hex');

  if (_webSupportOAuthCache.fingerprint === fingerprint && _webSupportOAuthCache.accessToken && Date.now() < _webSupportOAuthCache.expiresAtMs) {
    return _webSupportOAuthCache.accessToken;
  }

  const tokenUri = String(credentials.token_uri || 'https://oauth2.googleapis.com/token').trim();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: tokenUri,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };

  const unsignedJwt = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(credentials.private_key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const assertion = `${unsignedJwt}.${signature}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    signal,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to get Google access token (${response.status}): ${responseText.slice(0, 200)}`);
  }

  const data = JSON.parse(responseText);
  if (!data?.access_token) {
    throw new Error('Google access token response missing access_token.');
  }

  const expiresInMs = Math.max(60, Number(data.expires_in || 3600) - 60) * 1000;
  _webSupportOAuthCache = {
    fingerprint,
    accessToken: data.access_token,
    expiresAtMs: Date.now() + expiresInMs,
  };

  return data.access_token;
}

function getWebSupportProviderBaseUrl(providerType, baseUrl) {
  if (providerType === 'dialogflow_cx') {
    return 'https://dialogflow.googleapis.com/v3';
  }
  if (providerType === 'vertex_gemini') {
    return 'https://aiplatform.googleapis.com/v1';
  }
  if (providerType === 'google_agent_search') {
    return 'https://discoveryengine.googleapis.com/v1';
  }
  const normalized = String(baseUrl || '').trim().replace(/\/$/, '');
  if (normalized) return normalized;
  return 'https://generativelanguage.googleapis.com/v1beta';
}

function getWebSupportProviderModelResource({ providerType, projectId, location, model, servingConfigId }) {
  const safeProject = String(projectId || '').trim();
  const safeLocation = String(location || '').trim();
  const safeModel = String(model || '').trim();
  const safeServingConfigId = String(servingConfigId || '').trim() || 'default_serving_config';

  if (providerType === 'dialogflow_cx') {
    return `projects/${safeProject}/locations/${safeLocation}/agents/${safeModel}`;
  }

  if (providerType === 'vertex_gemini') {
    return `projects/${safeProject}/locations/${safeLocation}/publishers/google/models/${safeModel}`;
  }

  if (providerType === 'google_agent_search') {
    return `projects/${safeProject}/locations/${safeLocation}/collections/default_collection/engines/${safeModel}/servingConfigs/${safeServingConfigId}`;
  }

  if (providerType === 'vertex_agent') {
    return `projects/${safeProject}/locations/${safeLocation}/reasoningEngines/${safeModel}`;
  }

  return safeModel;
}

function getVertexPublisherModelResource({ projectId, location, model }) {
  const safeProject = String(projectId || '').trim();
  const safeLocation = String(location || '').trim();
  const safeModel = String(model || '').trim();
  return `projects/${safeProject}/locations/${safeLocation}/publishers/google/models/${safeModel}`;
}

function extractAssistantTextFromVertexResponse(data) {
  if (!data) return '';

  if (typeof data.output === 'string') {
    return data.output;
  }

  if (Array.isArray(data.output?.parts)) {
    const text = data.output.parts.map((part) => part?.text || '').filter(Boolean).join('\n').trim();
    if (text) return text;
  }

  const outputText = data.output?.text || data.output?.response?.text;
  if (typeof outputText === 'string' && outputText.trim()) {
    return outputText.trim();
  }

  const candidates = data.candidates || data.response?.candidates || [];
  for (const candidate of candidates) {
    const content = candidate?.content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const text = parts.map((part) => part?.text || '').filter(Boolean).join('\n').trim();
    if (text) return text;
  }

  return '';
}

function extractAssistantTextFromDiscoveryEngineResponse(data) {
  if (!data) return '';

  const answerText = data?.answer?.answerText;
  if (typeof answerText === 'string' && answerText.trim()) {
    return answerText.trim();
  }

  const steps = Array.isArray(data?.answer?.steps) ? data.answer.steps : [];
  const stepText = steps
    .map((step) => String(step?.description || step?.text || '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  if (stepText) return stepText;

  const summary = data?.answer?.summary || data?.answer?.answerSummary || '';
  if (typeof summary === 'string' && summary.trim()) {
    return summary.trim();
  }

  return '';
}

function extractAssistantTextFromDialogflowResponse(data) {
  if (!data) return '';

  const responseMessages = Array.isArray(data?.queryResult?.responseMessages)
    ? data.queryResult.responseMessages
    : [];

  const text = responseMessages
    .flatMap((message) => Array.isArray(message?.text?.text) ? message.text.text : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  if (text) return text;

  const fulfillmentText = data?.queryResult?.fulfillmentText;
  if (typeof fulfillmentText === 'string' && fulfillmentText.trim()) {
    return fulfillmentText.trim();
  }

  return '';
}

function appendJsonl(filePath, entry) {
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
}

function readJsonlTail(filePath, limit = 20) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-Math.max(1, limit)).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function rewriteJsonl(filePath, entries) {
  const content = entries.map((entry) => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(filePath, content ? `${content}\n` : '');
}

function getWebSupportNotificationState(sessionId) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId || !fs.existsSync(WEB_SUPPORT_LOG_FILE)) {
    return {
      notifiedNewChat: false,
      notifiedLead: false,
    };
  }

  const logs = readJsonlTail(WEB_SUPPORT_LOG_FILE, Number.MAX_SAFE_INTEGER);
  let notifiedNewChat = false;
  let notifiedLead = false;

  for (const entry of logs) {
    if (String(entry?.sessionId || '').trim() !== normalizedSessionId) continue;
    const eventType = String(entry?.telegramNotificationType || '').trim();
    if (eventType === 'new_chat' || eventType === 'new_chat_lead') {
      notifiedNewChat = true;
    }
    if (eventType === 'lead' || eventType === 'new_chat_lead') {
      notifiedLead = true;
    }
  }

  return { notifiedNewChat, notifiedLead };
}

// ===== AI PROVIDERS CONFIG =====

function loadAiProviders() {
  const data = readJson(AI_PROVIDERS_FILE) || {};
  return migrateAiProvidersConfig(data);
}

function saveAiProviders(config) {
  writeJson(AI_PROVIDERS_FILE, config);
}

function normalizeAiPricingTask(taskValue, fallbackTask) {
  const fallback = fallbackTask || { inputPer1k: 0, outputPer1k: 0, multiplier: 1 };
  const inputPer1k = Number(taskValue?.inputPer1k);
  const outputPer1k = Number(taskValue?.outputPer1k);
  const multiplier = Number(taskValue?.multiplier);

  return {
    inputPer1k: Number.isFinite(inputPer1k) ? inputPer1k : fallback.inputPer1k,
    outputPer1k: Number.isFinite(outputPer1k) ? outputPer1k : fallback.outputPer1k,
    multiplier: Number.isFinite(multiplier) ? multiplier : fallback.multiplier,
  };
}

function normalizeAiPricingConfig(pricing, fallbackPricing = getDefaultAiPricingConfig()) {
  const source = pricing || {};
  const sourceTasks = source.tasks || {};
  const fallbackTasks = fallbackPricing.tasks || {};
  const dopiValueVnd = Number(source.dopiValueVnd);

  return {
    enabled: source.enabled ?? fallbackPricing.enabled,
    dopiValueVnd: Number.isFinite(dopiValueVnd) && dopiValueVnd > 0
      ? dopiValueVnd
      : fallbackPricing.dopiValueVnd,
    tasks: {
      chat: normalizeAiPricingTask(sourceTasks.chat, fallbackTasks.chat),
      explain_lesson: normalizeAiPricingTask(sourceTasks.explain_lesson, fallbackTasks.explain_lesson),
      generate_practice: normalizeAiPricingTask(sourceTasks.generate_practice, fallbackTasks.generate_practice),
      deep_search: normalizeAiPricingTask(sourceTasks.deep_search, fallbackTasks.deep_search),
    }
  };
}

function getAiPricingTaskKey(mode) {
  switch (String(mode || '').trim()) {
    case 'chat':
    case 'explain_question':
      return 'chat';
    case 'explain_lesson':
      return 'explain_lesson';
    case 'generate_practice':
      return 'generate_practice';
    case 'deep_search':
      return 'deep_search';
    case 'sales_support':
    default:
      return 'chat';
  }
}

function roundCreditAmount(value, precision = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Number(numeric.toFixed(precision));
}

function estimateTokensFromText(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 3));
}

function estimateUsageFromMessages(messages, assistantText = '', systemPrompt = '') {
  const promptText = [
    systemPrompt || '',
    ...(Array.isArray(messages) ? messages.map((message) => `${message.role || 'user'}: ${message.content || ''}`) : []),
  ].filter(Boolean).join('\n');

  const promptTokens = estimateTokensFromText(promptText);
  const completionTokens = estimateTokensFromText(assistantText);
  const totalTokens = promptTokens + completionTokens;

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

function normalizeUsageBreakdown(usage) {
  const promptTokens = Number(
    usage?.prompt_tokens ??
    usage?.promptTokens ??
    usage?.promptTokenCount ??
    usage?.input_tokens ??
    usage?.inputTokens ??
    0
  );
  const completionTokens = Number(
    usage?.completion_tokens ??
    usage?.completionTokens ??
    usage?.candidatesTokenCount ??
    usage?.output_tokens ??
    usage?.outputTokens ??
    0
  );
  const totalTokens = Number(
    usage?.total_tokens ??
    usage?.totalTokens ??
    usage?.totalTokenCount ??
    (Number.isFinite(promptTokens) && Number.isFinite(completionTokens) ? promptTokens + completionTokens : 0)
  );

  return {
    prompt_tokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completion_tokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function calculateRawDopiFromUsage(usage, pricingTask) {
  const promptTokens = Math.max(0, Number(usage?.prompt_tokens || 0));
  const completionTokens = Math.max(0, Number(usage?.completion_tokens || 0));
  const inputRate = Number(pricingTask?.inputPer1k || 0);
  const outputRate = Number(pricingTask?.outputPer1k || 0);
  const multiplier = Number(pricingTask?.multiplier || 1);

  const baseCharge = ((promptTokens / 1000) * inputRate) + ((completionTokens / 1000) * outputRate);
  return roundCreditAmount(baseCharge * multiplier);
}

function calculateChargedDopiFromUsage(usage, pricingTask) {
  const calculatedDopi = calculateRawDopiFromUsage(usage, pricingTask);
  return Math.max(1, Math.ceil(calculatedDopi));
}

function normalizeModelEntry(entry) {
  if (!entry) return null;

  const rawId = entry.id || entry.name || entry.model || entry.value;
  if (!rawId) return null;

  const normalizedId = String(rawId)
    .replace(/^models\//, '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.trim();
  if (!normalizedId) return null;

  const rawLabel = String(entry.display_name || entry.displayName || entry.title || entry.name || normalizedId);
  const label = rawLabel.includes('/') ? normalizedId : rawLabel;
  const description = entry.description || entry.summary || entry.details || '';

  return { value: normalizedId, label, description };
}

async function fetchModelsFromEndpoint(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) return null;

  const data = await response.json();
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : Array.isArray(data?.publisherModels)
          ? data.publisherModels
        : [];

  const models = items
    .map(normalizeModelEntry)
    .filter(Boolean);

  return models.length ? models : null;
}

async function fetchVertexPublisherModels({ credentialsJson, signal }) {
  const accessToken = await getAccessTokenFromServiceAccountJson(credentialsJson, signal);
  const endpoint = 'https://aiplatform.googleapis.com/v1beta1/publishers/google/models?view=PUBLISHER_MODEL_VIEW_BASIC&listAllVersions=true&pageSize=200';
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    signal,
  });

  if (!response.ok) return null;

  const data = await response.json();
  const models = (Array.isArray(data?.publisherModels) ? data.publisherModels : [])
    .map((entry) => {
      const normalized = normalizeModelEntry(entry);
      if (!normalized) return null;
      return {
        value: normalized.value,
        label: normalized.label,
        description: normalized.description || 'Vertex publisher model',
      };
    })
    .filter(Boolean);

  return models.length ? models : null;
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const atIndex = value.indexOf('@');
  if (atIndex <= 1) return value ? `${value[0]}***` : '';
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex);
  return `${local.slice(0, 2)}***${domain}`;
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 9) return phone;
  const start = digits.slice(0, 4);
  const end = digits.slice(-3);
  return `${start}***${end}`;
}

function extractSupportSignals(text) {
  const raw = String(text || '');
  const emailMatches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const phoneCandidates = raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  const phones = [...new Set(phoneCandidates.map((candidate) => {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 13) return null;
    return digits;
  }).filter(Boolean))];

  return {
    emails: [...new Set(emailMatches.map((email) => email.toLowerCase()))],
    phones,
  };
}

function buildTelegramSupportMessage(entry) {
  const lines = [];
  lines.push('Học Hứng Khởi - Web Support');
  if (entry.telegramNotificationType) {
    const typeLabel = {
      new_chat: 'New chat',
      lead: 'Lead',
      new_chat_lead: 'New chat + Lead',
    }[entry.telegramNotificationType] || entry.telegramNotificationType;
    lines.push(`Type: ${typeLabel}`);
  }
  lines.push(`Thời gian: ${entry.createdAt}`);
  lines.push(`Session: ${entry.sessionId || 'n/a'}`);
  if (entry.pageUrl) lines.push(`Trang: ${entry.pageUrl}`);
  if (entry.visitorEmail) lines.push(`Email: ${maskEmail(entry.visitorEmail)}`);
  if (entry.visitorName) lines.push(`Tên: ${entry.visitorName}`);
  if (entry.detectedPhones?.length) lines.push(`SĐT: ${entry.detectedPhones.map(maskPhone).join(', ')}`);
  if (entry.detectedEmails?.length) lines.push(`Email tìm thấy: ${entry.detectedEmails.map(maskEmail).join(', ')}`);
  lines.push(`Tin nhắn: ${normalizeWhitespace(entry.userMessage).slice(0, 500)}`);
  lines.push(`Lead: ${entry.isLead ? 'yes' : 'no'}`);
  return lines.join('\n');
}

async function sendTelegramMessage(botToken, chatId, text) {
  const token = String(botToken || '').trim();
  const targetChatId = String(chatId || '').trim();
  if (!token || !targetChatId || !text) {
    return { ok: false, error: 'Missing Telegram token, chatId, or text' };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: targetChatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || !body?.ok) {
    if (res.status === 404) {
      return {
        ok: false,
        error: 'Telegram bot token not found (404). Please check Bot Token and make sure the bot was created with BotFather.',
        status: res.status,
      };
    }
    return {
      ok: false,
      error: body?.description || `Telegram API HTTP ${res.status}`,
      status: res.status,
    };
  }

  return { ok: true, result: body.result || null };
}

// ===== LICENSE KEY TO EMAIL RESOLUTION =====

/**
 * Get customer email from license key
 * Used for Desktop Apps authentication via X-License-Key header
 */
function getEmailFromLicenseKey(licenseKey) {
  if (!licenseKey) return null;
  
  const licenses = loadLicenses();
  const license = licenses.find(l => l.licenseKey === licenseKey);
  
  if (!license) return null;
  
  // Priority: license.customerEmail -> order.customerEmail
  if (license.customerEmail) {
    return license.customerEmail;
  }
  
  // Fallback: find order and get email from there
  if (license.orderId) {
    const orders = loadOrders();
    const order = orders.find(o => o.orderId === license.orderId);
    if (order?.customerEmail) {
      return order.customerEmail;
    }
  }
  
  return null;
}

function getAiWalletIdFromAuth(auth) {
  const explicitWalletId = String(auth?.walletId || '').trim();
  if (explicitWalletId) return explicitWalletId;

  const dopiKey = String(auth?.dopiKey || '').trim();
  if (dopiKey) {
    const dopiRecord = findDopiKeyRecordByKey(dopiKey);
    const dopiWalletId = resolveDopiWalletId(dopiRecord);
    if (dopiWalletId) return dopiWalletId;
  }

  const licenseKey = String(auth?.licenseKey || '').trim();
  const userId = String(auth?.userId || '').trim();
  const email = String(auth?.email || '').toLowerCase().trim();
  if (licenseKey) return `license:${licenseKey}`;
  if (userId) return `user:${userId}`;
  if (email) return `email:${email}`;
  return null;
}

function getLegacyAiWalletIdFromEmail(email) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  return normalizedEmail ? `email:${normalizedEmail}` : null;
}

function findAiWallet(wallets, walletId, legacyEmail) {
  const normalizedWalletId = String(walletId || '').trim();
  const normalizedLegacyEmail = String(legacyEmail || '').toLowerCase().trim();
  return wallets.find(w => {
    const wWalletId = String(w.walletId || '').trim();
    const wEmail = String(w.email || '').toLowerCase().trim();
    if (normalizedWalletId && wWalletId === normalizedWalletId) return true;
    if (normalizedLegacyEmail && wEmail === normalizedLegacyEmail) return true;
    return false;
  }) || null;
}

function normalizeAiWalletRecords(wallets = [], transactions = []) {
  const nextWallets = Array.isArray(wallets) ? wallets.map(wallet => {
    const email = String(wallet.email || '').toLowerCase().trim();
    const walletId = String(wallet.walletId || '').trim() || getLegacyAiWalletIdFromEmail(email) || null;
    return { ...wallet, walletId, email: email || wallet.email || null };
  }) : [];

  const nextTransactions = Array.isArray(transactions) ? transactions.map(tx => ({
    ...tx,
    walletId: String(tx.walletId || '').trim() || getLegacyAiWalletIdFromEmail(tx.email) || null,
    email: String(tx.email || '').toLowerCase().trim() || tx.email || null,
  })) : [];

  return { wallets: nextWallets, transactions: nextTransactions };
}

/**
 * Middleware to support dual authentication:
 * - Clerk JWT (for Web)
 * - X-License-Key header (for Desktop Apps)
 * Sets req.auth = { userId, email, authType: 'clerk' | 'license' }
 */
async function requireDualAuth(req, res, next) {
  const authHeader = req.get('Authorization');
  const dopiKey = req.get('X-Dopi-Key');
  const licenseKey = req.get('X-License-Key');

  // Dopi key auth (AI capacity wallet bearer key)
  if (dopiKey) {
    const keyRecord = findDopiKeyRecordByKey(dopiKey);
    if (keyRecord && keyRecord.status !== 'void') {
      const walletId = resolveDopiWalletId(keyRecord);
      req.auth = {
        userId: null,
        email: keyRecord.customerEmail || keyRecord.ownerEmail || null,
        authType: 'dopi',
        dopiKey: normalizeDopiKey(dopiKey),
        walletId,
      };
      return next();
    }
    return res.status(401).json({ ok: false, error: 'Invalid Dopi key' });
  }
  
  // Try License Key auth first (Desktop Apps)
  if (licenseKey) {
    const email = getEmailFromLicenseKey(licenseKey);
    if (email) {
      req.auth = { 
        userId: null, // License auth doesn't have userId
        email, 
        authType: 'license',
        licenseKey,
        walletId: `license:${licenseKey}`
      };
      return next();
    }
    return res.status(401).json({ ok: false, error: 'Invalid license key' });
  }
  
  // Try Clerk JWT auth (Web)
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Authentication required. Provide Bearer token or X-License-Key header.' });
  }
  
  let payload = null;
  
  if (CLERK_SECRET_KEY) {
    try {
      payload = await verifyClerkToken(token);
    } catch (err) {
      return res.status(401).json({ ok: false, error: 'Invalid token: ' + err.message });
    }
  } else {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return res.status(401).json({ ok: false, error: 'Invalid token format' });
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch {
      return res.status(401).json({ ok: false, error: 'Invalid token payload' });
    }
  }
  
  const userId = payload.sub || payload.userId || payload.azp;
  const email =
    payload.email ||
    payload.primary_email_address ||
    (payload.emails && payload.emails[0]?.email) ||
    null;
  
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Token missing user ID' });
  }
  
  req.auth = { userId, email, authType: 'clerk' };
  next();
}

/**
 * Add AI capacity to user's wallet (idempotent by orderId)
 * Returns { success, addedAmount, newBalance, transactionId } or { success: false, reason }
 */
function addAiCapacityToWallet(walletId, orderId, productId, amountToAdd, legacyEmail = null) {
  if (!walletId || !orderId || !amountToAdd || amountToAdd <= 0) {
    return { success: false, reason: 'Invalid parameters' };
  }

  const normalizedWalletId = String(walletId).trim();
  const normalizedEmail = String(legacyEmail || '').toLowerCase().trim();
  const { wallets, transactions } = normalizeAiWalletRecords(...Object.values(loadAiCapacityWallets()));

  const existingTxn = transactions.find(t => t.orderId === orderId);
  if (existingTxn) {
    return { success: false, reason: 'Already processed', existingTransaction: existingTxn };
  }

  let wallet = findAiWallet(wallets, normalizedWalletId, normalizedEmail);
  if (!wallet) {
    wallet = {
      walletId: normalizedWalletId,
      email: normalizedEmail || null,
      balance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    wallets.push(wallet);
  } else if (!wallet.walletId) {
    wallet.walletId = normalizedWalletId;
  }

  const newBalance = Number(wallet.balance || 0) + amountToAdd;

  const transaction = {
    id: `ai_txn_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    walletId: normalizedWalletId,
    email: normalizedEmail || wallet.email || null,
    orderId,
    productId: productId || null,
    type: 'purchase',
    amount: amountToAdd,
    balanceAfter: newBalance,
    createdAt: new Date().toISOString()
  };

  wallet.balance = newBalance;
  wallet.updatedAt = new Date().toISOString();

  transactions.push(transaction);
  saveAiCapacityWallets(wallets, transactions);

  return {
    success: true,
    addedAmount: amountToAdd,
    newBalance,
    transactionId: transaction.id,
    walletId: normalizedWalletId,
  };
}

/**
 * Deduct AI capacity from user's wallet
 * Used when user makes an AI chat request
 * Returns { success, deductedAmount, newBalance, transactionId } or { success: false, reason, currentBalance }
 */
function deductAiCapacity(walletId, amountToDeduct = 1, metadata = {}, legacyEmail = null) {
  if (!walletId || !amountToDeduct || amountToDeduct <= 0) {
    return { success: false, reason: 'Invalid parameters' };
  }

  const normalizedWalletId = String(walletId).trim();
  const normalizedEmail = String(legacyEmail || '').toLowerCase().trim();
  const { wallets, transactions } = normalizeAiWalletRecords(...Object.values(loadAiCapacityWallets()));
  const normalizedDopiKey = normalizeDopiKey(metadata?.dopiKey || '');
  let keyRecord = null;
  let keyIndex = -1;
  let keyCurrentRemaining = null;
  let keyTotalAmount = null;
  let keys = null;

  if (normalizedDopiKey) {
    seedDopiKeyQuotasForWallet(normalizedWalletId, normalizedEmail);
    keys = loadDopiRechargeKeys();
    keyIndex = keys.findIndex((record) => normalizeDopiKey(record.key) === normalizedDopiKey);
    if (keyIndex === -1) {
      return { success: false, reason: 'Dopi key not found' };
    }

    keyRecord = normalizeDopiKeyRecord(keys[keyIndex]);
    if (String(keyRecord.status || '').toLowerCase().trim() === 'void') {
      return { success: false, reason: 'Dopi key is void' };
    }

    keyTotalAmount = getDopiKeyTotalAmount(keyRecord);
    keyCurrentRemaining = getDopiKeyRemainingAmount(keyRecord);
    if (keyCurrentRemaining < amountToDeduct) {
      return {
        success: false,
        reason: 'Insufficient key balance',
        currentBalance: keyCurrentRemaining,
        keyRecord,
      };
    }
  }

  let wallet = findAiWallet(wallets, normalizedWalletId, normalizedEmail);
  if (!wallet && !normalizedDopiKey) {
    return { success: false, reason: 'Wallet not found', currentBalance: 0 };
  }

  const currentBalance = normalizedDopiKey
    ? keyCurrentRemaining
    : Number(wallet.balance || 0);

  if (currentBalance < amountToDeduct) {
    return normalizedDopiKey
      ? { success: false, reason: 'Insufficient key balance', currentBalance, keyRecord }
      : { success: false, reason: 'Insufficient balance', currentBalance };
  }

  if (!wallet) {
    wallet = {
      walletId: normalizedWalletId,
      email: normalizedEmail || null,
      balance: currentBalance,
      updatedAt: new Date().toISOString(),
    };
  }

  const newBalance = currentBalance - amountToDeduct;

  const transaction = {
    id: `ai_txn_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    walletId: normalizedWalletId,
    email: normalizedEmail || wallet.email || null,
    orderId: metadata.orderId || null,
    productId: metadata.productId || null,
    type: 'usage',
    amount: -amountToDeduct,
    balanceAfter: newBalance,
    metadata: {
      ...metadata,
      userAgent: metadata.userAgent || null
    },
    createdAt: new Date().toISOString()
  };

  if (!normalizedDopiKey) {
    wallet.balance = newBalance;
    wallet.walletId = wallet.walletId || normalizedWalletId;
    wallet.updatedAt = new Date().toISOString();
  }

  if (normalizedDopiKey && keyRecord && keyIndex >= 0 && Array.isArray(keys)) {
    const now = new Date().toISOString();
    const updatedRemaining = Math.max(0, keyCurrentRemaining - amountToDeduct);
    keys[keyIndex] = normalizeDopiKeyRecord({
      ...keyRecord,
      remainingDopi: updatedRemaining,
      spentDopi: Math.max(0, keyTotalAmount - updatedRemaining),
      redeemedByWalletId: keyRecord.redeemedByWalletId || normalizedWalletId || null,
      updatedAt: now,
    });
    saveDopiRechargeKeys(keys);
  }

  transactions.push(transaction);
  saveAiCapacityWallets(wallets, transactions);

  return {
    success: true,
    deductedAmount: amountToDeduct,
    newBalance,
    transactionId: transaction.id,
    walletId: normalizedWalletId,
    dopiKeyId: keyRecord?.id || null,
    dopiKeyRemainingBalance: normalizedDopiKey ? Math.max(0, keyCurrentRemaining - amountToDeduct) : null,
  };
}

function repairDopiWalletForKey(keyRecord, repairReason = 'capacity-read') {
  const normalizedKeyRecord = normalizeDopiKeyRecord(keyRecord);
  const keyId = String(normalizedKeyRecord.id || '').trim();
  const keyValue = normalizeDopiKey(normalizedKeyRecord.key);
  const amount = Number(normalizedKeyRecord.amountDopi || 0);

  if (!keyId || !keyValue) {
    return { success: false, reason: 'Missing Dopi key record' };
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, reason: 'Invalid Dopi amount' };
  }

  const expectedWalletId = resolveDopiWalletId(normalizedKeyRecord);
  if (!expectedWalletId) {
    return { success: false, reason: 'Missing expected wallet id' };
  }

  const now = new Date().toISOString();
  const ownerEmail = String(normalizedKeyRecord.customerEmail || normalizedKeyRecord.ownerEmail || '').toLowerCase().trim() || null;
  const { wallets, transactions } = normalizeAiWalletRecords(...Object.values(loadAiCapacityWallets()));
  const keyOrderId = String(normalizedKeyRecord.orderId || '').trim();
  const keyTxnId = String(normalizedKeyRecord.walletTransactionId || '').trim();

  const relatedTransactions = transactions.filter((tx) => {
    const txOrderId = String(tx.orderId || '').trim();
    const txId = String(tx.id || '').trim();
    const txMeta = tx.metadata && typeof tx.metadata === 'object' ? tx.metadata : {};
    const txKeyId = String(txMeta.repairForKeyId || txMeta.dopiKeyId || tx.dopiKeyId || '').trim();
    return (
      txOrderId === `dopi:${keyId}` ||
      (keyOrderId && txOrderId === keyOrderId) ||
      (keyTxnId && txId === keyTxnId) ||
      txKeyId === keyId
    );
  });

  const currentPositive = relatedTransactions.find((tx) => {
    const txWalletId = String(tx.walletId || '').trim();
    const txType = String(tx.type || '').toLowerCase().trim();
    const txAmount = Number(tx.amount || 0);
    return txWalletId === expectedWalletId && txAmount > 0 && (txType === 'purchase' || txType === 'credit' || txType === 'correction');
  });
  if (currentPositive) {
    const wallet = findAiWallet(wallets, expectedWalletId, ownerEmail);
    return {
      success: true,
      repaired: false,
      walletId: expectedWalletId,
      balance: wallet ? Number(wallet.balance || 0) : 0,
      transactionId: currentPositive.id,
      existingTransaction: currentPositive,
    };
  }

  const sourceTransaction = relatedTransactions
    .filter((tx) => Number(tx.amount || 0) > 0)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .find((tx) => String(tx.walletId || '').trim() !== expectedWalletId) || null;

  if (!sourceTransaction) {
    return { success: false, reason: 'No source Dopi transaction found' };
  }

  let targetWallet = findAiWallet(wallets, expectedWalletId, ownerEmail);
  if (!targetWallet) {
    targetWallet = {
      walletId: expectedWalletId,
      email: ownerEmail,
      balance: 0,
      createdAt: now,
      updatedAt: now,
    };
    wallets.push(targetWallet);
  }

  const sourceWalletId = String(sourceTransaction.walletId || '').trim() || null;
  const sourceWallet = sourceWalletId ? findAiWallet(wallets, sourceWalletId, sourceTransaction.email || null) : null;
  let sourceDebitTransactionId = null;

  if (sourceWallet && sourceWalletId !== expectedWalletId) {
    const sourceBalance = Number(sourceWallet.balance || 0);
    if (sourceBalance >= amount) {
      sourceWallet.balance = sourceBalance - amount;
      sourceWallet.updatedAt = now;

      sourceDebitTransactionId = `ai_txn_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      transactions.push({
        id: sourceDebitTransactionId,
        walletId: sourceWalletId,
        email: String(sourceWallet.email || sourceTransaction.email || ownerEmail || '').toLowerCase().trim() || null,
        orderId: keyOrderId || `dopi:${keyId}`,
        productId: normalizedKeyRecord.productId || null,
        type: 'correction',
        amount: -amount,
        balanceAfter: sourceWallet.balance,
        metadata: {
          action: 'repair',
          repairReason,
          repairType: 'debit',
          repairForKeyId: keyId,
          repairForOrderId: keyOrderId || null,
          sourceTransactionId: String(sourceTransaction.id || '').trim() || null,
          targetWalletId: expectedWalletId,
        },
        createdAt: now,
      });
    }
  }

  const targetBalanceBefore = Number(targetWallet.balance || 0);
  const targetBalanceAfter = targetBalanceBefore + amount;
  const targetTransactionId = `ai_txn_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  targetWallet.balance = targetBalanceAfter;
  targetWallet.updatedAt = now;
  transactions.push({
    id: targetTransactionId,
    walletId: expectedWalletId,
    email: ownerEmail || String(targetWallet.email || sourceTransaction.email || '').toLowerCase().trim() || null,
    orderId: keyOrderId || `dopi:${keyId}`,
    productId: normalizedKeyRecord.productId || null,
    type: 'correction',
    amount,
    balanceAfter: targetBalanceAfter,
    metadata: {
      action: 'repair',
      repairReason,
      repairType: 'credit',
      repairForKeyId: keyId,
      repairForOrderId: keyOrderId || null,
      sourceTransactionId: String(sourceTransaction.id || '').trim() || null,
      sourceWalletId,
      sourceDebitTransactionId,
    },
    createdAt: now,
  });

  saveAiCapacityWallets(wallets, transactions);

  const keys = loadDopiRechargeKeys();
  const keyIndex = keys.findIndex((record) => normalizeDopiKey(record.key) === keyValue);
  if (keyIndex !== -1) {
    const updatedKeyRecord = {
      ...keys[keyIndex],
      walletId: expectedWalletId,
      customerWalletId: expectedWalletId,
      redeemedByWalletId: expectedWalletId,
      walletTransactionId: targetTransactionId,
      repairSourceWalletId: sourceWalletId,
      repairSourceTransactionId: String(sourceTransaction.id || '').trim() || null,
      repairTransactionId: targetTransactionId,
      repairedAt: now,
      updatedAt: now,
    };
    keys[keyIndex] = normalizeDopiKeyRecord(updatedKeyRecord);
    saveDopiRechargeKeys(keys);
  }

  return {
    success: true,
    repaired: true,
    walletId: expectedWalletId,
    balance: targetBalanceAfter,
    transactionId: targetTransactionId,
    sourceTransactionId: String(sourceTransaction.id || '').trim() || null,
    sourceWalletId,
    sourceDebitTransactionId,
    sourceDebitApplied: Boolean(sourceDebitTransactionId),
  };
}

// ===== UTILITIES =====

function generateOrderId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `HTT-${timestamp}-${random}`;
}

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

function generateDopiRechargeKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parts = [];
  for (let segment = 0; segment < 4; segment++) {
    let value = '';
    for (let i = 0; i < 4; i++) {
      value += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    parts.push(value);
  }
  return `DOPI-${parts.join('-')}`;
}

function normalizeDopiKey(key) {
  return String(key || '').trim().toUpperCase().replace(/\s+/g, '');
}

function maskDopiKey(key) {
  const normalized = normalizeDopiKey(key);
  if (!normalized) return null;
  return `DOPI-****-****-****-${normalized.slice(-4)}`;
}

function createDopiRechargeKey({ orderId = null, productId = null, productName = '', customerEmail = '', amountDopi, source = 'order', createdBy = 'system', note = '' }) {
  const amount = Number(amountDopi);
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, reason: 'Invalid Dopi amount' };
  }

  const keys = loadDopiRechargeKeys();
  if (orderId) {
    const existing = keys.find(k => k.orderId === orderId && k.status !== 'void');
    if (existing) {
      return { success: true, keyRecord: existing, existing: true };
    }
  }

  let keyValue = generateDopiRechargeKey();
  while (keys.some(k => normalizeDopiKey(k.key) === normalizeDopiKey(keyValue))) {
    keyValue = generateDopiRechargeKey();
  }

  const now = new Date().toISOString();
  const normalizedCustomerEmail = String(customerEmail || '').toLowerCase().trim();
  const walletId = normalizedCustomerEmail ? `email:${normalizedCustomerEmail}` : `dopi:${Date.now().toString(36)}`;
  const keyRecord = {
    id: `dopi_key_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
    key: keyValue,
    walletId,
    amountDopi: amount,
    remainingDopi: amount,
    spentDopi: 0,
    orderId,
    productId,
    productName,
    customerEmail: normalizedCustomerEmail,
    ownerEmail: normalizedCustomerEmail,
    customerWalletId: walletId,
    status: 'active',
    source,
    createdBy,
    note,
    createdAt: now,
    updatedAt: now,
    redeemedAt: null,
    redeemedByEmail: null,
    redeemedByWalletId: null,
    walletTransactionId: null,
  };

  keys.push(normalizeDopiKeyRecord(keyRecord));
  saveDopiRechargeKeys(keys);

  const walletResult = ensureDopiWalletForKey(keyRecord);
  if (!walletResult.success && walletResult.reason !== 'Already processed') {
    console.error(`[Dopi] Failed to initialize wallet for key ${keyRecord.id}: ${walletResult.reason}`);
  } else if (walletResult.success) {
    keyRecord.walletTransactionId = walletResult.transactionId || null;
    keyRecord.redeemedByWalletId = walletResult.walletId || walletId;
    keyRecord.updatedAt = new Date().toISOString();
    const refreshedKeys = loadDopiRechargeKeys().map((record) => (
      record.id === keyRecord.id
        ? { ...record, walletTransactionId: keyRecord.walletTransactionId, redeemedByWalletId: keyRecord.redeemedByWalletId, updatedAt: keyRecord.updatedAt }
        : record
    ));
    saveDopiRechargeKeys(refreshedKeys);
  }

  return { success: true, keyRecord, existing: false };
}

function getExpiryDate(months) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

// Track processed transactions to prevent duplicates
const processedTransactions = new Set();
const PROCESSED_TRANSACTIONS_FILE = path.join(DATA_DIR, 'processed-transactions.json');

/**
 * Load processed transactions from file
 */
function loadProcessedTransactions() {
  try {
    if (fs.existsSync(PROCESSED_TRANSACTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROCESSED_TRANSACTIONS_FILE, 'utf8'));
      data.transactions?.forEach(id => processedTransactions.add(id));
    }
  } catch {
    // Ignore errors, start with empty set
  }
}

/**
 * Save processed transactions to file
 */
function saveProcessedTransactions() {
  try {
    const data = { transactions: Array.from(processedTransactions), updatedAt: new Date().toISOString() };
    fs.writeFileSync(PROCESSED_TRANSACTIONS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[Transaction] Failed to save processed transactions:', err.message);
  }
}

/**
 * Check if transaction was already processed (idempotent)
 */
function isTransactionProcessed(transactionId) {
  if (!transactionId) return false;
  
  if (processedTransactions.has(transactionId)) {
    return true;
  }
  
  // Also check orders that are already paid
  const orders = loadOrders();
  const alreadyPaid = orders.some(o => o.paymentRef === transactionId && o.status === 'paid');
  
  return alreadyPaid;
}

/**
 * Mark transaction as processed
 */
function markTransactionProcessed(transactionId) {
  if (transactionId) {
    processedTransactions.add(transactionId);
    saveProcessedTransactions();
  }
}

// Load existing processed transactions on startup
loadProcessedTransactions();

/**
 * Verify SePay webhook signature using HMAC-SHA256
 * Guard cứng: không throw dù input sai format
 */
function verifySePaySignature(rawBody, signature, secret) {
  if (!signature || !secret || !rawBody) return false;

  try {
    const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    const expectedBuffer = Buffer.from(computed, 'hex');
    const signatureBuffer = Buffer.from(String(signature), 'hex');

    // Guard: nếu buffer không cùng độ dài, signature sai
    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    // Bất kỳ lỗi nào (crypto, buffer, encoding) đều trả false
    return false;
  }
}

function logWebhookSafe(payload, signatureValid) {
  const timestamp = new Date().toISOString();
  const safeLog = {
    timestamp,
    signatureValid,
    hasOrderId: !!(payload.code || payload.orderId || payload.order_id),
    hasAmount: !!payload.transferAmount,
    accountNumber: payload.accountNumber ? '***' + payload.accountNumber.slice(-4) : null,
    transactionId: payload.transactionId || payload.transactionID || payload.id || null,
  };
  console.log('[Webhook]', JSON.stringify(safeLog));
  const logEntry = JSON.stringify({
    timestamp,
    signatureValid,
    payloadKeys: Object.keys(payload),
    payloadHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16),
  });
  fs.appendFileSync(WEBHOOK_LOG_FILE, logEntry + '\n');
}

// ===== AUTH MIDDLEWARE =====

/**
 * requireAuth(req, res, next)
 * Verifies Clerk JWT (via JWKS) and sets req.auth = { userId, email }
 * Returns 401 if token is missing or invalid.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  let payload = null;

  if (CLERK_SECRET_KEY) {
    try {
      payload = await verifyClerkToken(token);
    } catch (err) {
      return res.status(401).json({ ok: false, error: 'Invalid token: ' + err.message });
    }
  } else {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return res.status(401).json({ ok: false, error: 'Invalid token format' });
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch {
      return res.status(401).json({ ok: false, error: 'Invalid token payload' });
    }
  }

  const userId = payload.sub || payload.userId || payload.azp;
  const email =
    payload.email ||
    payload.primary_email_address ||
    (payload.emails && payload.emails[0]?.email) ||
    null;

  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Token missing user ID' });
  }

  req.auth = { userId, email };
  next();
}

// ===== API ENDPOINTS =====

/**
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'hochungkhoi-api',
    version: '1.1.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/me/orders
 * Returns orders belonging to the authenticated user (by email).
 * Auth required. Never returns full licenseKey.
 */
app.get('/api/me/orders', requireAuth, (req, res) => {
  const { email } = req.auth;

  if (!email) {
    return res.json({ ok: true, orders: [], message: 'No email in token â€” cannot look up orders' });
  }

  const allOrders = loadOrders();
  const dopiKeys = loadDopiRechargeKeys();
  const userOrders = allOrders
    .filter(o => o.customerEmail === email)
    .sort((a, b) => {
      // paid first, then by createdAt desc
      const statusRank = (s) => s === 'paid' ? 0 : s === 'pending' ? 1 : 2;
      const rankDiff = statusRank(a.status) - statusRank(b.status);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    })
    .map(o => {
      const dopiKey = dopiKeys.find(k => k.orderId === o.orderId);
      const dopiKeyStatus = String(dopiKey?.status || '').toLowerCase().trim();
      const dopiKeyOwnerEmail = String(dopiKey?.ownerEmail || dopiKey?.customerEmail || '').toLowerCase().trim();
      const canRevealDopiKey = Boolean(dopiKey && dopiKeyStatus !== 'void' && dopiKeyOwnerEmail === email);
      return {
        orderId: o.orderId,
        productId: o.productId,
        productName: o.productName,
        amount: o.amount,
        currency: o.currency,
        status: o.status,
        selectedGrades: o.selectedGrades || [],
        createdAt: o.createdAt,
        paidAt: o.paidAt || null,
        expiresAt: o.expiresAt || null,
        licenseKeyMasked: o.licenseKey ? 'HHK-****-****-****-' + o.licenseKey.slice(-4) : null,
        dopiAmount: o.dopiAmount || dopiKey?.amountDopi || null,
        dopiRechargeKey: canRevealDopiKey ? dopiKey.key : null,
        dopiRechargeKeyMasked: dopiKey ? maskDopiKey(dopiKey.key) : (o.dopiRechargeKeyMasked || null),
        dopiRechargeStatus: dopiKey?.status || null,
      };
    });

  res.json({ ok: true, orders: userOrders, count: userOrders.length });
});

/**
 * GET /api/me/licenses
 * Returns active licenses belonging to the authenticated user (by email).
 * Auth required. Never returns full licenseKey.
 * NOTE: app-to-URL mapping below â€” update as new apps are added.
 */
const APP_URL_MAP = {
  'app-cap-01': 'https://app.hochungkhoi.site/cap-01/',
  'cap-01': 'https://app.hochungkhoi.site/cap-01/',
  'hoctap-cap-01': 'https://app.hochungkhoi.site/cap-01/',
  'app-study-12': 'https://app.hochungkhoi.site/cap-01/',
  'app-lop-06': 'https://app.hochungkhoi.site/lop-06/',
  'lop-06': 'https://app.hochungkhoi.site/lop-06/',
  'grade6': 'https://app.hochungkhoi.site/lop-06/',
  'app-lop-07': 'https://app.hochungkhoi.site/lop-07/',
  'lop-07': 'https://app.hochungkhoi.site/lop-07/',
  'grade7': 'https://app.hochungkhoi.site/lop-07/',
  'grade7_12m': 'https://app.hochungkhoi.site/lop-07/',
  // TODO: add more app mappings when new apps are deployed
};

function resolveAppUrl(appId, productId) {
  if (appId && APP_URL_MAP[appId]) return APP_URL_MAP[appId];
  if (productId && APP_URL_MAP[productId]) return APP_URL_MAP[productId];
  return 'https://app.hochungkhoi.site/cap-01/'; // fallback
}

function resolveProductAppId(product) {
  if (product?.appId) return product.appId;
  const gradeIds = Array.isArray(product?.gradeIds) ? product.gradeIds : [];
  if (gradeIds.length === 1 && gradeIds[0] === 6) return 'app-lop-06';
  if (gradeIds.length === 1 && gradeIds[0] === 7) return 'app-lop-07';
  return 'app-cap-01';
}

function normalizeAppId(appId) {
  const value = String(appId || '').trim().toLowerCase();
  if (['app-cap-01', 'cap-01', 'hoctap-cap-01', 'app-study-12'].includes(value)) return 'app-cap-01';
  if (['app-lop-06', 'lop-06', 'grade6', 'grade6_12m'].includes(value)) return 'app-lop-06';
  if (['app-lop-07', 'lop-07', 'grade7', 'grade7_12m'].includes(value)) return 'app-lop-07';
  return value || null;
}

function resolveLicenseAppId(license) {
  if (license?.appId) return normalizeAppId(license.appId);

  // Backward compatibility cho license cũ nếu thiếu appId.
  const productId = String(license?.productId || '').trim().toLowerCase();
  const allowedGrades = Array.isArray(license?.allowedGrades) ? license.allowedGrades : [];

  if (productId === 'grade6_12m' || allowedGrades.includes(6)) return 'app-lop-06';
  if (productId === 'grade7_12m' || allowedGrades.includes(7)) return 'app-lop-07';

  // License cũ trước đây chủ yếu là Cấp 01.
  return 'app-cap-01';
}

function isLicenseAppCompatible(license, requestedAppId) {
  const licenseAppId = resolveLicenseAppId(license);
  const requestAppId = normalizeAppId(requestedAppId);

  // Nếu client cũ verify chưa gửi appId thì không block ở verify để tránh vỡ Cấp 01.
  if (!requestAppId) return true;

  return licenseAppId === requestAppId;
}

app.get('/api/me/licenses', requireAuth, (req, res) => {
  const { email } = req.auth;

  if (!email) {
    return res.json({ ok: true, licenses: [], message: 'No email in token â€” cannot look up licenses' });
  }

  const allLicenses = loadLicenses();
  const allOrders = loadOrders();

  const userLicenses = allLicenses
    .filter(l => {
      if (l.customerEmail === email) return true;
      if (l.orderId) {
        const order = allOrders.find(o => o.orderId === l.orderId);
        if (order?.customerEmail === email) return true;
      }
      return false;
    })
    .sort((a, b) => {
      // active first
      const rank = (s) => s === 'active' ? 0 : s === 'expired' ? 1 : 2;
      return rank(a.status) - rank(b.status);
    })
    .map(l => ({
      licenseKey: l.licenseKey || null,
      licenseKeyMasked: l.licenseKey ? 'HHK-****-****-****-' + l.licenseKey.slice(-4) : null,
      orderId: l.orderId || null,
      productId: l.productId,
      productName: l.productName,
      appId: l.appId,
      appUrl: resolveAppUrl(l.appId, l.productId),
      allowedGrades: l.allowedGrades || [],
      selectedGrades: l.selectedGrades || [],
      status: l.status,
      startDate: l.startDate || null,
      expiresAt: l.expiresAt || null,
      deviceLimit: l.deviceLimit || 1,
      plan: l.plan || null,
      durationMonths: l.durationMonths || null,
    }));

  res.json({ ok: true, licenses: userLicenses, count: userLicenses.length });
});

/**
 * GET /api/ai/capacity
 * Returns AI capacity balance and transactions for the authenticated user.
 * Supports dual auth: Clerk JWT (Web) or X-License-Key header (Desktop Apps).
 * Never returns full transaction details of other users.
 */
const handleAiCapacityRequest = (req, res) => {
  const { email, authType } = req.auth;
  const walletId = getAiWalletIdFromAuth(req.auth);
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const dopiKey = String(req.auth?.dopiKey || '').trim();
  let dopiKeyBalance = null;
  let dopiKeyAmount = null;
  let dopiKeyId = null;

  if (authType === 'dopi' && dopiKey) {
    let dopiRecord = findDopiKeyRecordByKey(dopiKey);
    if (dopiRecord) {
      seedDopiKeyQuotasForWallet(walletId, normalizedEmail);
      const repairResult = repairDopiWalletForKey(dopiRecord, 'capacity-read');
      if (repairResult.success && repairResult.repaired) {
        console.log(`[Dopi Repair] capacity-read repaired key ${dopiRecord.id} -> ${repairResult.walletId} (+${repairResult.balance})`);
      } else if (!repairResult.success && repairResult.reason !== 'No source Dopi transaction found') {
        console.warn(`[Dopi Repair] capacity-read skipped for key ${dopiRecord.id}: ${repairResult.reason}`);
      }
      dopiRecord = findDopiKeyRecordByKey(dopiKey) || dopiRecord;
      dopiKeyBalance = getDopiKeyRemainingAmount(dopiRecord);
      dopiKeyAmount = getDopiKeyTotalAmount(dopiRecord);
      dopiKeyId = String(dopiRecord.id || '').trim() || null;
    }
  }

  const { wallets, transactions } = loadAiCapacityWallets();
  const wallet = findAiWallet(wallets, walletId, normalizedEmail);
  const walletBalance = wallet ? Number(wallet.balance || 0) : 0;
  let balance = walletBalance;
  if (authType === 'dopi' && dopiKey) {
    balance = Number(dopiKeyBalance || 0);
  }

  const userTransactions = transactions
    .filter(t => {
      const txWalletId = String(t.walletId || '').trim();
      const txEmail = String(t.email || '').toLowerCase().trim();
      const txMeta = t && typeof t.metadata === 'object' && t.metadata ? t.metadata : {};
      const txDopiKeyId = String(txMeta.dopiKeyId || txMeta.repairForKeyId || t.dopiKeyId || '').trim();

      if (authType === 'dopi' && dopiKeyId) {
        return txDopiKeyId === dopiKeyId;
      }

      return (walletId && txWalletId === walletId) || (normalizedEmail && txEmail === normalizedEmail);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(t => ({
      id: t.id,
      orderId: t.orderId,
      productId: t.productId,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      createdAt: t.createdAt,
    }));

  res.json({
    ok: true,
    balance,
    walletBalance,
    dopiKeyBalance,
    dopiKeyAmount,
    dopiKeyId,
    unit: 'Dopi',
    email: normalizedEmail,
    walletId: wallet?.walletId || walletId || null,
    authType,
    transactions: userTransactions,
    count: userTransactions.length,
  });
};

app.get('/api/ai/capacity', requireDualAuth, handleAiCapacityRequest);
app.get('/api/ai/capacity/me', requireDualAuth, handleAiCapacityRequest);

/**
 * GET /api/dopi/recharge-keys
 * Returns Dopi recharge keys related to the authenticated email.
 */
app.get('/api/dopi/recharge-keys', requireDualAuth, (req, res) => {
  const email = (req.auth.email || '').toLowerCase().trim();
  const walletId = getAiWalletIdFromAuth(req.auth);
  if (!email && !walletId) {
    return res.json({ ok: true, keys: [], count: 0 });
  }

  seedDopiKeyQuotasForWallet(walletId, email);

  const keys = loadDopiRechargeKeys()
    .filter(k => {
      const customerEmail = String(k.customerEmail || '').toLowerCase().trim();
      const redeemedByEmail = String(k.redeemedByEmail || '').toLowerCase().trim();
      const customerWalletId = String(k.customerWalletId || '').trim();
      const redeemedByWalletId = String(k.redeemedByWalletId || '').trim();
      const recordWalletId = String(k.walletId || '').trim();
      return (
        (email && (customerEmail === email || redeemedByEmail === email)) ||
        (walletId && (customerWalletId === walletId || redeemedByWalletId === walletId || recordWalletId === walletId))
      );
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(k => ({
      id: k.id,
      key:
        k.status !== 'void' && (
          (email && String(k.customerEmail || '').toLowerCase().trim() === email) ||
          (walletId && (
            String(k.customerWalletId || '').trim() === walletId ||
            String(k.redeemedByWalletId || '').trim() === walletId ||
            String(k.walletId || '').trim() === walletId
          ))
        )
          ? k.key
          : null,
      keyMasked: maskDopiKey(k.key),
      amountDopi: k.amountDopi,
      orderId: k.orderId,
      productId: k.productId,
      productName: k.productName,
      customerEmail: k.customerEmail || null,
      ownerEmail: k.ownerEmail || k.customerEmail || null,
      walletId: k.walletId || null,
      customerWalletId: k.customerWalletId || null,
      remainingDopi: Number.isFinite(Number(k.remainingDopi)) ? Math.max(0, Math.floor(Number(k.remainingDopi))) : null,
      spentDopi: Number.isFinite(Number(k.spentDopi)) ? Math.max(0, Math.floor(Number(k.spentDopi))) : null,
      status: k.status === 'void' ? 'void' : 'active',
      createdAt: k.createdAt,
      redeemedAt: k.redeemedAt || null,
      redeemedByEmail: k.redeemedByEmail || null,
      redeemedByWalletId: k.redeemedByWalletId || null,
    }));

  res.json({ ok: true, keys, count: keys.length });
});

/**
 * POST /api/dopi/redeem
 * Activates a Dopi key for the current auth context and returns key quota.
 */
app.post('/api/dopi/redeem', requireDualAuth, (req, res) => {
  const email = (req.auth.email || '').toLowerCase().trim();
  const walletId = getAiWalletIdFromAuth(req.auth);
  const inputKey = normalizeDopiKey(req.body?.key);

  if (!email && !walletId) {
    return res.status(400).json({ ok: false, error: 'Không xác định được tài khoản.' });
  }
  if (!inputKey) {
    return res.status(400).json({ ok: false, error: 'Vui lòng nhập mã nạp Dopi.' });
  }

  const keys = loadDopiRechargeKeys();
  const keyIndex = keys.findIndex(k => normalizeDopiKey(k.key) === inputKey);
  if (keyIndex === -1) {
    return res.status(404).json({ ok: false, error: 'Mã nạp Dopi không tồn tại.' });
  }

  const keyRecord = keys[keyIndex];
  if (keyRecord.status === 'void') {
    return res.status(400).json({ ok: false, error: 'Mã nạp Dopi này đã bị hủy.' });
  }

  const amount = Number(keyRecord.amountDopi || 0);
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'Mã nạp Dopi không hợp lệ.' });
  }

  const now = new Date().toISOString();
  const alreadyProcessed = Boolean(keyRecord.redeemedAt);
  const remainingDopi = Number.isFinite(Number(keyRecord.remainingDopi))
    ? Math.max(0, Math.min(amount, Math.floor(Number(keyRecord.remainingDopi))))
    : amount;
  const spentDopi = Number.isFinite(Number(keyRecord.spentDopi))
    ? Math.max(0, Math.min(amount, Math.floor(Number(keyRecord.spentDopi))))
    : Math.max(0, amount - remainingDopi);

  keyRecord.status = 'active';
  keyRecord.redeemedAt = keyRecord.redeemedAt || now;
  keyRecord.redeemedByEmail = keyRecord.redeemedByEmail || email || null;
  keyRecord.redeemedByWalletId = keyRecord.redeemedByWalletId || walletId || null;
  keyRecord.customerWalletId = keyRecord.customerWalletId || keyRecord.redeemedByWalletId || walletId || null;
  keyRecord.walletId = keyRecord.walletId || keyRecord.customerWalletId || null;
  keyRecord.remainingDopi = remainingDopi;
  keyRecord.spentDopi = spentDopi;
  keyRecord.updatedAt = now;
  keys[keyIndex] = normalizeDopiKeyRecord(keyRecord);
  saveDopiRechargeKeys(keys);

  res.json({
    ok: true,
    authType: 'dopi',
    balance: remainingDopi,
    walletId: keyRecord.redeemedByWalletId || keyRecord.customerWalletId || keyRecord.walletId || walletId || null,
    key: {
      id: keyRecord.id,
      keyMasked: maskDopiKey(keyRecord.key),
      amountDopi: amount,
      status: 'active',
      validatedAt: keyRecord.redeemedAt,
    },
    wallet: {
      balance: remainingDopi,
      added: 0,
      unit: 'Dopi',
      walletId: keyRecord.redeemedByWalletId || keyRecord.customerWalletId || keyRecord.walletId || walletId || null,
      alreadyProcessed,
    }
  });
});

/**
 * GET /api/auth/check-entitlements
 * Check user entitlements based on Clerk JWT
 * Requires valid Clerk token â€” verifies signature via @clerk/clerk-sdk-node
 */
app.get('/api/auth/check-entitlements', async (req, res) => {
  const authHeader = req.get('Authorization');
  const clerkToken = authHeader?.replace(/^Bearer\s+/i, '');

  if (!clerkToken) {
    return res.json({
      ok: true,
      loggedIn: false,
      email: null,
      entitlements: [],
      activeProducts: [],
      allowedGrades: [],
      message: 'No authentication token provided',
    });
  }

  let verifiedPayload = null;

  if (CLERK_SECRET_KEY) {
    // Production: verify token signature via JWKS
    try {
      verifiedPayload = await verifyClerkToken(clerkToken);
    } catch (verifyErr) {
      console.error('[Auth] Clerk verification failed:', verifyErr.message);
      return res.json({
        ok: true,
        loggedIn: false,
        error: 'Token verification failed â€” ' + verifyErr.message,
      });
    }
  } else {
    // Fallback: basic format validation only (CLERK_SECRET_KEY not configured)
    try {
      const parts = clerkToken.split('.');
      if (parts.length !== 3) {
        return res.json({
          ok: true,
          loggedIn: false,
          error: 'Invalid token format',
        });
      }
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      verifiedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
    } catch {
      return res.json({
        ok: true,
        loggedIn: false,
        error: 'Invalid token payload',
      });
    }
  }

  try {
    const userId = verifiedPayload.sub || verifiedPayload.userId || verifiedPayload.azp;
    // Email must come from verified payload â€” never trust unverified JWT claims
    const email =
      verifiedPayload.email ||
      verifiedPayload.primary_email_address ||
      (verifiedPayload.emails && verifiedPayload.emails[0]?.email);

    if (!userId) {
      return res.json({
        ok: true,
        loggedIn: false,
        error: 'Token missing user ID',
      });
    }

    // Only check licenses/orders if email is present
    let allowedGrades = [];
    let activeProducts = [];
    let hasPendingOrder = false;
    let hasPaidOrder = false;
    let entitlements = [];

    if (email) {
      const licenses = loadLicenses();
      const orders = loadOrders();

      const userLicenses = licenses.filter(l => {
        if (l.customerEmail === email) return true;
        if (l.orderId) {
          const order = orders.find(o => o.orderId === l.orderId);
          if (order?.customerEmail === email) return true;
        }
        return false;
      });

      const activeLicenses = userLicenses.filter(l => {
        if (l.status !== 'active') return false;
        if (l.expiresAt && new Date(l.expiresAt) < new Date()) return false;
        return true;
      });

      allowedGrades = [...new Set(activeLicenses.flatMap(l => l.allowedGrades || []))];
      activeProducts = activeLicenses.map(l => ({
        productId: l.productId,
        productName: l.productName,
        plan: l.plan,
        expiresAt: l.expiresAt,
        activatedGrades: l.activatedGrades || [],
      }));

      const userOrders = orders.filter(o => o.customerEmail === email);
      hasPendingOrder = userOrders.some(o => o.status === 'pending');
      hasPaidOrder = userOrders.some(o => o.status === 'paid');

      entitlements = activeLicenses.map(l => ({
        appId: l.appId,
        productId: l.productId,
        plan: l.plan,
        status: l.status,
        expiresAt: l.expiresAt,
        features: ['study', 'practice', 'progress'],
      }));
    }

    res.json({
      ok: true,
      loggedIn: true,
      userId,
      email: email || null,
      entitlements,
      activeProducts,
      allowedGrades,
      hasPendingOrder,
      hasPaidOrder,
      message: entitlements.length > 0 ? 'Active licenses found' : 'No active licenses',
    });

  } catch (err) {
    console.error('[Auth Check] Error:', err.message);
    return res.json({
      ok: true,
      loggedIn: false,
      error: 'Token processing failed',
    });
  }
});

/**
 * GET /api/products
 * Get all products or single product
 */
app.get('/api/products', (req, res) => {
  const products = loadProducts();
  const { id } = req.query;
  
  if (id) {
    const product = products.find(p => p.id === id);
    if (!product || !product.isActive) {
      return res.status(404).json({ ok: false, error: 'Product not found' });
    }
    return res.json({ ok: true, product });
  }
  
  const activeProducts = products.filter(p => p.isActive !== false);
  res.json({ ok: true, products: activeProducts, count: activeProducts.length });
});

/**
 * POST /api/orders
 * Create a new order
 */
app.post('/api/orders', (req, res) => {
  const { productId, customerEmail, customerName, selectedGrades } = req.body;
  
  if (!productId || !customerEmail) {
    return res.status(400).json({ ok: false, error: 'Missing required fields: productId, customerEmail' });
  }
  
  const products = loadProducts();
  const product = products.find(p => p.id === productId);
  
  if (!product) {
    return res.status(404).json({ ok: false, error: 'Product not found' });
  }
  
  // Validate grade selection for bundle
  if (product.requiresGradeSelection) {
    if (!selectedGrades || !Array.isArray(selectedGrades) || selectedGrades.length !== product.maxGrades) {
      return res.status(400).json({ 
        ok: false, 
        error: `Bundle requires exactly ${product.maxGrades} grades to be selected` 
      });
    }
  }
  
  const orderId = generateOrderId();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
  
  const order = {
    orderId,
    productId: product.id,
    productName: product.name,
    customerEmail,
    customerName: customerName || '',
    amount: product.price,
    currency: product.currency || 'VND',
    status: 'pending',
    selectedGrades: selectedGrades || [],
    paymentMethod: 'bank_transfer',
    paymentRef: null,
    paidAt: null,
    expiresAt,
    createdAt: now,
    updatedAt: now,
    licenseKey: null,
  };
  
  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);
  
  res.json({
    ok: true,
    order: {
      orderId: order.orderId,
      productName: order.productName,
      amount: order.amount,
      status: order.status,
      expiresAt: order.expiresAt,
      createdAt: order.createdAt,
    },
    paymentInfo: {
      method: 'bank_transfer',
      bank: 'ACB',
      accountNumber: '49312517',
      accountName: 'KHUONG VAN BINH',
      transferContent: orderId,
      amount: product.price,
    },
  });
});

/**
 * GET /api/orders/:orderId
 * Get order details
 */
app.get('/api/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  const orders = loadOrders();
  const order = orders.find(o => o.orderId === orderId);
  
  if (!order) {
    return res.status(404).json({ ok: false, error: 'Order not found' });
  }
  
  // Don't expose license key in response - only show if it exists
  const safeOrder = {
    ...order,
    licenseKey: order.licenseKey ? '***-' + order.licenseKey.slice(-4) : null,
  };
  
  res.json({ ok: true, order: safeOrder });
});

/**
 * POST /api/licenses/activate
 * Activate a license key (for desktop and web)
 */
app.post('/api/licenses/activate', (req, res) => {
  const { licenseKey, appId, deviceId, deviceName } = req.body;
  
  if (!licenseKey || !appId || !deviceId) {
    return res.status(400).json({ 
      ok: false, 
      error: 'Missing required fields: licenseKey, appId, deviceId' 
    });
  }
  
  const licenses = loadLicenses();
  const license = licenses.find(l => l.licenseKey === licenseKey.toUpperCase());
  
  if (!license) {
    return res.status(404).json({ ok: false, status: 'invalid', error: 'Key không hợp lệ' });
  }
  
  if (license.status === 'expired') {
    return res.status(400).json({ ok: false, status: 'expired', error: 'Key đã hết hạn' });
  }
  
  if (license.status === 'revoked') {
    return res.status(400).json({ ok: false, status: 'revoked', error: 'Key đã bị thu hồi' });
  }
  
  if (!isLicenseAppCompatible(license, appId)) {
    return res.status(403).json({
      ok: false,
      status: 'app_mismatch',
      error: 'Key này không thuộc ứng dụng đang mở'
    });
  }
  
  // Check device limit
  const activations = loadActivations();
  const activeDevices = activations.filter(a => 
    a.licenseKey === licenseKey.toUpperCase() && a.isActive
  );
  
  const deviceExists = activeDevices.find(d => d.deviceId === deviceId);
  
  // For web apps: allow same device to re-activate
  // For desktop: device is locked to first activation
  if (!deviceExists && activeDevices.length >= license.deviceLimit) {
    return res.status(403).json({ 
      ok: false, 
      status: 'device_limit_exceeded', 
      error: 'Key đã vượt số thiết bị cho phép' 
    });
  }
  
  // Record or update activation
  const now = new Date().toISOString();
  const existingActivation = activations.find(a => 
    a.licenseKey === licenseKey.toUpperCase() && a.deviceId === deviceId
  );
  
  if (existingActivation) {
    existingActivation.lastSeenAt = now;
    existingActivation.isActive = true;
  } else {
    activations.push({
      activationId: crypto.randomUUID(),
      licenseKey: licenseKey.toUpperCase(),
      deviceId,
      deviceName: deviceName || 'Unknown Device',
      appId,
      ipAddress: req.ip,
      activatedAt: now,
      lastSeenAt: now,
      isActive: true,
    });
  }
  
  saveActivations(activations);
  
  // Update license last verified
  license.lastVerifiedAt = now;
  saveLicenses(licenses);
  
  // Calculate offline grace period (7 days)
  const offlineValidUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  res.json({
    ok: true,
    status: 'active',
    entitlement: {
      appId: license.appId,
      productId: license.productId,
      productName: license.productName,
      plan: license.plan,
      status: license.status,
      allowedGrades: license.allowedGrades,
      activatedGrades: license.activatedGrades || [],
      features: {
        desktopOfflineTts: true,
        downloadByGrade: true,
        downloadAllGrades: license.allowedGrades.length >= 3,
        aiTutor: false,
      },
      license: {
        deviceLimit: license.deviceLimit,
        offlineGraceDays: 7,
        expiresAt: license.expiresAt,
      },
    },
    offlineValidUntil,
    serverTime: now,
  });
});

/**
 * POST /api/licenses/verify
 * Verify a license key
 */
app.post('/api/licenses/verify', (req, res) => {
  const { licenseKey, deviceId, appId } = req.body;
  
  if (!licenseKey || !deviceId) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }
  
  const licenses = loadLicenses();
  const license = licenses.find(l => l.licenseKey === licenseKey.toUpperCase());
  
  if (!license) {
    return res.json({ ok: false, status: 'invalid', error: 'Key không hợp lệ' });
  }
  
  if (license.status === 'expired') {
    return res.json({ ok: false, status: 'expired', error: 'Key đã hết hạn' });
  }
  
  if (license.status === 'revoked') {
    return res.json({ ok: false, status: 'revoked', error: 'Key đã bị thu hồi' });
  }
  
  if (appId && !isLicenseAppCompatible(license, appId)) {
    return res.json({
      ok: false,
      status: 'app_mismatch',
      error: 'Key này không thuộc ứng dụng đang mở'
    });
  }
  
  // Check if device is registered
  const activations = loadActivations();
  const deviceActivation = activations.find(a => 
    a.licenseKey === licenseKey.toUpperCase() && 
    a.deviceId === deviceId && 
    a.isActive
  );
  
  if (!deviceActivation) {
    return res.json({ ok: false, status: 'device_not_activated', error: 'Thiết bị chưa được kích hoạt' });
  }
  
  // Update last seen
  const now = new Date().toISOString();
  deviceActivation.lastSeenAt = now;
  saveActivations(activations);
  
  license.lastVerifiedAt = now;
  saveLicenses(licenses);
  
  const offlineValidUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  res.json({
    ok: true,
    status: 'active',
    entitlement: {
      appId: license.appId,
      productId: license.productId,
      productName: license.productName,
      plan: license.plan,
      status: license.status,
      allowedGrades: license.allowedGrades,
      activatedGrades: license.activatedGrades || [],
      features: {
        desktopOfflineTts: true,
        downloadByGrade: true,
        downloadAllGrades: license.allowedGrades.length >= 3,
        aiTutor: false,
      },
      license: {
        deviceLimit: license.deviceLimit,
        offlineGraceDays: 7,
        expiresAt: license.expiresAt,
      },
    },
    offlineValidUntil,
    serverTime: now,
  });
});

/**
 * ============================================
 * AI CHAT API
 * ============================================
 */

const getSystemPromptForMode = (mode) => {
  switch (mode) {
    case 'chat':
      return 'Bạn là một trợ lý AI hữu ích.';
    case 'sales_support': {
      // Inject shortened product list
      const products = loadProducts()
        .filter(p => p.type !== 'ai_credit' || isSystemAiCreditProductId(p.id || p.productId))
        .map(p => ({
        id: p.id || p.productId,
        name: p.name,
        price: p.price,
        appUrl: resolveProductAppId(p) ? resolveAppUrl(resolveProductAppId(p), p.id || p.productId) : undefined,
        credits: p.credits
      }));
      
      const productInfo = JSON.stringify(products);
      
      return `Bạn là nhân viên hỗ trợ chính thức của Học Hứng Khởi.
Tuyệt đối không tự xưng là Claude, Gemini, OpenAI hay bất kỳ tên model nào.
Chỉ nói rằng bạn là nhân viên hỗ trợ hoặc trợ lý hỗ trợ của Học Hứng Khởi.

Bạn chỉ tư vấn về gói học, thanh toán, kích hoạt key, tài khoản, app Cấp 01 và app Lớp 6.
Thông tin lớp học cần nhớ:
- App Cấp 01: hỗ trợ các lớp Lá, lớp 1, lớp 2, lớp 3, lớp 4, lớp 5.
- App Lớp 06: chỉ dành cho lớp 6.
- Lớp 7 đến 12 chưa mở trong hệ thống hiện tại.

Trả lời ngắn, rõ, thân thiện, như một nhân viên hỗ trợ thật.
Không bịa giá/gói học. Chỉ dùng dữ liệu sản phẩm được cung cấp sau:
${productInfo}

Nếu câu hỏi ngoài phạm vi, hãy từ chối ngắn và hướng người dùng về hỗ trợ Học Hứng Khởi.
Nếu người dùng hỏi bạn là ai, hãy trả lời rằng bạn là nhân viên hỗ trợ của Học Hứng Khởi, không nhắc đến model AI.`;
    }
    // TODO: Add prompts for other modes
    case 'explain_question':
    case 'explain_lesson':
    case 'generate_practice':
    default:
      return 'Bạn là một trợ lý AI hữu ích.';
  }
}

const getMaxTokensForMode = (mode) => {
  switch (mode) {
    case 'chat': return AI_MAX_TOKENS_SALES;
    case 'sales_support': return AI_MAX_TOKENS_SALES;
    case 'explain_question': return AI_MAX_TOKENS_EXPLAIN;
    case 'explain_lesson': return AI_MAX_TOKENS_LESSON;
    case 'generate_practice': return AI_MAX_TOKENS_PRACTICE;
    default: return AI_MAX_TOKENS_SALES;
  }
}

async function callWebSupportAiProvider({ providerType, provider, messages, systemPrompt, sessionId }) {
  const activeProvider = normalizeWebSupportProviderType(providerType || 'gemini');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    if (activeProvider === 'gemini') {
      if (!provider?.apiKey) {
        return { ok: false, status: 500, error: 'Gemini API key not configured.' };
      }

      const baseUrl = provider.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
      const model = provider.model || 'gemini-2.0-flash';
      const contents = messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${provider.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          ok: false,
          status: response.status,
          error: 'Gemini API returned an error.',
          details: errorText.slice(0, 200)
        };
      }

      const geminiData = await response.json();
      return {
        ok: true,
        response: {
          choices: [{
            message: {
              role: 'assistant',
              content: geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response'
            }
          }],
          usage: {
            prompt_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
            completion_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: geminiData.usageMetadata?.totalTokenCount || 0
          }
        }
      };
    }

    if (activeProvider === 'vertex_gemini') {
      const derivedProjectId = extractServiceAccountProjectId(provider?.credentialsJson || '');
      const projectId = String(provider?.projectId || '').trim() || derivedProjectId;
      const location = String(provider?.location || '').trim();
      const credentialsJson = String(provider?.credentialsJson || '').trim();
      const model = String(provider?.model || '').trim() || 'gemini-2.0-flash';

      if (!projectId || !location || !credentialsJson) {
        return { ok: false, status: 500, error: 'Vertex Gemini config is incomplete.' };
      }

      const baseUrl = getWebSupportProviderBaseUrl(activeProvider, provider.baseUrl);
      const modelResource = getWebSupportProviderModelResource({
        providerType: activeProvider,
        projectId,
        location,
        model,
      });
      const accessToken = await getAccessTokenFromServiceAccountJson(credentialsJson, controller.signal);
      const contents = messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const response = await fetch(`${baseUrl}/${modelResource}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          ok: false,
          status: response.status,
          error: 'Vertex Gemini API returned an error.',
          details: errorText.slice(0, 300)
        };
      }

      const vertexData = await response.json();
      const assistantText = extractAssistantTextFromVertexResponse(vertexData) || 'No response';
      return {
        ok: true,
        response: {
          choices: [{
            message: {
              role: 'assistant',
              content: assistantText
            }
          }],
          usage: {
            prompt_tokens: vertexData.usageMetadata?.promptTokenCount || 0,
            completion_tokens: vertexData.usageMetadata?.candidatesTokenCount || 0,
            total_tokens: vertexData.usageMetadata?.totalTokenCount || 0
          }
        }
      };
    }

    if (activeProvider === 'dialogflow_cx') {
      const derivedProjectId = extractServiceAccountProjectId(provider?.credentialsJson || '');
      const projectId = String(provider?.projectId || '').trim() || derivedProjectId;
      const location = String(provider?.location || '').trim() || 'global';
      const credentialsJson = String(provider?.credentialsJson || '').trim();
      const agentId = String(provider?.model || '').trim();
      const languageCode = String(provider?.languageCode || '').trim() || 'vi';
      const safeSessionId = String(sessionId || '').trim() || `web-support-${Date.now().toString(36)}`;

      if (!projectId || !location || !agentId || !credentialsJson) {
        return { ok: false, status: 500, error: 'Dialogflow CX config is incomplete.' };
      }

      const baseUrl = getWebSupportProviderBaseUrl(activeProvider, provider.baseUrl);
      const agentResource = getWebSupportProviderModelResource({
        providerType: activeProvider,
        projectId,
        location,
        model: agentId,
      });
      const accessToken = await getAccessTokenFromServiceAccountJson(credentialsJson, controller.signal);
      const response = await fetch(`${baseUrl}/${agentResource}/sessions/${encodeURIComponent(safeSessionId)}:detectIntent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          queryInput: {
            text: {
              text: [...messages].reverse().find((m) => m.role === 'user' && typeof m.content === 'string')?.content || messages[messages.length - 1]?.content || '',
            },
            languageCode,
          },
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          ok: false,
          status: response.status,
          error: 'Dialogflow CX API returned an error.',
          details: errorText.slice(0, 500),
        };
      }

      const dialogflowData = await response.json();
      const assistantText = extractAssistantTextFromDialogflowResponse(dialogflowData) || 'Mình chưa có câu trả lời phù hợp cho câu hỏi này. Bạn thử hỏi lại ngắn gọn giúp mình nhé.';
      return {
        ok: true,
        response: {
          choices: [{
            message: {
              role: 'assistant',
              content: assistantText
            }
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        }
      };
    }

    if (activeProvider === 'google_agent_search') {
      const derivedProjectId = extractServiceAccountProjectId(provider?.credentialsJson || '');
      const projectId = String(provider?.projectId || '').trim() || derivedProjectId;
      const location = String(provider?.location || '').trim() || 'global';
      const credentialsJson = String(provider?.credentialsJson || '').trim();
      const engineId = String(provider?.model || '').trim();
      const servingConfigId = String(provider?.servingConfigId || '').trim() || 'default_serving_config';

      if (!projectId || !location || !engineId || !credentialsJson) {
        return { ok: false, status: 500, error: 'Agent Search config is incomplete.' };
      }

      const baseUrl = getWebSupportProviderBaseUrl(activeProvider, provider.baseUrl);
      const servingConfigResource = getWebSupportProviderModelResource({
        providerType: activeProvider,
        projectId,
        location,
        model: engineId,
        servingConfigId,
      });
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user' && typeof m.content === 'string') || messages[messages.length - 1];
      const accessToken = await getAccessTokenFromServiceAccountJson(credentialsJson, controller.signal);
      const response = await fetch(`${baseUrl}/${servingConfigResource}:answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: {
            text: lastUserMessage?.content || '',
          },
          userPseudoId: 'web-support-user',
          answerGenerationSpec: {
            includeCitations: true,
            promptSpec: systemPrompt ? {
              preamble: systemPrompt,
            } : undefined,
          },
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          ok: false,
          status: response.status,
          error: 'Discovery Engine API returned an error.',
          details: errorText.slice(0, 500),
        };
      }

      const agentData = await response.json();
      const rawAssistantText = extractAssistantTextFromDiscoveryEngineResponse(agentData);
      const assistantText = rawAssistantText && !/A summary could not be generated/i.test(rawAssistantText)
        ? rawAssistantText
        : 'Hiện bot chưa tìm được câu trả lời chắc chắn. Bạn hỏi lại về gói học, thanh toán, kích hoạt key hoặc Dopi AI nhé.';
      return {
        ok: true,
        response: {
          choices: [{
            message: {
              role: 'assistant',
              content: assistantText
            }
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        }
      };
    }

    if (activeProvider === 'openai_compatible' || activeProvider === 'claude') {
      if (!provider?.baseUrl) {
        return { ok: false, status: 500, error: 'AI provider baseUrl not configured.' };
      }

      const history = messages.slice(0, -1).slice(-AI_MAX_HISTORY_MESSAGES);
      const requestPayload = {
        model: provider.model || AI_MODEL_FAST,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          messages[messages.length - 1],
        ],
        max_tokens: AI_MAX_TOKENS_SALES,
        stream: false,
      };

      const baseUrl = provider.baseUrl.replace(/\/$/, '');
      const authHeader = provider.authToken
        ? `Bearer ${provider.authToken}`
        : (provider.apiKey ? `Bearer ${provider.apiKey}` : '');

      const chatEndpoints = [
        `${baseUrl}/chat/completions`,
        `${baseUrl}/v1/chat/completions`,
      ];

      let lastProviderError = null;

      for (const endpoint of chatEndpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeader,
            },
            body: JSON.stringify(requestPayload),
            signal: controller.signal
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            lastProviderError = {
              endpoint,
              status: response.status,
              bodyPreview: errorText.slice(0, 200),
            };
            continue;
          }

          const responseText = await response.text();
          try {
            const aiResponse = JSON.parse(responseText);
            return { ok: true, response: aiResponse };
          } catch (parseErr) {
            lastProviderError = {
              endpoint,
              status: response.status,
              bodyPreview: responseText.slice(0, 200),
              parseError: parseErr.message,
            };
            continue;
          }
        } catch (requestErr) {
          lastProviderError = {
            endpoint,
            name: requestErr?.name || 'Error',
            message: requestErr?.message || String(requestErr),
          };
        }
      }

      return {
        ok: false,
        status: 502,
        error: 'Internal server error calling AI provider.',
        details: lastProviderError || null
      };
    }

    return { ok: false, status: 501, error: `Unsupported support provider: ${activeProvider}` };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, status: 504, error: 'Request to AI provider timed out.' };
    }
    return { ok: false, status: 500, error: error?.message || 'Internal server error calling AI provider.' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * POST /api/ai/chat
 * AI Proxy Endpoint with capacity check, deduct, and dynamic provider routing.
 * Supports dual auth: Clerk JWT (Web) or X-License-Key header (Desktop Apps).
 */
app.post('/api/ai/chat', requireDualAuth, async (req, res) => {
  const { email, authType, licenseKey } = req.auth;
  const walletId = getAiWalletIdFromAuth(req.auth);
  const { messages, mode = 'chat' } = req.body || {};
  const shouldChargeCapacity = mode !== 'sales_support';

  if (!walletId) {
    return res.status(400).json({ ok: false, error: 'Cannot identify user. Wallet ID not found in token or license.' });
  }

  const normalizedEmail = String(email || '').toLowerCase().trim();
  const { wallets } = loadAiCapacityWallets();
  const wallet = findAiWallet(wallets, walletId, normalizedEmail);
  let balance = wallet ? Number(wallet.balance || 0) : 0;
  let dopiKeyRecord = null;
  let dopiKeyBalance = null;
  if (shouldChargeCapacity && authType === 'dopi' && req.auth?.dopiKey) {
    seedDopiKeyQuotasForWallet(walletId, normalizedEmail);
    dopiKeyRecord = findDopiKeyRecordByKey(req.auth.dopiKey);
    if (!dopiKeyRecord) {
      return res.status(401).json({ ok: false, error: 'Invalid Dopi key' });
    }
    dopiKeyBalance = getDopiKeyRemainingAmount(dopiKeyRecord);
    balance = Number(dopiKeyBalance || 0);
  }
  const availableBalance = balance;
  const aiConfig = loadAiProviders();
  const activeProvider = aiConfig.activeProvider || 'claude';
  const provider = aiConfig.providers?.[activeProvider];
  const pricingConfig = normalizeAiPricingConfig(aiConfig.pricing || getDefaultAiPricingConfig());
  const pricingTaskKey = getAiPricingTaskKey(mode);
  const pricingTask = pricingConfig.tasks?.[pricingTaskKey] || pricingConfig.tasks?.chat || getDefaultAiPricingConfig().tasks.chat;

  // sales_support is the public support widget, so it should not be blocked
  // by AI capacity. Paid tutoring / generation modes still remain gated.
  if (shouldChargeCapacity && availableBalance <= 0) {
    return res.status(403).json({
      ok: false,
      error: authType === 'dopi' && Number.isFinite(Number(dopiKeyBalance)) && Number(dopiKeyBalance) <= 0
        ? 'Dopi key này đã hết. Vui lòng nạp key khác.'
        : 'Bạn đã hết Dopi. Vui lòng nạp thêm Dopi tại hochungkhoi.site.',
      code: 'INSUFFICIENT_BALANCE',
      balance: 0
    });
  }

  if (!provider || !provider.enabled) {
    return res.status(503).json({ ok: false, error: `AI provider '${activeProvider}' is not configured or disabled.` });
  }

  // --- Step 3: Validate Request ---
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: 'Invalid messages format.' });
  }

  const userMessage = messages[messages.length - 1];
  if (userMessage.role !== 'user' || typeof userMessage.content !== 'string') {
    return res.status(400).json({ ok: false, error: 'Invalid last message.' });
  }

  if (userMessage.content.length > AI_MAX_USER_CHARS) {
    return res.status(413).json({ ok: false, error: `Input exceeds maximum length of ${AI_MAX_USER_CHARS} characters.` });
  }

  const rawMessages = messages;
  const hasClientSystemPrompt = rawMessages[0]?.role === 'system' && typeof rawMessages[0]?.content === 'string';
  const clientSystemPrompt = hasClientSystemPrompt ? String(rawMessages[0].content || '').trim() : '';
  const conversationMessages = hasClientSystemPrompt ? rawMessages.slice(1) : rawMessages;
  const effectiveSystemPrompt = clientSystemPrompt || getSystemPromptForMode(mode);
  const estimatedUsage = estimateUsageFromMessages(conversationMessages, '', effectiveSystemPrompt);
  const estimatedMaxUsage = {
    prompt_tokens: estimatedUsage.prompt_tokens,
    completion_tokens: getMaxTokensForMode(mode),
    total_tokens: estimatedUsage.prompt_tokens + getMaxTokensForMode(mode),
  };
  const estimatedCalculatedDopi = shouldChargeCapacity && pricingConfig.enabled !== false
    ? calculateRawDopiFromUsage(estimatedMaxUsage, pricingTask)
    : 0;
  const estimatedCharge = shouldChargeCapacity && pricingConfig.enabled !== false
    ? calculateChargedDopiFromUsage(estimatedMaxUsage, pricingTask)
    : 1;

  if (shouldChargeCapacity && pricingConfig.enabled !== false && availableBalance < estimatedCharge) {
    return res.status(403).json({
      ok: false,
      error: authType === 'dopi' && Number.isFinite(Number(dopiKeyBalance))
        ? 'Dopi key này không đủ Dopi để dùng AI.'
        : 'Bạn không đủ Dopi để dùng AI. Vui lòng nạp thêm Dopi tại hochungkhoi.site.',
      code: 'INSUFFICIENT_BALANCE',
      balance: availableBalance,
      requiredBalance: estimatedCharge,
      estimated: {
        mode,
        provider: activeProvider,
      }
    });
  }

  // --- Step 4: Route to Active Provider ---
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    let aiResponse;

    if (activeProvider === 'claude' || activeProvider === 'openai_compatible') {
      // Claude / OpenAI Compatible API
      if (!provider.baseUrl) {
        return res.status(500).json({ ok: false, error: 'AI provider baseUrl not configured.' });
      }

      const history = conversationMessages.slice(0, -1).slice(-AI_MAX_HISTORY_MESSAGES);

      const requestPayload = {
        model: provider.model || AI_MODEL_FAST,
        messages: [
          { role: 'system', content: effectiveSystemPrompt },
          ...history,
          userMessage
        ],
        max_tokens: getMaxTokensForMode(mode),
        stream: false,
      };

      const baseUrl = provider.baseUrl.replace(/\/$/, '');
      const authHeader = provider.authToken
        ? `Bearer ${provider.authToken}`
        : (AI_API_KEY ? `Bearer ${AI_API_KEY}` : '');

      const chatEndpoints = [
        `${baseUrl}/chat/completions`,
        `${baseUrl}/v1/chat/completions`,
      ];

      let lastProviderError = null;

      for (const endpoint of chatEndpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeader,
            },
            body: JSON.stringify(requestPayload),
            signal: controller.signal
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            lastProviderError = {
              endpoint,
              status: response.status,
              bodyPreview: errorText.slice(0, 200),
            };
            console.error(`[AI] API Error: HTTP ${response.status}. Endpoint: ${endpoint}`);
            continue;
          }

          const responseText = await response.text();
          try {
            aiResponse = JSON.parse(responseText);
            break;
          } catch (parseErr) {
            lastProviderError = {
              endpoint,
              status: response.status,
              bodyPreview: responseText.slice(0, 200),
              parseError: parseErr.message,
            };
            console.error('[AI] Provider returned non-JSON response:', {
              endpoint,
              message: parseErr.message,
            });
            continue;
          }
        } catch (requestErr) {
          lastProviderError = {
            endpoint,
            name: requestErr?.name || 'Error',
            message: requestErr?.message || String(requestErr),
          };
          console.error('[AI] Internal request error:', {
            endpoint,
            name: requestErr?.name || 'Error',
            message: requestErr?.message || String(requestErr),
          });
        }
      }

      if (!aiResponse) {
        return res.status(502).json({
          ok: false,
          error: 'Internal server error calling AI provider.',
          details: lastProviderError || null
        });
      }

    } else if (activeProvider === 'gemini') {
      // Google Gemini API
      if (!provider.apiKey) {
        return res.status(500).json({ ok: false, error: 'Gemini API key not configured.' });
      }

      const baseUrl = provider.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
      const model = provider.model || 'gemini-2.0-flash';

      // Convert messages to Gemini format
      const contents = conversationMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${provider.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: effectiveSystemPrompt }] },
          contents
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[AI] Gemini API Error: HTTP ${response.status}`);
        return res.status(response.status).json({ ok: false, error: 'Gemini API returned an error.' });
      }

      const geminiData = await response.json();
      
      // Convert Gemini response to OpenAI-compatible format
      aiResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response'
          }
        }],
        usage: {
          prompt_tokens: geminiData.usageMetadata?.promptTokenCount || 0,
          completion_tokens: geminiData.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: geminiData.usageMetadata?.totalTokenCount || 0
        }
      };

    } else if (activeProvider === 'vertex') {
      // Google Vertex AI via service account JSON
      const derivedProjectId = extractServiceAccountProjectId(provider?.credentialsJson || '');
      const projectId = String(provider?.projectId || '').trim() || derivedProjectId;
      const location = String(provider?.location || '').trim();
      const credentialsJson = String(provider?.credentialsJson || '').trim();
      const model = String(provider?.model || '').trim() || 'gemini-2.5-flash';

      if (!projectId || !location || !credentialsJson || !model) {
        return res.status(500).json({ ok: false, error: 'Vertex AI config is incomplete.' });
      }

      const baseUrl = String(provider?.baseUrl || 'https://aiplatform.googleapis.com/v1').trim().replace(/\/$/, '');
      const accessToken = await getAccessTokenFromServiceAccountJson(credentialsJson, controller.signal);
      const contents = conversationMessages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));
      const modelResource = getVertexPublisherModelResource({
        projectId,
        location,
        model,
      });

      const response = await fetch(`${baseUrl}/${modelResource}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: effectiveSystemPrompt }] },
          contents,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return res.status(response.status).json({
          ok: false,
          error: 'Vertex AI provider returned an error.',
          details: errorText.slice(0, 300)
        });
      }

      const vertexData = await response.json();
      aiResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: extractAssistantTextFromVertexResponse(vertexData) || 'No response'
          }
        }],
        usage: {
          prompt_tokens: vertexData.usageMetadata?.promptTokenCount || 0,
          completion_tokens: vertexData.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: vertexData.usageMetadata?.totalTokenCount || 0
        }
      };
    } else if (activeProvider === 'google_agent_search') {
      const derivedProjectId = extractServiceAccountProjectId(provider?.credentialsJson || '');
      const projectId = String(provider?.projectId || '').trim() || derivedProjectId;
      const location = String(provider?.location || '').trim() || 'global';
      const credentialsJson = String(provider?.credentialsJson || '').trim();
      const engineId = String(provider?.model || '').trim();
      const servingConfigId = String(provider?.servingConfigId || '').trim() || 'default_serving_config';
      const baseUrl = String(provider?.baseUrl || 'https://discoveryengine.googleapis.com/v1').trim().replace(/\/$/, '');

      if (!projectId || !location || !credentialsJson || !engineId) {
        return res.status(500).json({ ok: false, error: 'Google Search / Sales Bot config is incomplete.' });
      }

      const accessToken = await getAccessTokenFromServiceAccountJson(credentialsJson, controller.signal);
      const lastUserMessage = [...conversationMessages].reverse().find((m) => m.role === 'user' && typeof m.content === 'string') || conversationMessages[conversationMessages.length - 1];
      const engineResource = `projects/${projectId}/locations/${location}/collections/default_collection/engines/${engineId}/servingConfigs/${servingConfigId}`;
      const response = await fetch(`${baseUrl}/${engineResource}:answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: {
            text: lastUserMessage?.content || '',
          },
          answerGenerationSpec: {
            includeCitations: true,
            promptSpec: effectiveSystemPrompt ? {
              preamble: effectiveSystemPrompt,
            } : undefined,
          },
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return res.status(response.status).json({
          ok: false,
          error: 'Google Search / Sales Bot API returned an error.',
          bodyPreview: errorText.slice(0, 500)
        });
      }

      const agentData = await response.json();
      aiResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: extractAssistantTextFromDiscoveryEngineResponse(agentData) || 'Không tìm được câu trả lời phù hợp.'
          }
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
    } else if (activeProvider === 'dialogflow_cx') {
      const derivedProjectId = extractServiceAccountProjectId(provider?.credentialsJson || '');
      const projectId = String(provider?.projectId || '').trim() || derivedProjectId;
      const location = String(provider?.location || '').trim() || 'global';
      const credentialsJson = String(provider?.credentialsJson || '').trim();
      const agentId = String(provider?.model || '').trim();
      const languageCode = String(provider?.languageCode || '').trim() || 'vi';
      const baseUrl = String(provider?.baseUrl || 'https://dialogflow.googleapis.com/v3').trim().replace(/\/$/, '');

      if (!projectId || !location || !credentialsJson || !agentId) {
        return res.status(500).json({ ok: false, error: 'Google Chat / Dopi Gia Su config is incomplete.' });
      }

      const accessToken = await getAccessTokenFromServiceAccountJson(credentialsJson, controller.signal);
      const lastUserMessage = [...conversationMessages].reverse().find((m) => m.role === 'user' && typeof m.content === 'string') || conversationMessages[conversationMessages.length - 1];
      const sessionIdValue = String(req.body?.sessionId || req.body?.conversationId || walletId || normalizedEmail || `sales-${Date.now().toString(36)}`).trim();
      const safeSessionId = sessionIdValue.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
      const response = await fetch(`${baseUrl}/projects/${projectId}/locations/${location}/agents/${agentId}/sessions/${encodeURIComponent(safeSessionId || `sales-${Date.now().toString(36)}`)}:detectIntent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          queryInput: {
            text: {
              text: lastUserMessage?.content || '',
            },
            languageCode,
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return res.status(response.status).json({
          ok: false,
          error: 'Google Chat / Dopi Gia Su API returned an error.',
          bodyPreview: errorText.slice(0, 500)
        });
      }

      const dialogflowData = await response.json();
      aiResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: extractAssistantTextFromDialogflowResponse(dialogflowData) || 'Không tìm được câu trả lời phù hợp.'
          }
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
        } else {
      return res.status(501).json({ ok: false, error: `Unknown AI provider: ${activeProvider}` });
    }

    const assistantText = aiResponse?.choices?.[0]?.message?.content || '';
    const normalizedUsage = normalizeUsageBreakdown(aiResponse?.usage);
    const usageForBilling = normalizedUsage.total_tokens > 0
      ? normalizedUsage
      : estimateUsageFromMessages(conversationMessages, assistantText, effectiveSystemPrompt);
    const calculatedDopi = shouldChargeCapacity && pricingConfig.enabled !== false
      ? calculateRawDopiFromUsage(usageForBilling, pricingTask)
      : 0;
    const chargedDopi = shouldChargeCapacity && pricingConfig.enabled !== false
      ? calculateChargedDopiFromUsage(usageForBilling, pricingTask)
      : 0;

    // --- Step 5: Deduct Balance (paid modes only) ---
    let deductResult = { success: true, newBalance: balance, deductedAmount: 0 };
    if (shouldChargeCapacity) {
      const chargeAmount = Math.max(0, Math.min(availableBalance, chargedDopi));
      deductResult = chargeAmount > 0
        ? deductAiCapacity(walletId, chargeAmount, {
          mode,
          billingTask: pricingTaskKey,
          provider: activeProvider,
          authType,
          licenseKey: licenseKey || null,
          dopiKey: req.auth?.dopiKey || null,
          dopiKeyId: dopiKeyRecord?.id || null,
          dopiKeyBalanceBefore: Number.isFinite(Number(dopiKeyBalance)) ? Number(dopiKeyBalance) : null,
          usage: usageForBilling,
          pricing: pricingTask,
          dopiValueVnd: pricingConfig.dopiValueVnd,
          estimatedCalculatedDopi,
          estimatedCharge,
          calculatedDopi,
          chargedDopi,
          chargeAmount,
        }, normalizedEmail || null)
        : {
          success: true,
          newBalance: balance,
          deductedAmount: 0
        };

      if (!deductResult.success) {
        // This shouldn't happen since we checked balance, but handle gracefully
        console.error('[AI] Failed to deduct balance:', deductResult.reason);
      }
    }

    // --- Step 6: Log and Return ---
    const logData = {
      mode,
      billingTask: pricingTaskKey,
      provider: activeProvider,
      authType,
      email: normalizedEmail.substring(0, 3) + '***@***.com', // Mask email for privacy
      balanceBefore: balance,
      estimatedCalculatedDopi,
      estimatedCharge,
      calculatedDopi,
      chargedDopi,
      balanceAfter: deductResult.newBalance ?? balance,
      inputChars: userMessage.content.length,
      usage: usageForBilling
    };
    console.log('[AI Chat]', JSON.stringify(logData));

    res.json({
      ok: true,
      response: aiResponse,
      billing: {
        mode,
        billingTask: pricingTaskKey,
        usage: usageForBilling,
        unit: 'Dopi',
        dopiValueVnd: pricingConfig.dopiValueVnd,
        estimatedCalculatedDopi,
        estimatedCharge,
        calculatedDopi,
        chargedDopi,
        pricing: pricingTask
      },
      balance: {
        before: balance,
        after: shouldChargeCapacity ? (deductResult.newBalance ?? balance) : balance,
        deducted: shouldChargeCapacity ? (deductResult.deductedAmount ?? chargedDopi) : 0,
        unit: 'Dopi'
      }
    });

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error(`[AI] Request timed out after ${AI_TIMEOUT_MS}ms`);
      return res.status(504).json({ ok: false, error: 'Request to AI provider timed out.' });
    } else {
      console.error('[AI] Internal request error:', { name: error.name, message: error.message });
      return res.status(500).json({ ok: false, error: 'Internal server error calling AI provider.' });
    }
  }
});

/**
 * POST /api/web-support/chat
 * Public support chat for the website home page.
 * No quota. Logs every turn and optionally notifies Telegram.
 */
app.post('/api/web-support/chat', async (req, res) => {
  try {
    const supportConfig = loadWebSupportConfig();
    if (!supportConfig.enabled) {
      return res.status(503).json({ ok: false, error: 'Web support bot is disabled.' });
    }

    const {
      messages,
      sessionId = null,
      visitorName = null,
      visitorEmail = null,
      pageUrl = null,
      source = 'web-home',
    } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'Invalid messages format.' });
    }

    const userMessage = messages[messages.length - 1];
    if (userMessage.role !== 'user' || typeof userMessage.content !== 'string') {
      return res.status(400).json({ ok: false, error: 'Invalid last message.' });
    }

    if (userMessage.content.length > AI_MAX_USER_CHARS) {
      return res.status(413).json({ ok: false, error: `Input exceeds maximum length of ${AI_MAX_USER_CHARS} characters.` });
    }

    const normalizedMessage = normalizeWhitespace(userMessage.content);
    const supportMessages = messages.slice(0, -1).slice(-AI_MAX_HISTORY_MESSAGES);
    const systemPrompt = supportConfig.systemPrompt || getDefaultWebSupportConfig().systemPrompt;
    const supportHasOwnCredentials = (() => {
      const providerType = normalizeWebSupportProviderType(supportConfig.providerType || 'gemini');
      const apiKey = String(supportConfig.apiKey || '').trim();
      const authToken = String(supportConfig.authToken || '').trim();
      const credentialsJson = String(supportConfig.credentialsJson || '').trim();
      const derivedProjectId = extractServiceAccountProjectId(credentialsJson);
      const projectId = String(supportConfig.projectId || '').trim() || derivedProjectId;
      const location = String(supportConfig.location || '').trim();
      const baseUrl = String(supportConfig.baseUrl || '').trim();

      if (providerType === 'gemini') {
        return Boolean(apiKey);
      }
      if (providerType === 'vertex_gemini' || providerType === 'dialogflow_cx' || providerType === 'google_agent_search') {
        return Boolean(projectId && location && (authToken || credentialsJson));
      }
      if (providerType === 'openai_compatible') {
        return Boolean(baseUrl && authToken);
      }
      return Boolean(baseUrl || authToken || apiKey);
    })();

    if (!supportHasOwnCredentials) {
      return res.status(503).json({
        ok: false,
        error: 'Hiện các nhân viên đang bận, vui lòng gọi lại sau.',
        details: { reason: 'Web support AI is not configured.' },
      });
    }

    const finalProviderResult = await callWebSupportAiProvider({
      providerType: supportConfig.providerType,
      provider: {
        ...supportConfig,
        providerType: supportConfig.providerType,
        baseUrl: supportConfig.baseUrl || (supportConfig.providerType === 'gemini'
          ? 'https://generativelanguage.googleapis.com/v1beta'
          : (supportConfig.providerType === 'dialogflow_cx'
            ? 'https://dialogflow.googleapis.com/v3'
            : (supportConfig.providerType === 'google_agent_search'
              ? 'https://discoveryengine.googleapis.com/v1'
              : 'https://aiplatform.googleapis.com/v1'))),
        apiKey: supportConfig.apiKey || '',
        authToken: supportConfig.authToken || '',
        credentialsJson: supportConfig.credentialsJson || '',
        projectId: supportConfig.projectId || extractServiceAccountProjectId(supportConfig.credentialsJson || ''),
        location: supportConfig.location || '',
        model: supportConfig.model || AI_MODEL_FAST,
        languageCode: supportConfig.languageCode || 'vi',
        servingConfigId: supportConfig.servingConfigId || 'default_serving_config',
      },
      messages: [...supportMessages, userMessage],
      systemPrompt,
      sessionId,
    });

    const now = new Date().toISOString();
    const signals = extractSupportSignals(normalizedMessage);
    const isLead = Boolean(
      signals.emails.length ||
      signals.phones.length ||
      /(gọi|goi|zalo|sđt|so dien thoai|số điện thoại|liên hệ|lien he|gọi lại|goi lai)/i.test(normalizedMessage)
    );
    const notificationState = getWebSupportNotificationState(sessionId);
    const notificationTypes = [];
    if (supportConfig.telegram?.enabled) {
      if (supportConfig.telegram.notifyOnNewChat !== false && !notificationState.notifiedNewChat) {
        notificationTypes.push('new_chat');
      }
      if (supportConfig.telegram.notifyOnLead !== false && isLead && !notificationState.notifiedLead) {
        notificationTypes.push('lead');
      }
    }
    const telegramNotificationType = notificationTypes.length === 2
      ? 'new_chat_lead'
      : (notificationTypes[0] || null);

    const assistantMessage = finalProviderResult.ok
      ? (finalProviderResult.response?.choices?.[0]?.message?.content || '')
      : '';

    const logEntry = {
      id: `web_support_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      sessionId,
      source,
      pageUrl,
      visitorName,
      visitorEmail,
      userMessage: userMessage.content,
      assistantMessage: assistantMessage || null,
      detectedPhones: signals.phones,
      detectedEmails: signals.emails,
      isLead,
      telegramNotificationType,
      providerType: supportConfig.providerType || 'gemini',
      model: supportConfig.model || null,
      result: finalProviderResult.ok ? 'ok' : 'error',
      error: finalProviderResult.ok ? null : finalProviderResult.error,
      providerFallbackUsed: false,
      clientIpHash: crypto.createHash('sha256').update(String(req.ip || req.headers['x-forwarded-for'] || '')).digest('hex').slice(0, 12),
      userAgent: String(req.get('user-agent') || '').slice(0, 160),
    };

    if (supportConfig.telegram?.enabled && telegramNotificationType) {
      const telegramText = buildTelegramSupportMessage(logEntry);
      const telegramResult = await sendTelegramMessage(
        supportConfig.telegram.botToken,
        supportConfig.telegram.chatId,
        telegramText
      );
      logEntry.telegramStatus = telegramResult.ok ? 'sent' : 'error';
      logEntry.telegramError = telegramResult.ok ? null : telegramResult.error;
    }

    appendJsonl(WEB_SUPPORT_LOG_FILE, logEntry);

    if (!finalProviderResult.ok) {
      console.error('[Web Support] Provider error:', {
        status: finalProviderResult.status,
        error: finalProviderResult.error,
        details: finalProviderResult.details || null,
      });
      return res.status(503).json({
        ok: false,
        error: 'Hiện các nhân viên đang bận, vui lòng gọi lại sau.',
        details: finalProviderResult.details || null,
      });
    }

    return res.json({
      ok: true,
      response: finalProviderResult.response,
      logId: logEntry.id,
      lead: {
        isLead,
        phones: signals.phones.map(maskPhone),
        emails: signals.emails.map(maskEmail),
      },
      fallbackUsed: false,
    });
  } catch (error) {
    console.error('[Web Support] Error:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error calling support bot.' });
  }
});

/**
 * GET /api/admin/web-support-settings
 * Read web support bot config.
 */
app.get('/api/admin/web-support-settings', requireAdmin, (req, res) => {
  try {
    const config = loadWebSupportConfig();
    res.json({ ok: true, config });
  } catch (error) {
    console.error('[Admin] Error loading web support settings:', error);
    res.status(500).json({ ok: false, error: 'Failed to load web support settings' });
  }
});

/**
 * PUT /api/admin/web-support-settings
 * Update web support bot config.
 */
app.put('/api/admin/web-support-settings', requireAdmin, (req, res) => {
  try {
    const incoming = req.body || {};
    const defaults = getDefaultWebSupportConfig();
    const current = loadWebSupportConfig();
    const telegram = {
      ...defaults.telegram,
      ...(current.telegram || {}),
      ...(incoming.telegram || {}),
    };

    const config = {
      ...defaults,
      ...current,
      ...incoming,
      telegram,
    };

    config.enabled = Boolean(config.enabled);
    config.providerType = normalizeWebSupportProviderType(config.providerType);
    if (!['gemini', 'openai_compatible', 'vertex_gemini', 'dialogflow_cx', 'google_agent_search'].includes(config.providerType)) {
      config.providerType = 'gemini';
    }
    config.baseUrl = String(config.baseUrl || '').trim();
    config.apiKey = String(config.apiKey || '');
    config.authToken = String(config.authToken || '');
    config.credentialsJson = String(config.credentialsJson || '').trim();
    config.model = String(config.model || '').trim() || defaults.model;
    config.languageCode = String(config.languageCode || '').trim() || defaults.languageCode || 'vi';
    config.servingConfigId = String(config.servingConfigId || '').trim() || 'default_serving_config';
    config.systemPrompt = String(config.systemPrompt || '').trim() || defaults.systemPrompt;

    if (config.providerType === 'google_agent_search') {
      config.baseUrl = 'https://discoveryengine.googleapis.com/v1';
      config.apiKey = '';
      config.authToken = '';
      if (!config.projectId) {
        config.projectId = extractServiceAccountProjectId(config.credentialsJson);
      }
      if (!config.location) {
        config.location = 'global';
      }
      if (!normalizeServiceAccountCredentials(config.credentialsJson)) {
        return res.status(400).json({ ok: false, error: 'Invalid Google Cloud Credentials JSON' });
      }
    }
    if (config.providerType === 'dialogflow_cx') {
      config.baseUrl = 'https://dialogflow.googleapis.com/v3';
      config.apiKey = '';
      config.authToken = '';
      if (!config.projectId) {
        config.projectId = extractServiceAccountProjectId(config.credentialsJson);
      }
      if (!config.location) {
        config.location = 'global';
      }
      if (!normalizeServiceAccountCredentials(config.credentialsJson)) {
        return res.status(400).json({ ok: false, error: 'Invalid Google Cloud Credentials JSON' });
      }
    }
    if (config.providerType === 'vertex_gemini') {
      config.baseUrl = 'https://aiplatform.googleapis.com/v1';
      config.authToken = '';
      config.apiKey = '';
      if (!config.projectId) {
        config.projectId = extractServiceAccountProjectId(config.credentialsJson);
      }
      if (!normalizeServiceAccountCredentials(config.credentialsJson)) {
        return res.status(400).json({ ok: false, error: 'Invalid Google Cloud Credentials JSON' });
      }
      config.model = normalizeVertexModelValue(config.model);
    }
    if (config.providerType === 'gemini') {
      config.credentialsJson = '';
    }
    if (config.providerType === 'vertex_gemini' || config.providerType === 'google_agent_search' || config.providerType === 'dialogflow_cx') {
      if (!normalizeServiceAccountCredentials(config.credentialsJson)) {
        return res.status(400).json({ ok: false, error: 'Invalid Google Cloud Credentials JSON' });
      }
      if (!config.projectId) {
        config.projectId = extractServiceAccountProjectId(config.credentialsJson);
      }
      if (!config.projectId) {
        return res.status(400).json({ ok: false, error: 'Missing projectId or invalid Service Account JSON' });
      }
      if (config.providerType === 'vertex_gemini') {
        config.model = normalizeVertexModelValue(config.model);
      } else if (config.providerType === 'dialogflow_cx') {
        config.languageCode = String(config.languageCode || '').trim() || 'vi';
      }
    }
    config.telegram.enabled = Boolean(config.telegram.enabled);
    config.telegram.botToken = String(config.telegram.botToken || '').trim();
    config.telegram.chatId = String(config.telegram.chatId || '').trim();
    config.telegram.notifyOnNewChat = Boolean(config.telegram.notifyOnNewChat);
    config.telegram.notifyOnLead = Boolean(config.telegram.notifyOnLead);
    config.telegram.notifyOnEveryMessage = false;

    const pricingDefaults = defaults.pricing || {};
    const pricingTasksDefaults = pricingDefaults.tasks || {};
    const pricingTasksIncoming = config.pricing?.tasks || {};
    config.pricing = {
      enabled: Boolean(config.pricing?.enabled),
      tasks: {
        chat: normalizeWebSupportPricingTask(pricingTasksIncoming.chat, pricingTasksDefaults.chat),
        explain_lesson: normalizeWebSupportPricingTask(pricingTasksIncoming.explain_lesson, pricingTasksDefaults.explain_lesson),
        deep_search: normalizeWebSupportPricingTask(pricingTasksIncoming.deep_search, pricingTasksDefaults.deep_search),
        summarize: normalizeWebSupportPricingTask(pricingTasksIncoming.summarize, pricingTasksDefaults.summarize),
      }
    };

    saveWebSupportConfig(config);
    console.log('[Admin] Web support settings updated.');

    res.json({ ok: true, config });
  } catch (error) {
    console.error('[Admin] Error saving web support settings:', error);
    res.status(500).json({ ok: false, error: 'Failed to save web support settings' });
  }
});

/**
 * GET /api/admin/web-support-logs
 * Return recent web support logs.
 */
app.get('/api/admin/web-support-logs', requireAdmin, (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 100));
    const logs = readJsonlTail(WEB_SUPPORT_LOG_FILE, limit).reverse();
    res.json({ ok: true, logs, count: logs.length });
  } catch (error) {
    console.error('[Admin] Error reading web support logs:', error);
    res.status(500).json({ ok: false, error: 'Failed to load web support logs' });
  }
});

/**
 * DELETE /api/admin/web-support-logs
 * Delete selected web support logs by id.
 */
app.delete('/api/admin/web-support-logs', requireAdmin, (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
    const uniqueIds = [...new Set(ids)];

    if (!uniqueIds.length) {
      return res.status(400).json({ ok: false, error: 'Missing log ids' });
    }

    const logs = fs.existsSync(WEB_SUPPORT_LOG_FILE)
      ? readJsonlTail(WEB_SUPPORT_LOG_FILE, Number.MAX_SAFE_INTEGER)
      : [];
    const before = logs.length;
    const remaining = logs.filter((entry) => !uniqueIds.includes(String(entry?.id || '').trim()));
    const deleted = before - remaining.length;

    rewriteJsonl(WEB_SUPPORT_LOG_FILE, remaining);

    res.json({
      ok: true,
      deleted,
      remaining: remaining.length,
    });
  } catch (error) {
    console.error('[Admin] Error deleting web support logs:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete web support logs' });
  }
});

/**
 * POST /api/admin/web-support-settings/models
 * Fetch available models for the web support bot.
 */
app.post('/api/admin/web-support-settings/models', requireAdmin, async (req, res) => {
  try {
    const supportConfig = loadWebSupportConfig();

    const {
      providerType = normalizeWebSupportProviderType(supportConfig.providerType || 'gemini'),
      baseUrl,
      authToken,
      apiKey,
      credentialsJson,
      projectId,
      location,
    } = req.body || {};

    const effectiveBaseUrl = String(baseUrl || supportConfig.baseUrl || '').trim().replace(/\/$/, '');
    const effectiveAuthToken = String(authToken || supportConfig.authToken || '').trim();
    const effectiveApiKey = String(apiKey || supportConfig.apiKey || '').trim();
    const effectiveCredentialsJson = String(credentialsJson || supportConfig.credentialsJson || '').trim();
    const effectiveProjectId = String(projectId || supportConfig.projectId || '').trim();
    const effectiveLocation = String(location || supportConfig.location || '').trim();
    const normalizedProviderType = normalizeWebSupportProviderType(providerType);

    const authHeaders = { 'Content-Type': 'application/json' };
    if (effectiveAuthToken) {
      authHeaders.Authorization = `Bearer ${effectiveAuthToken}`;
    }
    if (effectiveApiKey) {
      authHeaders['x-goog-api-key'] = effectiveApiKey;
    }

    const modelCandidates = [];
    if (normalizedProviderType === 'gemini') {
      if (!effectiveBaseUrl) {
        return res.status(400).json({ ok: false, error: 'Missing baseUrl' });
      }
      modelCandidates.push(
        `${effectiveBaseUrl}/models?key=${encodeURIComponent(effectiveApiKey || '')}`,
        `${effectiveBaseUrl}/models`
      );
    } else if (normalizedProviderType === 'vertex_gemini') {
      if (!effectiveCredentialsJson) {
        return res.status(400).json({ ok: false, error: 'Missing credentialsJson' });
      }

      const models = await fetchVertexPublisherModels({
        credentialsJson: effectiveCredentialsJson,
        signal: req.signal || undefined,
      });

      if (models && models.length) {
        return res.json({
          ok: true,
          source: 'vertex-publisher-models',
          models,
        });
      }

      return res.json({
        ok: true,
        source: 'vertex-fallback',
        models: [
          { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Vertex fallback default model' },
          { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Vertex fallback default model' },
          { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Vertex fallback default model' },
          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: 'Vertex fallback default model' },
        ]
      });
    } else if (normalizedProviderType === 'dialogflow_cx' || normalizedProviderType === 'google_agent_search') {
      if (!effectiveProjectId || !effectiveLocation) {
        return res.status(400).json({ ok: false, error: 'Missing projectId or location' });
      }
      const currentLabel = normalizedProviderType === 'dialogflow_cx'
        ? 'Google Chat / Dopi Gia Sư'
        : 'Google Search / Sales Bot';
      return res.json({
        ok: true,
        source: normalizedProviderType === 'dialogflow_cx' ? 'dialogflow-cx' : 'discovery-engine',
        models: [{
          value: supportConfig.model || (normalizedProviderType === 'dialogflow_cx' ? '79129181-d156-4071-8bde-e8088f849e91' : 'hoc-chung-khoi-tu-van_1780386592569'),
          label: `${supportConfig.model || currentLabel} (Current)`,
          description: normalizedProviderType === 'dialogflow_cx'
            ? 'Google Chat / Dopi Gia Sư agent id'
            : 'Google Search / Sales Bot engine id',
        }],
      });
    } else if (normalizedProviderType === 'openai_compatible') {
      if (!effectiveBaseUrl) {
        return res.status(400).json({ ok: false, error: 'Missing baseUrl' });
      }
      modelCandidates.push(
        `${effectiveBaseUrl}/models`,
        `${effectiveBaseUrl}/v1/models`
      );
    } else {
      return res.status(400).json({ ok: false, error: `Unsupported provider '${normalizedProviderType}'` });
    }

    for (const endpoint of modelCandidates) {
      try {
        const models = await fetchModelsFromEndpoint(endpoint, authHeaders);
        if (models) {
          return res.json({ ok: true, source: endpoint, models });
        }
      } catch {
        // Try next endpoint candidate.
      }
    }

    const fallbackModels = providerType === 'gemini'
      ? [
          { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Fallback default model' },
          { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Fallback default model' },
          { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', description: 'Fallback default model' },
          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: 'Fallback default model' },
        ]
      : [
          { value: supportConfig.model || 'claude-haiku-4-5-20251001', label: 'Current provider model', description: 'Fallback default model' },
          { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', description: 'Fallback default model' },
          { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'Fallback default model' },
          { value: 'claude-opus-4-20250514', label: 'Claude Opus 4', description: 'Fallback default model' },
        ];

    return res.json({ ok: true, source: 'fallback', models: fallbackModels });
  } catch (err) {
    console.error('[Admin] Error loading web support models:', err);
    res.status(500).json({ ok: false, error: 'Failed to load web support models' });
  }
});

/**
 * POST /api/admin/web-support-settings/test-telegram
 * Send a Telegram test message.
 */
app.post('/api/admin/web-support-settings/test-telegram', requireAdmin, async (req, res) => {
  try {
    const config = loadWebSupportConfig();
    const telegram = {
      ...(config.telegram || {}),
      ...(req.body?.telegram || {}),
    };
    if (!telegram.enabled) {
      return res.json({ ok: false, error: 'Telegram notify is disabled.' });
    }

    const testMessage = normalizeWhitespace(req.body?.message || 'Test từ Học Hứng Khởi: Telegram đang hoạt động.');
    const result = await sendTelegramMessage(telegram.botToken, telegram.chatId, testMessage);

    if (!result.ok) {
      return res.json({ ok: false, error: result.error || 'Telegram test failed', details: result });
    }

    res.json({ ok: true, message: 'Telegram test sent successfully.' });
  } catch (error) {
    console.error('[Admin] Error testing Telegram:', error);
    res.json({ ok: false, error: 'Failed to test Telegram' });
  }
});

/**
 * ============================================
 * ADMIN LICENSE MANAGEMENT API
 * ============================================
 */

// Admin auth config
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-secret-key-2024';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

console.log(`[Admin] ADMIN_EMAILS configured: ${ADMIN_EMAILS.length > 0 ? ADMIN_EMAILS.join(', ') : '(none - using secret fallback)'}`);

/**
 * requireAdmin(req, res, next)
 * Verifies admin access via:
 * 1. Clerk JWT + email check (preferred)
 * 2. X-Admin-Secret fallback (for transition period)
 */
async function requireAdmin(req, res, next) {
  // Method 1: Clerk JWT with email check
  const authHeader = req.get('Authorization');
  const clerkToken = authHeader?.replace(/^Bearer\s+/i, '');

  if (clerkToken) {
    try {
      let payload = null;
      if (CLERK_SECRET_KEY) {
        payload = await verifyClerkToken(clerkToken);
      } else {
        // Basic format check only
        const parts = clerkToken.split('.');
        if (parts.length !== 3) {
          return res.status(401).json({ ok: false, error: 'Invalid token format' });
        }
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      }

      const email =
        payload.email ||
        payload.primary_email_address ||
        (payload.emails && payload.emails[0]?.email);

      // If ADMIN_EMAILS is configured, check email
      if (ADMIN_EMAILS.length > 0) {
        // If token is valid but email claim is missing
        if (!email) {
          console.warn('[Admin] Clerk token valid but missing email claim');
          return res.status(401).json({
            ok: false,
            error: 'Email claim not found in Clerk token. Please ensure Clerk session includes email in JWT template.'
          });
        }
        // Normalize email before comparison (already lowercase from ADMIN_EMAILS)
        const normalizedEmail = email.toLowerCase().trim();
        if (ADMIN_EMAILS.includes(normalizedEmail)) {
          req.adminEmail = normalizedEmail;
          return next();
        }
        return res.status(403).json({ ok: false, error: 'Not authorized as admin' });
      }

      // No ADMIN_EMAILS configured, allow any valid Clerk user (transition mode)
      req.adminEmail = email || null;
      return next();
    } catch (err) {
      console.warn('[Admin] Clerk token verification failed:', err.message);
      // Different error messages based on failure reason
      if (err.message.includes('Could not fetch JWKS') || err.message.includes('JWKS')) {
        return res.status(503).json({
          ok: false,
          error: 'Clerk JWKS server unavailable'
        });
      }
      // Fall through to secret check
    }
  }

  // Method 2: X-Admin-Secret (backward compatibility / transition period)
  const secret = req.get('X-Admin-Secret') || req.query.adminSecret;
  if (secret && secret === ADMIN_SECRET) {
    return next();
  }

  return res.status(403).json({ ok: false, error: 'Admin access required' });
}

/**
 * GET /api/admin/licenses
 * List all licenses with pagination, search, filter
 * Query params: page, limit, search, status, productId
 */
app.get('/api/admin/licenses', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = (req.query.search || '').toLowerCase();
  const status = req.query.status;
  const productId = req.query.productId;

  let licenses = loadLicenses();

  // Apply filters
  if (search) {
    licenses = licenses.filter(l =>
      (l.licenseKey && l.licenseKey.toLowerCase().includes(search)) ||
      (l.customerEmail && l.customerEmail.toLowerCase().includes(search)) ||
      (l.productName && l.productName.toLowerCase().includes(search))
    );
  }

  if (status) {
    licenses = licenses.filter(l => l.status === status);
  }

  if (productId) {
    licenses = licenses.filter(l => l.productId === productId);
  }

  // Sort by created date (newest first)
  licenses.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const total = licenses.length;
  const startIndex = (page - 1) * limit;
  const paginated = licenses.slice(startIndex, startIndex + limit);

  res.json({
    ok: true,
    licenses: paginated,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

/**
 * POST /api/admin/licenses
 * Create new license manually
 * Body: { customerEmail, productId, durationMonths, deviceLimit, notes }
 */
app.post('/api/admin/licenses', requireAdmin, (req, res) => {
  const { customerEmail, productId, durationMonths = 12, deviceLimit = 2, notes = '', selectedGrades = [] } = req.body;

  if (!customerEmail || !productId) {
    return res.status(400).json({ ok: false, error: 'Missing required fields: customerEmail, productId' });
  }

  // Load products â€” try p.id first (products.json format), fallback to p.productId
  const products = loadProducts();
  const product = products.find(p => p.id === productId || p.productId === productId);

  if (!product) {
    return res.status(400).json({ ok: false, error: 'Invalid productId' });
  }

  // Generate license key
  const licenseKey = generateLicenseKey();

  // Calculate dates
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMonths * 30 * 24 * 60 * 60 * 1000);

  const resolvedProductId = product.id || product.productId;
  const productGradeIds = product.gradeIds || [];
  const productMaxGrades = product.maxGrades || productGradeIds.length || 1;
  // Use selectedGrades if product requires grade selection, otherwise use product gradeIds
  const finalGrades = product.requiresGradeSelection && Array.isArray(selectedGrades) && selectedGrades.length > 0
    ? selectedGrades.slice(0, productMaxGrades)
    : productGradeIds;

  const newLicense = {
    licenseKey,
    productId: resolvedProductId,
    productName: product.name,
    appId: resolveProductAppId(product),
    customerEmail: customerEmail.toLowerCase().trim(),
    allowedGrades: finalGrades,
    maxGrades: productMaxGrades,
    selectedGrades: finalGrades,
    status: 'active',
    deviceLimit: parseInt(deviceLimit) || 2,
    durationMonths: parseInt(durationMonths) || 12,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastVerifiedAt: null,
    adminNotes: notes,
    devices: [],
    plan: resolvedProductId,
  };

  const licenses = loadLicenses();
  licenses.push(newLicense);
  saveLicenses(licenses);

  res.json({
    ok: true,
    license: newLicense,
    message: 'License created successfully'
  });
});

/**
 * PATCH /api/admin/licenses/:licenseKey
 * Update license (status, extend expiry, notes)
 */
app.patch('/api/admin/licenses/:licenseKey', requireAdmin, (req, res) => {
  const { licenseKey } = req.params;
  const { status, extendMonths, notes, deviceLimit } = req.body;

  const licenses = loadLicenses();
  const license = licenses.find(l => l.licenseKey === licenseKey.toUpperCase());

  if (!license) {
    return res.status(404).json({ ok: false, error: 'License not found' });
  }

  // Update status
  if (status && ['active', 'expired', 'revoked'].includes(status)) {
    license.status = status;
  }

  // Extend expiry
  if (extendMonths && parseInt(extendMonths) > 0) {
    const currentExpiry = license.expiresAt ? new Date(license.expiresAt) : new Date();
    const newExpiry = new Date(currentExpiry.getTime() + parseInt(extendMonths) * 30 * 24 * 60 * 60 * 1000);
    license.expiresAt = newExpiry.toISOString();
  }

  // Update device limit
  if (deviceLimit && parseInt(deviceLimit) > 0) {
    license.deviceLimit = parseInt(deviceLimit);
  }

  // Update notes
  if (notes !== undefined) {
    license.adminNotes = notes;
  }

  saveLicenses(licenses);

  res.json({
    ok: true,
    license,
    message: 'License updated successfully'
  });
});

/**
 * DELETE /api/admin/licenses/:licenseKey
 * Delete license permanently
 */
app.delete('/api/admin/licenses/:licenseKey', requireAdmin, (req, res) => {
  const { licenseKey } = req.params;

  let licenses = loadLicenses();
  const initialLength = licenses.length;

  licenses = licenses.filter(l => l.licenseKey !== licenseKey.toUpperCase());

  if (licenses.length === initialLength) {
    return res.status(404).json({ ok: false, error: 'License not found' });
  }

  saveLicenses(licenses);

  // Also clean up activations
  let activations = loadActivations();
  activations = activations.filter(a => a.licenseKey !== licenseKey.toUpperCase());
  saveActivations(activations);

  res.json({ ok: true, message: 'License deleted successfully' });
});

/**
 * GET /api/admin/products
 * List all available products for dropdown
 */
app.get('/api/admin/products', requireAdmin, (req, res) => {
  const products = loadProducts();
  const includeAiCredit = /^(1|true|yes)$/i.test(String(req.query.includeAiCredit || ''));
  const filteredProducts = includeAiCredit
    ? products.filter(p => p.isActive !== false)
    : products.filter(p => p.isActive !== false && p.type !== 'ai_credit');
  res.json({
    ok: true,
    products: filteredProducts.map(p => ({
      productId: p.id || p.productId,
      name: p.name,
      price: p.price,
      durationMonths: p.durationMonths,
      gradeIds: p.gradeIds,
      maxGrades: p.maxGrades,
      requiresGradeSelection: Boolean(p.requiresGradeSelection),
    }))
  });
});

/**
 * GET /api/admin/ai-credit-products
 * Admin API to get all AI Credit products
 */
app.get('/api/admin/ai-credit-products', requireAdmin, (req, res) => {
  const products = loadProducts();
  const aiProducts = normalizeAiCreditProducts(
    products.filter(p => p.type === 'ai_credit' || String(p.id || p.productId || '').toLowerCase().startsWith('ai_credit_'))
  );
  res.json({ ok: true, products: aiProducts });
});

/**
 * POST /api/admin/ai-credit-products
 * Admin API to create an AI Credit product
 */
app.post('/api/admin/ai-credit-products', requireAdmin, (req, res) => {
  const { id, name, description, price, originalPrice, credits, isActive, badge } = req.body;

  if (typeof price !== 'number' || price < 0) {
    return res.status(400).json({ ok: false, error: 'Price must be a number >= 0' });
  }
  if (originalPrice !== undefined && (typeof originalPrice !== 'number' || originalPrice < 0)) {
    return res.status(400).json({ ok: false, error: 'Original price must be a number >= 0' });
  }
  if (originalPrice !== undefined && Number(originalPrice) < Number(price)) {
    return res.status(400).json({ ok: false, error: 'Original price must be greater than or equal to sale price' });
  }
  const data = loadProductsData();
  if (!data || !Array.isArray(data.products)) {
    return res.status(500).json({ ok: false, error: 'Failed to read products database' });
  }

  const existingAiProducts = normalizeAiCreditProducts(data.products || []);
  const preset = isSystemAiCreditProductId(id)
    ? getSystemAiCreditProductPreset(id)
    : SYSTEM_AI_CREDIT_PRODUCTS.find((item) => !existingAiProducts.some((product) => product.id === item.id));

  if (!preset) {
    return res.json({ ok: false, error: 'System AI credit packages are already initialized' });
  }

  const maxSortOrder = data.products.reduce((max, product) => {
    const sortOrder = Number(product.sortOrder || 0);
    return Number.isFinite(sortOrder) && sortOrder > max ? sortOrder : max;
  }, 0);
  const now = new Date().toISOString();
  const finalOriginalPrice = originalPrice !== undefined ? Number(originalPrice) : Number(price);
  const finalCredits = deriveAiCreditUnitsFromPrice(finalOriginalPrice);
  const product = normalizeAiCreditProductRecord({
    id: preset.id,
    name: preset.name,
    description: typeof description === 'string' ? description.trim() : preset.description,
    price,
    originalPrice: Number.isFinite(finalOriginalPrice) ? finalOriginalPrice : price,
    currency: 'VND',
    type: 'ai_credit',
    credits: finalCredits,
    features: [],
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    sortOrder: preset.sortOrder || (maxSortOrder + 1),
    badge: badge ? String(badge).trim() : null,
    createdAt: now,
    updatedAt: now,
  }, preset);

  data.products.push(product);

  try {
    writeJson(PRODUCTS_FILE, data);
    res.status(201).json({ ok: true, product });
  } catch (err) {
    console.error('[Admin] Error creating AI credit product:', err);
    res.status(500).json({ ok: false, error: 'Failed to create product' });
  }
});

/**
 * PATCH /api/admin/ai-credit-products/:id
 * Admin API to update an AI Credit product
 */
app.patch('/api/admin/ai-credit-products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const normalizedId = normalizeSystemAiCreditProductId(id);
  const preset = getSystemAiCreditProductPreset(normalizedId);
  const { description, price, originalPrice, credits, isActive, badge } = req.body;

  if (!preset) {
    return res.status(400).json({ ok: false, error: 'AI credit package is system-defined and cannot be renamed or remapped' });
  }
  
  if (price !== undefined && (typeof price !== 'number' || price < 0)) {
    return res.status(400).json({ ok: false, error: 'Price must be a number >= 0' });
  }
  if (originalPrice !== undefined && (typeof originalPrice !== 'number' || originalPrice < 0)) {
    return res.status(400).json({ ok: false, error: 'Original price must be a number >= 0' });
  }
  if (originalPrice !== undefined && price !== undefined && Number(originalPrice) < Number(price)) {
    return res.status(400).json({ ok: false, error: 'Original price must be greater than or equal to sale price' });
  }
  const data = loadProductsData();
  if (!data || !data.products) {
    return res.status(500).json({ ok: false, error: 'Failed to read products database' });
  }

  const productIndex = data.products.findIndex(p => normalizeSystemAiCreditProductId(p.id || p.productId) === normalizedId);
  if (productIndex === -1) {
    return res.status(404).json({ ok: false, error: 'Product not found' });
  }

  const product = data.products[productIndex];

  const nextOriginalPrice = originalPrice !== undefined ? Number(originalPrice) : Number(product.originalPrice ?? product.price ?? 0);
  const nextSalePrice = price !== undefined ? Number(price) : Number(product.price || 0);
  const nextCredits = deriveAiCreditUnitsFromPrice(nextOriginalPrice || nextSalePrice);

  product.id = preset.id;
  product.name = preset.name;
  if (description !== undefined) product.description = String(description || '').trim();
  if (price !== undefined) product.price = price;
  if (originalPrice !== undefined) product.originalPrice = originalPrice;
  else if (product.originalPrice === undefined) product.originalPrice = product.price;
  product.credits = nextCredits;
  if (isActive !== undefined) product.isActive = Boolean(isActive);
  if (badge !== undefined) product.badge = badge;
  product.currency = 'VND';
  product.type = 'ai_credit';
  product.sortOrder = preset.sortOrder || product.sortOrder || 0;
  product.updatedAt = new Date().toISOString();

  try {
    writeJson(PRODUCTS_FILE, data);
    res.json({ ok: true, product });
  } catch (err) {
    console.error('[Admin] Error saving products.json:', err);
    res.status(500).json({ ok: false, error: 'Failed to save product' });
  }
});

/**
 * DELETE /api/admin/ai-credit-products/:id
 * Admin API to remove an AI Credit product
 */
app.delete('/api/admin/ai-credit-products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const normalizedId = normalizeSystemAiCreditProductId(id);

  if (isSystemAiCreditProductId(normalizedId)) {
    return res.status(400).json({ ok: false, error: 'System AI credit packages cannot be deleted. Please disable them instead.' });
  }

  const data = loadProductsData();
  if (!data || !Array.isArray(data.products)) {
    return res.status(500).json({ ok: false, error: 'Failed to read products database' });
  }

  const productIndex = data.products.findIndex(p => normalizeSystemAiCreditProductId(p.id || p.productId) === normalizedId);
  if (productIndex === -1) {
    return res.status(404).json({ ok: false, error: 'Product not found' });
  }

  data.products.splice(productIndex, 1);

  try {
    writeJson(PRODUCTS_FILE, data);
    res.json({ ok: true, deletedId: id });
  } catch (err) {
    console.error('[Admin] Error deleting AI credit product:', err);
    res.status(500).json({ ok: false, error: 'Failed to delete product' });
  }
});

/**
 * GET /api/admin/dopi-recharge-keys
 * Admin API to list Dopi recharge keys
 */
app.get('/api/admin/dopi-recharge-keys', requireAdmin, (req, res) => {
  const status = String(req.query.status || '').trim();
  const search = String(req.query.search || '').toLowerCase().trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

  let keys = loadDopiRechargeKeys();
  if (status) {
    keys = keys.filter(k => {
      const normalizedStatus = String(k.status || '').toLowerCase().trim();
      if (status === 'active') return normalizedStatus !== 'void';
      return normalizedStatus === status;
    });
  }
  if (search) {
    keys = keys.filter(k => [
      k.key,
      k.orderId,
      k.productId,
      k.productName,
      k.customerEmail,
      k.redeemedByEmail,
      k.note,
    ].some(value => String(value || '').toLowerCase().includes(search)));
  }

  keys = keys
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map(k => ({
      ...k,
      key: k.key,
      status: k.status === 'void' ? 'void' : 'active',
      keyMasked: maskDopiKey(k.key),
    }));

  res.json({ ok: true, keys, count: keys.length });
});

/**
 * POST /api/admin/dopi-recharge-keys
 * Admin API to create a manual Dopi recharge key
 */
app.post('/api/admin/dopi-recharge-keys', requireAdmin, (req, res) => {
  const { customerEmail = '', productId = null, productName = 'Gói Dopi thủ công', amountDopi, note = '' } = req.body || {};
  const amount = Number(amountDopi);
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'amountDopi must be a positive integer' });
  }

  const result = createDopiRechargeKey({
    productId,
    productName,
    customerEmail,
    amountDopi: amount,
    source: 'manual',
    createdBy: req.adminEmail || 'admin',
    note,
  });

  if (!result.success) {
    return res.status(400).json({ ok: false, error: result.reason });
  }

  res.status(201).json({
    ok: true,
    key: {
      ...result.keyRecord,
      key: result.keyRecord.key,
      status: 'active',
      keyMasked: maskDopiKey(result.keyRecord.key),
    }
  });
});

/**
 * PATCH /api/admin/dopi-recharge-keys/:id
 * Admin API to void an unused Dopi recharge key
 */
app.patch('/api/admin/dopi-recharge-keys/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body || {};

  if (status !== 'void') {
    return res.status(400).json({ ok: false, error: 'Only status=void is supported' });
  }

  const keys = loadDopiRechargeKeys();
  const keyIndex = keys.findIndex(k => k.id === id);
  if (keyIndex === -1) {
    return res.status(404).json({ ok: false, error: 'Dopi key not found' });
  }

  const keyRecord = keys[keyIndex];

  keyRecord.status = 'void';
  keyRecord.note = note !== undefined ? String(note || '') : keyRecord.note;
  keyRecord.updatedAt = new Date().toISOString();
  keys[keyIndex] = keyRecord;
  saveDopiRechargeKeys(keys);

  res.json({
    ok: true,
    key: {
      ...keyRecord,
      keyMasked: maskDopiKey(keyRecord.key),
    }
  });
});

/**
 * GET /api/admin/ai-settings
 * Get AI providers configuration
 */
app.get('/api/admin/ai-settings', requireAdmin, (req, res) => {
  try {
    const config = loadAiProviders();
    res.json({
      ok: true,
      activeProvider: config.activeProvider || 'claude',
      providers: config.providers || {},
      pricing: config.pricing || getDefaultAiPricingConfig(),
    });
  } catch (err) {
    console.error('[Admin] Error loading AI providers config:', err);
    res.status(500).json({ ok: false, error: 'Failed to load AI settings' });
  }
});

/**
 * PUT /api/admin/ai-settings
 * Update AI providers configuration
 * Body: { activeProvider, providers }
 */
app.put('/api/admin/ai-settings', requireAdmin, (req, res) => {
  try {
    const { activeProvider, providers, pricing } = req.body;
    const current = loadAiProviders();
    
    if (!activeProvider || !providers) {
      return res.status(400).json({ ok: false, error: 'Missing activeProvider or providers' });
    }
    
    // Validate activeProvider exists in providers
    if (!providers[activeProvider]) {
      return res.status(400).json({ ok: false, error: `Provider '${activeProvider}' not found in providers list` });
    }

    // Force the active provider to stay enabled so the AI endpoint cannot
    // persist an unusable "active but disabled" state.
    const normalizedProviders = {
      ...providers,
      [activeProvider]: {
        ...providers[activeProvider],
        enabled: true
      }
    };
    
    // Validate each provider has required fields only when the provider is enabled.
    // Disabled providers may intentionally keep incomplete credentials.
    for (const [key, provider] of Object.entries(normalizedProviders)) {
      if (!provider.name) {
        return res.status(400).json({ ok: false, error: `Provider '${key}' missing name` });
      }

      const shouldValidateConnection = Boolean(provider.enabled) || key === activeProvider;
      if (!shouldValidateConnection) {
        continue;
      }

      // Validate based on provider type
      if (key === 'claude') {
        if (!provider.baseUrl) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' missing baseUrl` });
        }
      } else if (key === 'gemini') {
        if (!provider.apiKey) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' missing apiKey` });
        }
      } else if (key === 'vertex') {
        if (!provider.projectId || !provider.location) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' missing projectId or location` });
        }
        if (!normalizeServiceAccountCredentials(provider.credentialsJson)) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' has invalid Service Account JSON` });
        }
      } else if (key === 'google_agent_search') {
        if (!provider.projectId || !provider.location) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' missing projectId or location` });
        }
        if (!normalizeServiceAccountCredentials(provider.credentialsJson)) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' has invalid Service Account JSON` });
        }
        if (!String(provider.model || '').trim()) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' missing engineId` });
        }
      } else if (key === 'dialogflow_cx') {
        if (!provider.projectId || !provider.location) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' missing projectId or location` });
        }
        if (!normalizeServiceAccountCredentials(provider.credentialsJson)) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' has invalid Service Account JSON` });
        }
        if (!String(provider.model || '').trim()) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' missing agentId` });
        }
        if (!String(provider.languageCode || '').trim()) {
          return res.status(400).json({ ok: false, error: `Provider '${key}' missing languageCode` });
        }
      }
    }
    const normalizedPricing = normalizeAiPricingConfig(pricing || current.pricing || getDefaultAiPricingConfig());
    
    const config = {
      activeProvider,
      providers: normalizedProviders,
      pricing: normalizedPricing,
      updatedAt: new Date().toISOString()
    };
    
    saveAiProviders(config);
    console.log(`[Admin] AI settings updated. Active provider: ${activeProvider}`);
    
    res.json({
      ok: true,
      message: 'AI settings updated successfully',
      activeProvider,
      providers: Object.keys(normalizedProviders),
      pricing: normalizedPricing,
    });
  } catch (err) {
    console.error('[Admin] Error saving AI providers config:', err);
    res.status(500).json({ ok: false, error: 'Failed to save AI settings' });
  }
});

/**
 * POST /api/admin/ai-settings/models
 * Fetch available models from the configured provider base URL.
 * Body: { providerKey, baseUrl, authToken, apiKey }
 */
app.post('/api/admin/ai-settings/models', requireAdmin, async (req, res) => {
  try {
    const { providerKey, baseUrl, authToken, apiKey, credentialsJson } = req.body || {};
    const current = loadAiProviders();

    if (!providerKey) {
      return res.status(400).json({ ok: false, error: 'Missing providerKey' });
    }

    const trimmedBaseUrl = String(baseUrl || '').trim().replace(/\/$/, '');

    if (!trimmedBaseUrl && providerKey !== 'vertex' && providerKey !== 'dialogflow_cx' && providerKey !== 'google_agent_search') {
      return res.status(400).json({ ok: false, error: 'Missing baseUrl' });
    }

    const authHeaders = { 'Content-Type': 'application/json' };
    if (authToken) {
      authHeaders.Authorization = `Bearer ${authToken}`;
    }
    if (apiKey) {
      authHeaders['x-goog-api-key'] = apiKey;
    }
    const effectiveCredentialsJson = String(credentialsJson || '').trim();

    const modelCandidates = [];

    if (providerKey === 'claude' || providerKey === 'openai_compatible') {
      modelCandidates.push(
        `${trimmedBaseUrl}/models`,
        `${trimmedBaseUrl}/v1/models`
      );
    } else if (providerKey === 'gemini') {
      modelCandidates.push(
        `${trimmedBaseUrl}/models?key=${encodeURIComponent(apiKey || '')}`,
        `${trimmedBaseUrl}/models`
      );
    } else if (providerKey === 'vertex') {
      if (!effectiveCredentialsJson) {
        return res.status(400).json({ ok: false, error: 'Missing credentialsJson' });
      }

      const models = await fetchVertexPublisherModels({
        credentialsJson: effectiveCredentialsJson,
        signal: req.signal || undefined,
      });

      if (models && models.length) {
        return res.json({ ok: true, source: 'vertex-publisher-models', models });
      }

      return res.json({
        ok: true,
        source: 'vertex-fallback',
        models: [
          { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Vertex fallback default model' },
          { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Vertex fallback default model' },
          { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Vertex fallback default model' },
          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: 'Vertex fallback default model' },
        ]
      });
    } else if (providerKey === 'dialogflow_cx') {
      const currentProvider = current.providers?.dialogflow_cx || {};
      return res.json({
        ok: true,
        source: 'dialogflow-cx',
        models: [
          {
            value: String(currentProvider.model || '79129181-d156-4071-8bde-e8088f849e91').trim(),
            label: 'Google Chat / Dopi Gia Su',
            description: `Agent ID: ${String(currentProvider.model || '79129181-d156-4071-8bde-e8088f849e91').trim()} • Language: ${String(currentProvider.languageCode || 'vi').trim() || 'vi'}`,
          },
        ],
      });
    } else if (providerKey === 'google_agent_search') {
      const currentProvider = current.providers?.google_agent_search || {};
      const currentServingConfigId = String(currentProvider.servingConfigId || 'default_serving_config').trim() || 'default_serving_config';
      return res.json({
        ok: true,
        source: 'google-agent-search',
        models: [
          {
            value: String(currentProvider.model || 'hoc-chung-khoi-tu-van_1780386592569').trim(),
            label: 'Google Search / Sales Bot',
            description: `Engine / App ID: ${String(currentProvider.model || 'hoc-chung-khoi-tu-van_1780386592569').trim()} • Serving config: ${currentServingConfigId}`,
          },
        ],
      });    } else {
      return res.status(400).json({ ok: false, error: `Unsupported provider '${providerKey}'` });
    }

    for (const endpoint of modelCandidates) {
      try {
        const models = await fetchModelsFromEndpoint(endpoint, authHeaders);
        if (models) {
          return res.json({ ok: true, source: endpoint, models });
        }
      } catch (err) {
        // Try next endpoint candidate.
      }
    }

    return res.status(502).json({
      ok: false,
      error: 'Unable to load models from provider baseUrl. The provider may not expose a models endpoint or CORS/auth may be blocking it.'
    });
  } catch (err) {
    console.error('[Admin] Error loading provider models:', err);
    res.status(500).json({ ok: false, error: 'Failed to load models' });
  }
});

/**
 * GET /api/admin/customers
 * List all customers aggregated from licenses and orders
 */
app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = (req.query.search || '').toLowerCase();
  const sort = req.query.sort || 'latestCreatedAt';

  const licenses = loadLicenses();
  const orders = loadOrders();

  const customerMap = new Map();

  for (const lic of licenses) {
    const email = (lic.customerEmail || '').toLowerCase().trim();
    if (!email) continue;
    if (search && !email.includes(search) && !(lic.licenseKey || '').toLowerCase().includes(search)) continue;

    if (!customerMap.has(email)) {
      customerMap.set(email, {
        email,
        licenses: [],
        orders: [],
        licenseCount: 0,
        activeLicenseCount: 0,
        expiredLicenseCount: 0,
        revokedLicenseCount: 0,
        orderCount: 0,
        products: new Set(),
        latestCreatedAt: null,
        latestExpiresAt: null,
      });
    }
    const c = customerMap.get(email);
    c.licenses.push(lic);
    c.licenseCount++;
    if (lic.status === 'active') c.activeLicenseCount++;
    if (lic.status === 'expired') c.expiredLicenseCount++;
    if (lic.status === 'revoked') c.revokedLicenseCount++;
    if (lic.productName) c.products.add(lic.productName);
    if (lic.createdAt) {
      const d = new Date(lic.createdAt);
      if (!c.latestCreatedAt || d > new Date(c.latestCreatedAt)) c.latestCreatedAt = lic.createdAt;
    }
    if (lic.expiresAt) {
      const d = new Date(lic.expiresAt);
      if (!c.latestExpiresAt || d > new Date(c.latestExpiresAt)) c.latestExpiresAt = lic.expiresAt;
    }
  }

  for (const ord of orders) {
    const email = (ord.customerEmail || '').toLowerCase().trim();
    if (!email) continue;
    if (search && !email.includes(search) && !(ord.orderId || '').toLowerCase().includes(search)) continue;

    if (!customerMap.has(email)) {
      customerMap.set(email, {
        email,
        licenses: [],
        orders: [],
        licenseCount: 0,
        activeLicenseCount: 0,
        expiredLicenseCount: 0,
        revokedLicenseCount: 0,
        orderCount: 0,
        products: new Set(),
        latestCreatedAt: null,
        latestExpiresAt: null,
      });
    }
    const c = customerMap.get(email);
    c.orders.push(ord);
    c.orderCount++;
    if (ord.productName) c.products.add(ord.productName);
    if (ord.createdAt) {
      const d = new Date(ord.createdAt);
      if (!c.latestCreatedAt || d > new Date(c.latestCreatedAt)) c.latestCreatedAt = ord.createdAt;
    }
  }

  let customers = Array.from(customerMap.values()).map(c => ({
    email: c.email,
    licenseCount: c.licenseCount,
    activeLicenseCount: c.activeLicenseCount,
    expiredLicenseCount: c.expiredLicenseCount,
    revokedLicenseCount: c.revokedLicenseCount,
    orderCount: c.orderCount,
    totalCount: c.licenseCount + c.orderCount,
    products: Array.from(c.products),
    latestCreatedAt: c.latestCreatedAt,
    latestExpiresAt: c.latestExpiresAt,
  }));

  if (sort === 'email') {
    customers.sort((a, b) => a.email.localeCompare(b.email));
  } else if (sort === 'latestExpiresAt') {
    customers.sort((a, b) => {
      const aD = a.latestExpiresAt ? new Date(a.latestExpiresAt).getTime() : 0;
      const bD = b.latestExpiresAt ? new Date(b.latestExpiresAt).getTime() : 0;
      return bD - aD;
    });
  } else {
    customers.sort((a, b) => {
      const aD = a.latestCreatedAt ? new Date(a.latestCreatedAt).getTime() : 0;
      const bD = b.latestCreatedAt ? new Date(b.latestCreatedAt).getTime() : 0;
      return bD - aD;
    });
  }

  const total = customers.length;
  const startIndex = (page - 1) * limit;
  const paginated = customers.slice(startIndex, startIndex + limit);

  res.json({
    ok: true,
    customers: paginated,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
});

/**
 * GET /api/admin/customers/:email
 * Get customer detail with licenses and orders
 */
app.get('/api/admin/customers/:email', requireAdmin, (req, res) => {
  const email = decodeURIComponent(req.params.email).toLowerCase().trim();
  if (!email) return res.status(400).json({ ok: false, error: 'Email required' });

  const licenses = loadLicenses().filter(l =>
    (l.customerEmail || '').toLowerCase().trim() === email
  );
  const orders = loadOrders().filter(o =>
    (o.customerEmail || '').toLowerCase().trim() === email
  );

  const products = [...new Set([
    ...licenses.map(l => l.productName).filter(Boolean),
    ...orders.map(o => o.productName).filter(Boolean),
  ])];

  res.json({
    ok: true,
    customer: {
      email,
      licenses,
      orders,
      products,
      licenseCount: licenses.length,
      activeLicenseCount: licenses.filter(l => l.status === 'active').length,
      orderCount: orders.length,
    }
  });
});

/**
 * POST /api/payments/webhooks/sepay
 * SePay webhook endpoint
 */
app.post('/api/payments/webhooks/sepay', async (req, res) => {
  const signature = req.get('x-sepay-signature');
  const rawBody = req.rawBody;

  // 1. Check missing signature trước
  if (!signature) {
    return res.status(401).json({ ok: false, error: 'Missing signature header' });
  }

  // 2. Check secret configured
  if (!SEPAY_WEBHOOK_SECRET) {
    console.error('[Webhook] SEPAY_WEBHOOK_SECRET not configured');
    return res.status(500).json({ ok: false, error: 'Webhook secret not configured' });
  }

  // 3. Verify signature
  const isValid = verifySePaySignature(rawBody, signature, SEPAY_WEBHOOK_SECRET);

  if (!isValid) {
    console.warn('[Webhook] Invalid signature attempt');
    return res.status(403).json({ ok: false, error: 'Invalid signature' });
  }

  const payload = req.body;
  logWebhookSafe(payload, true);

  // Extract order info from transfer content
  const content = payload.content || payload.description || '';
  const amount = payload.transferAmount || payload.amount || 0;
  const transactionId = payload.transactionId || payload.id || payload.referenceCode;
  
  // Check for duplicate transaction (idempotent)
  if (transactionId && isTransactionProcessed(transactionId)) {
    console.log(`[Webhook] Duplicate transaction ${transactionId} ignored`);
    return res.json({ 
      ok: true, 
      received: true, 
      duplicate: true,
      message: 'Transaction already processed' 
    });
  }
  
  // Normalize: uppercase, strip everything except A-Z 0-9
  const normalize = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normalizedContent = normalize(content);

  // Find order by matching content - raw first, then normalized (handles bank stripping dashes)
  const orders = loadOrders();
  const order = orders.find(o =>
    content.includes(o.orderId) || normalizedContent.includes(normalize(o.orderId))
  );
  
  if (!order) {
    return res.json({ ok: true, received: true, message: 'Order not found, logged for manual review' });
  }
  
  // Verify amount matches
  if (amount !== order.amount) {
    return res.json({ ok: true, received: true, message: 'Amount mismatch, logged for manual review' });
  }
  
  // Check if order already paid (double protection)
  if (order.status === 'paid') {
    return res.json({ 
      ok: true, 
      received: true, 
      alreadyPaid: true,
      message: 'Order already paid' 
    });
  }
  
  // Mark order as paid
  const now = new Date().toISOString();
  order.status = 'paid';
  order.paidAt = now;
  order.paymentRef = transactionId;
  order.updatedAt = now;
  
  const products = loadProducts();
  const product = products.find(p => p.id === order.productId);

  let licenseKey = null;
  let licenseGenerated = false;
  let dopiRechargeKey = null;

  const isAiProduct = product?.type === 'ai_credit' || product?.type === 'ai_capacity';

  if (isAiProduct) {
    // AI Product: issue a Dopi key and sync the customer's AI wallet on the server.
    const capacityAmount = product?.credits || product?.capacityUnits || 0;
    if (capacityAmount > 0) {
      const keyResult = createDopiRechargeKey({
        orderId: order.orderId,
        productId: order.productId,
        productName: order.productName,
        customerEmail: order.customerEmail,
        amountDopi: capacityAmount,
        source: 'sepay',
        createdBy: 'sepay-webhook',
      });

      if (keyResult.success) {
        dopiRechargeKey = keyResult.keyRecord;
        order.dopiRechargeKeyId = dopiRechargeKey.id;
        order.dopiRechargeKeyMasked = maskDopiKey(dopiRechargeKey.key);
        order.dopiAmount = capacityAmount;
        console.log(`[Dopi] Issued key ${dopiRechargeKey.id} for order ${order.orderId} (${capacityAmount} Dopi)`);
      } else {
        console.error(`[Dopi] Failed to create recharge key for order ${order.orderId}: ${keyResult.reason}`);
      }
    }
    licenseGenerated = false;
  } else {
    // Standard Product: Generate license key
    licenseKey = generateLicenseKey();
    order.licenseKey = licenseKey;
    licenseGenerated = true;

    const durationMonths = product?.durationMonths || 12;
    const expiresAt = getExpiryDate(durationMonths);

    const license = {
      licenseKey,
      orderId: order.orderId,
      productId: order.productId,
      productName: order.productName,
      appId: resolveProductAppId(product),
      customerEmail: order.customerEmail,
      allowedGrades: product?.gradeIds || [],
      selectedGrades: order.selectedGrades || [],
      status: 'active',
      startDate: now,
      expiresAt,
      deviceLimit: 1,
      plan: product?.id || 'unknown',
      durationMonths,
    };
    
    const licenses = loadLicenses();
    licenses.push(license);
    saveLicenses(licenses);
    console.log(`[Order Paid] ${order.orderId} -> License ${licenseKey.slice(0, 4)}****${licenseKey.slice(-4)}`);
  }

  saveOrders(orders);
  markTransactionProcessed(transactionId);

  // Log email (test-log-only mode - not sent)
  try {
    const emailResult = await sendPaidOrderEmail({
      to: order.customerEmail,
      order,
      license: licenseKey ? { licenseKey } : null,
      product,
      dopiRechargeKey,
    });
    
    if (emailResult.skipped) {
      console.log(`[Email] ${order.orderId} - ${emailResult.reason}`);
    } else {
      console.log(`[Email Logged] ${order.orderId} - mode: ${emailResult.mode}`);
    }
  } catch (emailErr) {
    console.error(`[Email Error] ${order.orderId}:`, emailErr.message);
  }

  if (licenseGenerated) {
    console.log(`[Order Paid] ${order.orderId} -> License ${licenseKey.slice(0, 4)}****${licenseKey.slice(-4)}`);
  } else if (dopiRechargeKey) {
    console.log(`[Order Paid] ${order.orderId} -> Dopi key issued: ${dopiRechargeKey.id}`);
  } else {
    console.log(`[Order Paid] ${order.orderId} -> No license/capacity generated`);
  }

  const response = {
    ok: true,
    received: true,
    orderId: order.orderId,
    status: 'paid',
    licenseGenerated,
  };

  if (dopiRechargeKey) {
    response.dopiRechargeKey = {
      id: dopiRechargeKey.id,
      keyMasked: maskDopiKey(dopiRechargeKey.key),
      amountDopi: dopiRechargeKey.amountDopi,
      status: dopiRechargeKey.status,
    };
  }

  res.json(response);
});

// Error handling middleware - catch JSON parse errors và các lỗi khác
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    // JSON parse error
    return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  }
  // Log lỗi không expected (không log secret hay body chi tiết)
  console.error('[Server Error]', err.message || err);
  return res.status(500).json({ ok: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Học Chung Khởi API running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`Products: http://localhost:${PORT}/api/products`);
  console.log(`Webhook: http://localhost:${PORT}/api/payments/webhooks/sepay`);
});

export default app;




