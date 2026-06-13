#!/bin/bash
# Deploy script for Hoc Hung Khoi Backend to VPS (Bash version)
# Run from project root: ./deploy/deploy-to-vps.sh

set -e

VPS_IP="140.245.202.65"
VPS_USER="ubuntu"
LOCAL_BACKEND_DIR="server"
REMOTE_BACKEND_DIR="/opt/hochungkhoi-backend"

echo "=== Deploy Hoc Hung Khoi Backend to VPS $VPS_IP ==="

# Step 1: Create deploy package
echo ""
echo "[1/6] Creating deploy package..."

if [ -f "$LOCAL_BACKEND_DIR/.env" ]; then
    echo "WARNING: Found .env in server/ - will NOT be copied"
fi

DEPLOY_DIR="deploy-package"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Copy backend files (excluding .env and data/)
cp "$LOCAL_BACKEND_DIR/index.js" $DEPLOY_DIR/
cp "$LOCAL_BACKEND_DIR/package.json" $DEPLOY_DIR/
cp "$LOCAL_BACKEND_DIR/package-lock.json" $DEPLOY_DIR/
mkdir -p "$DEPLOY_DIR/data"

echo "Deploy package created in $DEPLOY_DIR/"

# Step 2: Copy backend files to VPS (via /tmp with sudo)
echo ""
echo "[2/6] Copying backend files to VPS..."
REMOTE_TEMP="/tmp/hochungkhoi-deploy"

# Clean up temp and create it
ssh ${VPS_USER}@${VPS_IP} "sudo rm -rf $REMOTE_TEMP && mkdir -p $REMOTE_TEMP"

# Copy to temp first
scp -r $DEPLOY_DIR/* ${VPS_USER}@${VPS_IP}:${REMOTE_TEMP}/

# Move to final location with sudo
ssh ${VPS_USER}@${VPS_IP} "sudo mkdir -p ${REMOTE_BACKEND_DIR} && sudo cp -r ${REMOTE_TEMP}/* ${REMOTE_BACKEND_DIR}/ && sudo rm -rf ${REMOTE_TEMP}"

# Step 3: Copy systemd service (via /tmp with sudo)
echo ""
echo "[3/6] Copying systemd service file..."
scp "deploy/hochungkhoi-api.service" ${VPS_USER}@${VPS_IP}:/tmp/hochungkhoi-api.service
ssh ${VPS_USER}@${VPS_IP} "sudo mv /tmp/hochungkhoi-api.service /etc/systemd/system/"

# Step 4: Copy nginx config (via /tmp with sudo)
echo ""
echo "[4/6] Copying nginx config..."
scp "deploy/hochungkhoi-nginx-api.conf" ${VPS_USER}@${VPS_IP}:/tmp/hochungkhoi-nginx-api.conf
ssh ${VPS_USER}@${VPS_IP} "sudo mv /tmp/hochungkhoi-nginx-api.conf /etc/nginx/conf.d/hochungkhoi-api.conf"

# Step 5: Setup on VPS with sudo
echo ""
echo "[5/6] Setting up on VPS..."
ssh ${VPS_USER}@${VPS_IP} << 'REMOTE_SCRIPT'
cd /opt/hochungkhoi-backend && sudo npm ci --production

sudo mkdir -p /opt/hochungkhoi-backend/data
sudo chown -R www-data:www-data /opt/hochungkhoi-backend/data

sudo systemctl daemon-reload
sudo systemctl enable hochungkhoi-api

sudo nginx -t && sudo systemctl reload nginx

echo "=== Service Status ==="
sudo systemctl status hochungkhoi-api --no-pager || true
REMOTE_SCRIPT

# Step 6: Post-deploy instructions
echo ""
echo "[6/6] Deploy completed!"
cat << 'INSTRUCTIONS'

=== NEXT STEPS (on VPS) ===

1. Create .env file:
   ssh ubuntu@140.245.202.65
   sudo cat > /opt/hochungkhoi-backend/.env << 'EOF'
PORT=3001
NODE_ENV=production
SEPAY_WEBHOOK_SECRET=YOUR_SECRET_HERE
EOF
   sudo chmod 600 /opt/hochungkhoi-backend/.env

2. Start the service:
   sudo systemctl start hochungkhoi-api

3. Check logs:
   sudo journalctl -u hochungkhoi-api -f

4. Test locally:
   curl http://127.0.0.1:3001/api/health

5. Test public:
   curl https://hochungkhoi.site/api/health

=== IMPORTANT ===
- Do NOT enable SePay webhook until /api/health returns 200
- Keep .env file secure (chmod 600)
- NEVER commit secrets to Git
INSTRUCTIONS

# Cleanup
rm -rf $DEPLOY_DIR
echo ""
echo "Cleanup completed."
