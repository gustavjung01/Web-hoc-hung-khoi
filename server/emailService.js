/**
 * Email Service - Multi-mode support
 * EMAIL_MODE=test-log-only: chi log file, khong gui that
 * EMAIL_MODE=resend: gui qua Resend API
 * EMAIL_MODE=brevo: gui qua Brevo/Sendinblue API
 *
 * Security:
 * - Log chi luu masked key
 * - Full key chi trong email gui toi khach
 * - Khong in secret ra console
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPaidOrderHtml, buildPaidOrderText } from './emailTemplates/paidOrder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const EMAIL_LOGS_FILE = path.join(DATA_DIR, 'email-logs.json');

// Email mode configuration
const EMAIL_MODE = process.env.EMAIL_MODE || 'test-log-only';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@hochungkhoi.site';
const FROM_NAME = process.env.FROM_NAME || 'Hoc Hung Khoi';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Read email logs
 */
function readEmailLogs() {
  try {
    if (!fs.existsSync(EMAIL_LOGS_FILE)) {
      return { logs: [] };
    }
    const content = fs.readFileSync(EMAIL_LOGS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return { logs: [] };
  }
}

/**
 * Write email logs
 */
function writeEmailLogs(data) {
  fs.writeFileSync(EMAIL_LOGS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Check if email already sent/logged for order (prevent duplicate)
 * Works across all EMAIL_MODE values
 */
function isEmailAlreadySent(orderId, type = 'paid_order') {
  const data = readEmailLogs();
  return data.logs.some(log =>
    log.orderId === orderId &&
    log.type === type &&
    (log.status === 'sent' || log.status === 'logged')
  );
}

// Backward compatibility alias
const isEmailAlreadyLogged = isEmailAlreadySent;

/**
 * Mask license key for safe logging
 */
function maskLicenseKey(key) {
  if (!key || key.length < 8) return '********';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/**
 * Sanitize metadata for logging - remove sensitive data
 */
function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};

  const allowed = ['productName', 'amount', 'customerEmail', 'productId', 'amountDopi', 'orderType'];
  const sanitized = {};

  for (const key of allowed) {
    if (metadata[key] !== undefined) {
      sanitized[key] = metadata[key];
    }
  }

  return sanitized;
}

/**
 * Log email to file (all modes)
 * Status: 'logged' (test) or 'sent' (real providers)
 * IMPORTANT: Never store html/text containing full license key in logs
 */
async function logEmail({ to, subject, html, text, orderId, licenseKey, type = 'paid_order', metadata = {}, status = 'logged', provider = null, providerMessageId = null }) {
  const data = readEmailLogs();

  const logEntry = {
    id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    mode: EMAIL_MODE,
    type,
    to: Array.isArray(to) ? to : [to],
    subject,
    // NEVER store full html/text in logs - they contain full license key
    html: null,
    text: null,
    orderId,
    licenseKey: licenseKey ? maskLicenseKey(licenseKey) : null, // Always mask in logs
    metadata: sanitizeMetadata(metadata),
    createdAt: new Date().toISOString(),
    status, // 'logged' | 'sent' | 'failed'
    provider,
    providerMessageId
  };

  data.logs.push(logEntry);
  writeEmailLogs(data);

  // Safe console log - no secrets, no full content
  console.log(`[Email ${status}] order=${orderId} type=${type} mode=${EMAIL_MODE} to=${Array.isArray(to) ? to.length : 1} recipient(s)`);

  return {
    ok: status !== 'failed',
    mode: EMAIL_MODE,
    logId: logEntry.id,
    status,
    message: status === 'sent' ? 'Email sent successfully' : 'Email logged'
  };
}

/**
 * Send email via Resend API using native fetch
 */
async function sendViaResend({ to, subject, html, text, orderId, licenseKey, type, metadata }) {
  if (!RESEND_API_KEY) {
    console.error('[Email] RESEND_API_KEY not configured');
    return { ok: false, error: 'Resend API key not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${response.status} ${error}`);
    }

    const result = await response.json();

    // Log success (without HTML content for privacy)
    await logEmail({
      to,
      subject,
      html: null, // Never store full HTML in logs
      text: null,
      orderId,
      licenseKey,
      type,
      metadata,
      status: 'sent',
      provider: 'resend',
      providerMessageId: result.id
    });

    return { ok: true, messageId: result.id, provider: 'resend' };
  } catch (err) {
    console.error('[Email] Resend failed:', err.message);
    await logEmail({
      to,
      subject,
      html: null,
      text: null,
      orderId,
      licenseKey,
      type,
      metadata,
      status: 'failed',
      provider: 'resend'
    });
    return { ok: false, error: err.message };
  }
}

/**
 * Send email via Brevo/Sendinblue API using native fetch
 */
async function sendViaBrevo({ to, subject, html, text, orderId, licenseKey, type, metadata }) {
  if (!BREVO_API_KEY) {
    console.error('[Email] BREVO_API_KEY not configured');
    return { ok: false, error: 'Brevo API key not configured' };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: (Array.isArray(to) ? to : [to]).map(email => ({ email })),
        subject,
        htmlContent: html,
        textContent: text
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Brevo API error: ${response.status} ${error}`);
    }

    const result = await response.json();

    await logEmail({
      to,
      subject,
      html: null,
      text: null,
      orderId,
      licenseKey,
      type,
      metadata,
      status: 'sent',
      provider: 'brevo',
      providerMessageId: result.messageId
    });

    return { ok: true, messageId: result.messageId, provider: 'brevo' };
  } catch (err) {
    console.error('[Email] Brevo failed:', err.message);
    await logEmail({
      to,
      subject,
      html: null,
      text: null,
      orderId,
      licenseKey,
      type,
      metadata,
      status: 'failed',
      provider: 'brevo'
    });
    return { ok: false, error: err.message };
  }
}

/**
 * Send paid order notification
 * Routes to appropriate provider based on EMAIL_MODE
 */
async function sendPaidOrderEmail({ to, order, license = null, product, dopiRechargeKey = null }) {
  if (!to) {
    return { ok: false, error: 'Missing recipient email' };
  }

  // Idempotency: Check if email already sent for this order
  if (isEmailAlreadySent(order.orderId, 'paid_order')) {
    console.log(`[Email] Duplicate prevented for order ${order.orderId}`);
    return { ok: true, skipped: true, reason: 'already_sent' };
  }

  // Generate email content with FULL license/Dopi key (only for sending to customer).
  const html = buildPaidOrderHtml({ order, license, product, dopiRechargeKey });
  const text = buildPaidOrderText({ order, license, product, dopiRechargeKey });
  const isDopiOrder = Boolean(dopiRechargeKey?.key);
  const subject = isDopiOrder
    ? 'Hoc Hung Khoi - Ma nap Dopi AI cua ban'
    : 'Hoc Hung Khoi - Ma kich hoat goi hoc cua ban';

  const emailData = {
    to,
    subject,
    html,
    text,
    orderId: order.orderId,
    licenseKey: license?.licenseKey || dopiRechargeKey?.key || null,
    type: 'paid_order',
    metadata: {
      productName: product?.name,
      amount: order.amount,
      customerEmail: order.customerEmail,
      productId: product?.id,
      amountDopi: dopiRechargeKey?.amountDopi || order.dopiAmount || null,
      orderType: isDopiOrder ? 'dopi_recharge' : 'license'
    }
  };

  // Route based on EMAIL_MODE
  switch (EMAIL_MODE) {
    case 'resend':
      if (!RESEND_API_KEY) {
        console.error('[Email] RESEND_API_KEY missing, falling back to test-log-only');
        return logEmail({ ...emailData, status: 'logged' });
      }
      return sendViaResend(emailData);

    case 'brevo':
      if (!BREVO_API_KEY) {
        console.error('[Email] BREVO_API_KEY missing, falling back to test-log-only');
        return logEmail({ ...emailData, status: 'logged' });
      }
      return sendViaBrevo(emailData);

    case 'test-log-only':
    default:
      // Test mode: log to file only, don't send
      return logEmail({ ...emailData, status: 'logged' });
  }
}

/**
 * Check if email service is configured for current EMAIL_MODE
 */
function isEmailConfigured() {
  switch (EMAIL_MODE) {
    case 'resend':
      return !!RESEND_API_KEY;
    case 'brevo':
      return !!BREVO_API_KEY;
    case 'test-log-only':
    default:
      return true; // Test mode always available
  }
}

/**
 * Get current email configuration status (safe for logging)
 */
function getEmailConfig() {
  return {
    mode: EMAIL_MODE,
    fromEmail: FROM_EMAIL,
    fromName: FROM_NAME,
    configured: isEmailConfigured(),
    hasResendKey: !!RESEND_API_KEY,
    hasBrevoKey: !!BREVO_API_KEY
    // Never expose actual key values
  };
}

/**
 * Get email log statistics
 */
function getEmailStats() {
  const data = readEmailLogs();
  return {
    total: data.logs.length,
    byType: data.logs.reduce((acc, log) => {
      acc[log.type] = (acc[log.type] || 0) + 1;
      return acc;
    }, {}),
    recent: data.logs.slice(-5).map(log => ({
      id: log.id,
      orderId: log.orderId,
      type: log.type,
      createdAt: log.createdAt
    }))
  };
}

export {
  sendPaidOrderEmail,
  isEmailConfigured,
  isEmailAlreadyLogged,
  isEmailAlreadySent,
  getEmailConfig,
  getEmailStats,
  logEmail,
  readEmailLogs
};
