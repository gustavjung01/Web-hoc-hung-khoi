/**
 * Email template for successful paid order (activation)
 * Mobile-friendly HTML + plain text fallback
 */

const COVER_IMAGE_URL = 'https://hochungkhoi.site/email/cover-facebook.png';
const SUPPORT_PHONE = process.env.SUPPORT_PHONE || '0902964685';
const WEBSITE_URL = 'https://hochungkhoi.site';

/**
 * Get app URL based on appId from license
 * @param {string} appId - App identifier (e.g., 'app-cap-01', 'lop-06')
 * @returns {string} App URL
 */
function getAppUrl(appId) {
  const urlMap = {
    'app-cap-01': 'https://app.hochungkhoi.site/cap-01/',
    'cap-01': 'https://app.hochungkhoi.site/cap-01/',
    'lop-06': 'https://app.hochungkhoi.site/lop-06/',
    'app-lop-06': 'https://app.hochungkhoi.site/lop-06/',
  };

  return urlMap[appId] || 'https://app.hochungkhoi.site/';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCurrency(amount) {
  return Number(amount || 0).toLocaleString('vi-VN') + ' VND';
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Build HTML email for paid order
 * NOTE: This contains FULL license key - only send to customer, never log
 */
function buildPaidOrderHtml({ order, license, product, dopiRechargeKey = null }) {
  const orderId = order.orderId || 'N/A';
  const productName = product?.name || order.productName || 'Goi hoc';
  const amount = formatCurrency(order.amount);
  const customerEmail = order.customerEmail || 'N/A';
  // FULL license key for email content only
  const licenseKey = license?.licenseKey || 'N/A';
  const dopiKey = dopiRechargeKey?.key || '';
  const dopiAmount = Number(dopiRechargeKey?.amountDopi || order.dopiAmount || product?.credits || product?.capacityUnits || 0);
  const startDate = formatDate(license?.startDate);
  const expiryDate = formatDate(license?.expiryDate);
  const appUrl = getAppUrl(license?.appId);

  if (dopiKey) {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ma nap Dopi AI</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:20px 10px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:24px 24px 0;background:#ffffff;">
              <img src="${COVER_IMAGE_URL}" alt="Hoc Hung Khoi" style="display:block;width:100%;max-width:640px;height:auto;border-radius:16px;margin:0 auto;">
            </td>
          </tr>
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 100%);padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Ma nap Dopi AI cua ban</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Hay giu ma nay de nap vao vi Dopi khi can dung AI.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <h2 style="margin:0 0 12px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(productName)}</h2>
                    <p style="margin:0;font-size:24px;font-weight:700;color:#2563eb;">${dopiAmount.toLocaleString('vi-VN')} Dopi</p>
                    <p style="margin:8px 0 0;color:#6b7280;font-size:14px;">So tien: <strong>${amount}</strong></p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="margin:0 0 16px;color:#065f46;font-size:16px;font-weight:600;">Thong tin ma nap</h3>
                    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Ma don hang: <strong style="color:#111827;">${escapeHtml(orderId)}</strong></p>
                    <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">Email mua hang: <strong style="color:#111827;">${escapeHtml(customerEmail)}</strong></p>
                    <div style="color:#059669;font-size:18px;font-weight:700;font-family:'Courier New',monospace;background:#d1fae5;padding:12px;border-radius:8px;word-break:break-all;">${escapeHtml(dopiKey)}</div>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;color:#7c2d12;font-size:14px;line-height:1.7;">
                    <strong>Can nho:</strong> Ma Dopi co the cong don vao vi. Ai nhap ma thi Dopi se nap vao tai khoan/license do. Neu xoa cache, cai lai desktop, hoac doi trinh duyet, Dopi da nap van nam tren server theo email/license da nap.
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${WEBSITE_URL}/#/account" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">Vao tai khoan de nap Dopi</a>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;padding-top:24px;">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Can ho tro? Lien he:</p>
                    <p style="margin:0;color:#111827;font-size:18px;font-weight:700;">${SUPPORT_PHONE}</p>
                    <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Email nay duoc gui tu dong - vui long khong reply truc tiep</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  // Bundle grades info
  let bundleInfo = '';
  if (license?.selectedGrades && license.selectedGrades.length > 0) {
    const gradeNames = license.selectedGrades.map(g => g.name).join(', ');
    bundleInfo = `<p style="margin:8px 0;font-size:14px;color:#6b7280;">Cac lop da chon: <strong style="color:#374151;">${escapeHtml(gradeNames)}</strong> (khong the doi sau khi kich hoat)</p>`;
  }

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kich hoat goi hoc thanh cong</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:20px 10px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">

          <!-- Brand Cover Image -->
          <tr>
            <td style="padding:24px 24px 0;background:#ffffff;">
              <img src="${COVER_IMAGE_URL}" alt="Học Hứng Khởi" style="display:block;width:100%;max-width:640px;height:auto;border-radius:16px;margin:0 auto;">
            </td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Kich hoat goi hoc thanh cong</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Cam on ban da dong hanh cung con hoc tap</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:32px;">

              <!-- Product Card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <h2 style="margin:0 0 12px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(productName)}</h2>
                    <p style="margin:0;font-size:24px;font-weight:700;color:#059669;">${amount}</p>
                    ${bundleInfo}
                  </td>
                </tr>
              </table>

              <!-- License Info -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="margin:0 0 16px;color:#065f46;font-size:16px;font-weight:600;">Thong tin kich hoat</h3>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:14px;width:120px;">Ma don hang:</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${escapeHtml(orderId)}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Email:</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:500;">${escapeHtml(customerEmail)}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:14px;">License key:</td>
                        <td style="padding:8px 0;color:#059669;font-size:16px;font-weight:700;font-family:'Courier New',monospace;background:#d1fae5;padding:8px;border-radius:4px;">${escapeHtml(licenseKey)}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Bat dau:</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;">${startDate}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;font-size:14px;">Het han:</td>
                        <td style="padding:8px 0;color:#111827;font-size:14px;">${expiryDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Usage Guide -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="margin:0 0 16px;color:#1e40af;font-size:16px;font-weight:600;">Huong dan su dung</h3>

                    <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">
                      <strong style="color:#1d4ed8;">Web:</strong> Truy cap <a href="${appUrl}" style="color:#2563eb;text-decoration:none;">${appUrl}</a>, dang nhap bang email va license key.
                    </p>

                    <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">
                      <strong style="color:#1d4ed8;">Desktop:</strong> Tai app, nhap license key.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">Vao hoc ngay</a>
                  </td>
                </tr>
              </table>

              <!-- Support -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e5e7eb;padding-top:24px;">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Can ho tro? Lien he:</p>
                    <p style="margin:0;color:#111827;font-size:18px;font-weight:700;">📞 ${SUPPORT_PHONE}</p>
                    <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Email nay duoc gui tu dong - vui long khong reply truc tiep</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Build plain text email for paid order
 * NOTE: This contains FULL license key - only send to customer, never log
 */
function buildPaidOrderText({ order, license, product, dopiRechargeKey = null }) {
  const orderId = order.orderId || 'N/A';
  const productName = product?.name || order.productName || 'Goi hoc';
  const amount = formatCurrency(order.amount);
  const customerEmail = order.customerEmail || 'N/A';
  // FULL license key for email content only
  const licenseKey = license?.licenseKey || 'N/A';
  const dopiKey = dopiRechargeKey?.key || '';
  const dopiAmount = Number(dopiRechargeKey?.amountDopi || order.dopiAmount || product?.credits || product?.capacityUnits || 0);
  const startDate = formatDate(license?.startDate);
  const expiryDate = formatDate(license?.expiryDate);
  const appUrl = getAppUrl(license?.appId);

  if (dopiKey) {
    return `MA NAP DOPI AI CUA BAN
=========================

Cam on ban da mua Dopi AI tai Hoc Hung Khoi.

SAN PHAM
--------
Ten goi: ${productName}
So tien: ${amount}
So Dopi: ${dopiAmount.toLocaleString('vi-VN')} Dopi

THONG TIN MA NAP
----------------
Ma don hang: ${orderId}
Email mua hang: ${customerEmail}
Ma nap Dopi: ${dopiKey}

HUONG DAN
---------
Vao tai khoan: ${WEBSITE_URL}/#/account
Nhap ma Dopi de nap vao vi.

Luu y: Ai nhap ma thi Dopi se nap vao tai khoan/license do. Neu xoa cache, cai lai desktop, hoac doi trinh duyet, Dopi da nap van nam tren server theo email/license da nap.

HO TRO
------
Hotline: ${SUPPORT_PHONE}
Website: ${WEBSITE_URL}

Email nay duoc gui tu dong - vui long khong reply truc tiep.
`;
  }

  let bundleText = '';
  if (license?.selectedGrades && license.selectedGrades.length > 0) {
    const gradeNames = license.selectedGrades.map(g => g.name).join(', ');
    bundleText = `\nCac lop da chon: ${gradeNames} (khong the doi sau khi kich hoat)\n`;
  }

  return `KICH HOAT GOI HOC THANH CONG
================================

Cam on ban da dong hanh cung con hoc tap!

SAN PHAM
---------
Ten goi: ${productName}
So tien: ${amount}${bundleText}

THONG TIN KICH HOAT
-------------------
Ma don hang: ${orderId}
Email: ${customerEmail}
License key: ${licenseKey}
Ngay bat dau: ${startDate}
Ngay het han: ${expiryDate}

HUONG DAN SU DUNG
-----------------
Web: Truy cap ${appUrl}, dang nhap bang email va license key.

Desktop: Tai app, nhap license key.

HO TRO
-------
Hotline: ${SUPPORT_PHONE}
Website: ${WEBSITE_URL}

Email nay duoc gui tu dong - vui long khong reply truc tiep.
`;
}

export {
  buildPaidOrderHtml,
  buildPaidOrderText,
  getAppUrl,
  COVER_IMAGE_URL,
  SUPPORT_PHONE,
  WEBSITE_URL
};
