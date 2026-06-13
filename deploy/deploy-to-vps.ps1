# Deploy script for Hoc Hung Khoi Backend to VPS
# Run from project root

$ErrorActionPreference = "Stop"

$VPS_IP = "140.245.202.65"
$VPS_USER = "ubuntu"
$LOCAL_BACKEND_DIR = "server"
$REMOTE_BACKEND_DIR = "/opt/hochungkhoi-backend"

# Read SSH key path from docs/keys.md
$SSH_KEY = $null
if (Test-Path "docs/keys.md") {
    $keyLine = Select-String -Path "docs/keys.md" -Pattern "^VPS_WEB_SSH_KEY_PATH=" | Select-Object -First 1
    if ($keyLine) {
        $SSH_KEY = $keyLine.Line -replace "^VPS_WEB_SSH_KEY_PATH=", ""
    }
}

if (-not $SSH_KEY -or -not (Test-Path $SSH_KEY)) {
    throw "SSH key not found. Please ensure docs/keys.md contains VPS_WEB_SSH_KEY_PATH"
}

Write-Host "Using SSH key: $SSH_KEY" -ForegroundColor DarkGray

Write-Host "=== Deploy Hoc Hung Khoi Backend to VPS $VPS_IP ===" -ForegroundColor Green

# Step 1: Create deploy package locally
Write-Host "`n[1/6] Creating deploy package..." -ForegroundColor Yellow

# Ensure no .env in package
if (Test-Path "$LOCAL_BACKEND_DIR\.env") {
    Write-Host "WARNING: Found .env in server/ - will NOT be copied" -ForegroundColor Red
}

# Create temp deploy directory
$DEPLOY_DIR = "deploy-package"
if (Test-Path $DEPLOY_DIR) {
    Remove-Item -Recurse -Force $DEPLOY_DIR
}
New-Item -ItemType Directory -Force -Path $DEPLOY_DIR | Out-Null

# Copy backend files (excluding .env and data/)
Copy-Item "$LOCAL_BACKEND_DIR\index.js" $DEPLOY_DIR\
Copy-Item "$LOCAL_BACKEND_DIR\package.json" $DEPLOY_DIR\
Copy-Item "$LOCAL_BACKEND_DIR\package-lock.json" $DEPLOY_DIR\
New-Item -ItemType Directory -Force -Path "$DEPLOY_DIR\data" | Out-Null

Write-Host "Deploy package created in $DEPLOY_DIR/" -ForegroundColor Green

# Step 2: Copy backend files to VPS (via /tmp with sudo)
Write-Host "`n[2/6] Copying backend files to VPS..." -ForegroundColor Yellow
$REMOTE_TEMP = "/tmp/hochungkhoi-deploy"

# Copy to temp directory first
ssh -i "$SSH_KEY" ${VPS_USER}@${VPS_IP} "sudo rm -rf $REMOTE_TEMP && mkdir -p $REMOTE_TEMP"
scp -i "$SSH_KEY" -r $DEPLOY_DIR/* ${VPS_USER}@${VPS_IP}:${REMOTE_TEMP}/
if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy backend files to temp"
}

# Move to final location with sudo
ssh -i "$SSH_KEY" ${VPS_USER}@${VPS_IP} "sudo mkdir -p ${REMOTE_BACKEND_DIR} && sudo cp -r ${REMOTE_TEMP}/* ${REMOTE_BACKEND_DIR}/ && sudo rm -rf ${REMOTE_TEMP}"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to move backend files to /opt"
}

# Step 3: Copy systemd service (via /tmp with sudo)
Write-Host "`n[3/6] Copying systemd service file..." -ForegroundColor Yellow
scp -i "$SSH_KEY" "deploy\hochungkhoi-api.service" ${VPS_USER}@${VPS_IP}:/tmp/hochungkhoi-api.service
ssh -i "$SSH_KEY" ${VPS_USER}@${VPS_IP} "sudo mv /tmp/hochungkhoi-api.service /etc/systemd/system/"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy service file"
}

# Step 4: Keep existing nginx site config
# The live site already uses /etc/nginx/sites-enabled/hochungkhoi.site.
# Do not copy the legacy conf.d server block again because it conflicts with the live site.
Write-Host "`n[4/6] Keeping existing nginx site config (no overwrite)..." -ForegroundColor Yellow

# Step 5: Setup on VPS with sudo
Write-Host "`n[5/6] Setting up on VPS..." -ForegroundColor Yellow
$setupScript = @"
# Install dependencies
cd $REMOTE_BACKEND_DIR && sudo npm ci --production

# Create data directory and set permissions
sudo mkdir -p $REMOTE_BACKEND_DIR/data
sudo chown -R www-data:www-data $REMOTE_BACKEND_DIR/data

# Setup systemd
sudo systemctl daemon-reload
sudo systemctl enable hochungkhoi-api
sudo systemctl restart hochungkhoi-api

# Check nginx config
sudo nginx -t && sudo systemctl reload nginx

# Show status
echo "=== Service Status ==="
sudo systemctl status hochungkhoi-api --no-pager || true
"@

$setupScript | ssh -i "$SSH_KEY" ${VPS_USER}@${VPS_IP} "bash -s"

# Step 6: Post-deploy instructions
Write-Host "`n[6/6] Deploy completed!" -ForegroundColor Green
Write-Host @"

=== NEXT STEPS (on VPS) ===

1. Create .env file:
   ssh -i "$SSH_KEY" $VPS_USER@$VPS_IP
   sudo cat > $REMOTE_BACKEND_DIR/.env << 'EOF'
PORT=3001
NODE_ENV=production
SEPAY_WEBHOOK_SECRET=YOUR_SECRET_HERE
EOF
   sudo chmod 600 $REMOTE_BACKEND_DIR/.env

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
"@

# Cleanup
Remove-Item -Recurse -Force $DEPLOY_DIR
Write-Host "`nCleanup completed." -ForegroundColor Green
