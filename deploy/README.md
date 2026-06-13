# Deploy Backend Scaffold to VPS

## VPS Info
- **IP**: 140.245.202.65 (NEW - không đụng 68.233.111.135)
- **Domain**: hochungkhoi.site
- **Backend Port**: 3001 (internal)

## Files cần copy lên VPS

### 1. Backend Package
```
~/hochungkhoi-backend/
├── index.js
├── package.json
├── package-lock.json
├── .env (tạo trên VPS, không copy từ local)
└── data/ (tạo trên VPS)
```

### 2. Systemd Service
File: `/etc/systemd/system/hochungkhoi-api.service`

### 3. Nginx Config
File: `/etc/nginx/sites-available/hochungkhoi.site` (hoặc conf.d/)

## Các bước deploy

### Bước 1: Copy files lên VPS
```bash
# Từ local, chạy:
scp -r ~/hochungkhoi-backend/ root@140.245.202.65:/opt/
scp hochungkhoi-api.service root@140.245.202.65:/etc/systemd/system/
scp hochungkhoi-nginx-api.conf root@140.245.202.65:/etc/nginx/conf.d/
```

### Bước 2: Trên VPS, cài Node.js và dependencies
```bash
# Cài Node.js 18+ nếu chưa có
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Cài dependencies
cd /opt/hochungkhoi-backend
npm ci --production
```

### Bước 3: Tạo env file trên VPS
```bash
cat > /opt/hochungkhoi-backend/.env << 'EOF'
PORT=3001
NODE_ENV=production
SEPAY_WEBHOOK_SECRET=YOUR_ACTUAL_SECRET_HERE
EOF

# Set quyền
chmod 600 /opt/hochungkhoi-backend/.env
```

### Bước 4: Tạo data directory
```bash
mkdir -p /opt/hochungkhoi-backend/data
chown -R www-data:www-data /opt/hochungkhoi-backend/data
```

### Bước 5: Start backend service
```bash
systemctl daemon-reload
systemctl enable hochungkhoi-api
systemctl start hochungkhoi-api
systemctl status hochungkhoi-api
```

### Bước 6: Reload Nginx
```bash
nginx -t
systemctl reload nginx
```

### Bước 7: Test
```bash
# Test local
curl http://127.0.0.1:3001/api/health

# Test public
curl https://hochungkhoi.site/api/health
```

## Kiểm tra logs
```bash
# Backend logs
journalctl -u hochungkhoi-api -f

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## Lưu ý quan trọng
- **Không** bật SePay webhook thật cho đến khi `/api/health` trả về 200 OK
- **Không** commit file `.env` lên Git
- **Không** log `SEPAY_WEBHOOK_SECRET` ra console
