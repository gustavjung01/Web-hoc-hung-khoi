#!/usr/bin/env bash
set -euo pipefail

echo "=== HochungKhoi API setup start ==="

echo "Paste SEPAY_WEBHOOK_SECRET, then press Enter:"
read -r -s SEPAY_SECRET
echo ""

if [ -z "$SEPAY_SECRET" ]; then
  echo "ERROR: SEPAY_WEBHOOK_SECRET is empty"
  exit 1
fi

APP_DIR="/opt/hochungkhoi-backend"
SERVICE_FILE="/etc/systemd/system/hochungkhoi-api.service"
BAD_NGINX_CONF="/etc/nginx/conf.d/hochungkhoi-api.conf"

echo "=== 1. Remove bad nginx conf if exists ==="
if [ -f "$BAD_NGINX_CONF" ]; then
  sudo mv "$BAD_NGINX_CONF" "/tmp/hochungkhoi-api.conf.bad.$(date +%s)"
fi

sudo nginx -t

echo "=== 2. Check backend files ==="
if [ ! -f "$APP_DIR/index.js" ]; then
  echo "ERROR: Missing $APP_DIR/index.js"
  echo "Backend files have not been copied to VPS yet."
  exit 1
fi

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "ERROR: Missing $APP_DIR/package.json"
  exit 1
fi

echo "=== 3. Write backend .env ==="
sudo tee "$APP_DIR/.env" > /dev/null << EOF
PORT=3001
NODE_ENV=production
SEPAY_WEBHOOK_SECRET=$SEPAY_SECRET
EOF

sudo chmod 600 "$APP_DIR/.env"
sudo chown www-data:www-data "$APP_DIR/.env"

echo "=== 4. Install dependencies ==="
cd "$APP_DIR"
sudo npm ci --omit=dev

echo "=== 5. Prepare data folder ==="
sudo mkdir -p "$APP_DIR/data"
sudo chown -R www-data:www-data "$APP_DIR/data"

echo "=== 6. Write systemd service ==="
sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Hoc Hung Khoi Payment API
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/index.js
Restart=on-failure
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
EOF

echo "=== 7. Start backend service ==="
sudo systemctl daemon-reload
sudo systemctl enable hochungkhoi-api
sudo systemctl restart hochungkhoi-api
sleep 2

echo "=== 8. Service status ==="
sudo systemctl status hochungkhoi-api --no-pager || true

echo "=== 9. Test local health ==="
curl -fsS http://127.0.0.1:3001/api/health
echo ""

echo "=== 10. Find nginx file for hochungkhoi.site ==="
NGINX_FILE="$(sudo grep -R "server_name.*hochungkhoi.site" -l /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -n 1 || true)"

if [ -z "$NGINX_FILE" ]; then
  echo "ERROR: Cannot find nginx server block for hochungkhoi.site"
  echo "Run: sudo nginx -T | grep -n 'server_name.*hochungkhoi' -C 30"
  exit 1
fi

echo "Found nginx file: $NGINX_FILE"

echo "=== 11. Insert /api/ location into correct server block ==="
sudo cp "$NGINX_FILE" "$NGINX_FILE.bak.$(date +%s)"

sudo python3 - "$NGINX_FILE" << 'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()

api_block = r'''
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
'''

if "proxy_pass http://127.0.0.1:3001/api/" in text:
    print("API location already exists. No change.")
    sys.exit(0)

idx = text.find("server_name")
if idx == -1 or "hochungkhoi.site" not in text[idx:idx+300]:
    raise SystemExit("Could not find hochungkhoi.site server_name near expected place")

server_start = text.rfind("server", 0, idx)
brace_start = text.find("{", server_start)
if server_start == -1 or brace_start == -1:
    raise SystemExit("Could not locate server block start")

depth = 0
server_end = None
for i in range(brace_start, len(text)):
    if text[i] == "{":
        depth += 1
    elif text[i] == "}":
        depth -= 1
        if depth == 0:
            server_end = i
            break

if server_end is None:
    raise SystemExit("Could not locate server block end")

new_text = text[:server_end] + api_block + "\n" + text[server_end:]
path.write_text(new_text)
print("Inserted API location.")
PY

echo "=== 12. Test and reload nginx ==="
sudo nginx -t
sudo systemctl reload nginx

echo "=== 13. Test public health ==="
curl -i https://hochungkhoi.site/api/health

echo "=== DONE ==="
