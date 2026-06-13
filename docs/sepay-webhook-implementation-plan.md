# SePay Webhook Implementation Plan

## Domain
- **Production**: https://hochungkhoi.site
- **Webhook URL**: https://hochungkhoi.site/api/payments/webhooks/sepay

## Authentication Method
- **Algorithm**: HMAC-SHA256
- **Signature Header**: `x-sepay-signature`
- **Secret Storage**: `SEPAY_WEBHOOK_SECRET` (server-side env only)

## Webhook Flow

### 1. Endpoint
```
POST /api/payments/webhooks/sepay
```

### 2. Signature Verification
- Extract signature from header `x-sepay-signature`
- Compute HMAC-SHA256 of raw request body using `SEPAY_WEBHOOK_SECRET`
- Compare computed signature with received signature (constant-time)
- **If fail**: Return HTTP 401/403, do not process

### 3. Payload Processing (after verify pass)
- Save raw payload to temporary storage for audit/debugging
- Parse JSON payload

### 4. Payment Validation (to be implemented later)
Check the following fields:
- `code` / `orderId`: Mã đơn hàng
- `transferAmount`: Số tiền chuyển khoản
- `accountNumber`: Tài khoản nhận (must match configured account)
- `transactionId`: Kiểm tra giao dịch trùng lặp
- Order status: Must be `pending` before marking `paid`

### 5. Post-Payment Actions (to be implemented later)
**Only after verified paid:**
1. Mark order as `paid`
2. Create or extend license key
3. Send confirmation email via Resend

### 6. Email Policy
- **Clerk**: Chỉ dùng để lấy user/email, KHÔNG dùng để gửi email thanh toán
- **Resend**: Chỉ gửi email sau khi tạo/gia hạn key thành công

## Security Requirements
- **NEVER** log `SEPAY_WEBHOOK_SECRET` to terminal/log
- **NEVER** expose secret in frontend code
- **NEVER** commit real secrets to Git
- Raw webhook payloads: store temporarily in `server/data/` (gitignored)

## Environment Variables (Server)
```
SEPAY_WEBHOOK_SECRET=whsec_xxx
SEPAY_WEBHOOK_URL=https://hochungkhoi.site/api/payments/webhooks/sepay
```

## API Endpoints

### Health Check
```
GET /api/health
Response: { ok: true, service: "hochungkhoi-payment-api" }
```

### SePay Webhook
```
POST /api/payments/webhooks/sepay
Headers:
  Content-Type: application/json
  x-sepay-signature: <hmac-signature>
Body: <raw-json-payload>

Response (success): { ok: true, received: true }
Response (invalid signature): 401/403
```

## Current Phase (Scaffold Only)
- ✅ HMAC verification implemented
- ✅ Raw payload logging (safe, no secrets)
- ✅ HTTP 200 response on valid webhook
- ⏳ Database order management (future)
- ⏳ License key generation (future)
- ⏳ Resend email integration (future)
- ⏳ Production QR code generation (future)

## Reference
- Based on flow from: https://github.com/khuongbinhinfo-a11y/web_Sales_Total
- Adapted for hochungkhoi.site requirements
