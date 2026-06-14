import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function write(relPath, content) {
  fs.writeFileSync(path.join(repoRoot, relPath), content, 'utf8');
}

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Không tìm thấy đoạn cần thay: ${label}`);
  }
  return content.replace(search, replacement);
}

function insertAfter(content, search, insertion, label) {
  if (!content.includes(search)) {
    throw new Error(`Không tìm thấy điểm chèn: ${label}`);
  }
  if (content.includes(insertion.trim().split('\n')[0])) {
    return content;
  }
  return content.replace(search, `${search}${insertion}`);
}

function patchServer() {
  const relPath = 'server/index.js';
  let content = read(relPath);

  content = insertAfter(
    content,
    `const app = express();\nconst PORT = process.env.PORT || 3001;\n`,
    `\nconst DEFAULT_LICENSE_DEVICE_LIMIT = 1;\n\nfunction normalizeLicenseDeviceLimit(value) {\n  const parsed = Number.parseInt(value, 10);\n  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LICENSE_DEVICE_LIMIT;\n}\n\nfunction getActiveLicenseDevices(licenseKey, activations = loadActivations()) {\n  const normalizedKey = String(licenseKey || '').toUpperCase();\n  return activations\n    .filter((activation) => activation.licenseKey === normalizedKey && activation.isActive)\n    .map((activation) => ({\n      activationId: activation.activationId,\n      deviceId: activation.deviceId,\n      deviceName: activation.deviceName || 'Unknown Device',\n      appId: activation.appId || null,\n      ipAddress: activation.ipAddress || null,\n      activatedAt: activation.activatedAt || null,\n      lastSeenAt: activation.lastSeenAt || null,\n      isActive: Boolean(activation.isActive),\n    }));\n}\n\nfunction enrichLicenseForAdmin(license, activations = loadActivations()) {\n  const devices = getActiveLicenseDevices(license.licenseKey, activations);\n  return {\n    ...license,\n    deviceLimit: normalizeLicenseDeviceLimit(license.deviceLimit),\n    activeDeviceCount: devices.length,\n    devices,\n  };\n}\n`,
    'server license helpers',
  );

  content = replaceOnce(
    content,
    `  const total = licenses.length;\n  const startIndex = (page - 1) * limit;\n  const paginated = licenses.slice(startIndex, startIndex + limit);\n`,
    `  const allActivations = loadActivations();\n  const total = licenses.length;\n  const startIndex = (page - 1) * limit;\n  const paginated = licenses\n    .slice(startIndex, startIndex + limit)\n    .map((license) => enrichLicenseForAdmin(license, allActivations));\n`,
    'admin license list enrichment',
  );

  content = replaceOnce(
    content,
    `  const { customerEmail, productId, durationMonths = 12, deviceLimit = 2, notes = '', selectedGrades = [] } = req.body;\n`,
    `  const { customerEmail, productId, durationMonths = 12, deviceLimit = DEFAULT_LICENSE_DEVICE_LIMIT, notes = '', selectedGrades = [] } = req.body;\n`,
    'manual license default destructure',
  );

  content = replaceOnce(
    content,
    `    deviceLimit: parseInt(deviceLimit) || 2,\n`,
    `    deviceLimit: normalizeLicenseDeviceLimit(deviceLimit),\n`,
    'manual license device limit normalize',
  );

  content = replaceOnce(
    content,
    `  // Update device limit\n  if (deviceLimit && parseInt(deviceLimit) > 0) {\n    license.deviceLimit = parseInt(deviceLimit);\n  }\n`,
    `  // Update device limit\n  if (deviceLimit !== undefined) {\n    license.deviceLimit = normalizeLicenseDeviceLimit(deviceLimit);\n  }\n`,
    'patch license device limit normalize',
  );

  content = insertAfter(
    content,
    `app.patch('/api/admin/licenses/:licenseKey', requireAdmin, (req, res) => {`,
    '',
    'noop',
  );

  const resetEndpoint = `\n/**\n * POST /api/admin/licenses/:licenseKey/devices/reset\n * Deactivate all active devices for a license, or a specific deviceId when provided.\n */\napp.post('/api/admin/licenses/:licenseKey/devices/reset', requireAdmin, (req, res) => {\n  const { licenseKey } = req.params;\n  const { deviceId } = req.body || {};\n  const normalizedKey = String(licenseKey || '').toUpperCase();\n\n  const licenses = loadLicenses();\n  const license = licenses.find(l => l.licenseKey === normalizedKey);\n\n  if (!license) {\n    return res.status(404).json({ ok: false, error: 'License not found' });\n  }\n\n  const now = new Date().toISOString();\n  const activations = loadActivations();\n  let changedCount = 0;\n\n  for (const activation of activations) {\n    const matchesLicense = activation.licenseKey === normalizedKey;\n    const matchesDevice = !deviceId || activation.deviceId === deviceId;\n    if (matchesLicense && matchesDevice && activation.isActive) {\n      activation.isActive = false;\n      activation.deactivatedAt = now;\n      activation.deactivatedBy = 'admin';\n      changedCount += 1;\n    }\n  }\n\n  saveActivations(activations);\n\n  res.json({\n    ok: true,\n    changedCount,\n    license: enrichLicenseForAdmin(license, activations),\n    message: deviceId ? 'Device reset successfully' : 'All active devices reset successfully',\n  });\n});\n`;

  if (!content.includes("/api/admin/licenses/:licenseKey/devices/reset")) {
    content = replaceOnce(
      content,
      `/**\n * DELETE /api/admin/licenses/:licenseKey\n * Delete license permanently\n */\n`,
      `${resetEndpoint}\n/**\n * DELETE /api/admin/licenses/:licenseKey\n * Delete license permanently\n */\n`,
      'admin reset devices endpoint',
    );
  }

  write(relPath, content);
}

function patchAdminLicensesPage() {
  const relPath = 'src/AdminLicensesPage.tsx';
  let content = read(relPath);

  content = replaceOnce(
    content,
    `  devices?: { deviceId: string; deviceName: string; lastSeenAt: string }[];\n`,
    `  activeDeviceCount?: number;\n  devices?: {\n    activationId?: string;\n    deviceId: string;\n    deviceName: string;\n    appId?: string | null;\n    ipAddress?: string | null;\n    activatedAt?: string | null;\n    lastSeenAt: string;\n    isActive?: boolean;\n  }[];\n`,
    'admin license device fields',
  );

  content = content
    .replace(`    deviceLimit: 2,`, `    deviceLimit: 1,`)
    .replace(`  const [editForm, setEditForm] = useState({ status: '', extendMonths: 0, deviceLimit: 2, notes: '' });`, `  const [editForm, setEditForm] = useState({ status: '', extendMonths: 0, deviceLimit: 1, notes: '' });`)
    .replace(`setNewLicense({ customerEmail: '', productId: '', durationMonths: 12, deviceLimit: 2, notes: '' });`, `setNewLicense({ customerEmail: '', productId: '', durationMonths: 12, deviceLimit: 1, notes: '' });`)
    .replace(`onChange={(e) => setNewLicense({ ...newLicense, deviceLimit: parseInt(e.target.value) || 2 })}`, `onChange={(e) => setNewLicense({ ...newLicense, deviceLimit: parseInt(e.target.value) || 1 })}`)
    .replace(`onChange={(e) => setEditForm({ ...editForm, deviceLimit: parseInt(e.target.value) || 2 })}`, `onChange={(e) => setEditForm({ ...editForm, deviceLimit: parseInt(e.target.value) || 1 })}`);

  const handler = `\n  const handleResetDevices = async (licenseKey: string) => {\n    if (!confirm('Reset toàn bộ thiết bị đang chiếm slot của license này? Khách sẽ cần kích hoạt lại trên thiết bị mới.')) return;\n    setLoading(true);\n    try {\n      const token = await getToken();\n      const headers: Record<string, string> = { 'Content-Type': 'application/json' };\n      if (token) {\n        headers['Authorization'] = \`Bearer \${token}\`;\n      }\n\n      const res = await fetch(\`${API_BASE}/api/admin/licenses/\${licenseKey}/devices/reset\`, {\n        method: 'POST',\n        headers,\n        body: JSON.stringify({})\n      });\n      const data = await res.json();\n      if (data.ok) {\n        fetchLicenses();\n      } else {\n        setError(data.error || 'Failed to reset devices');\n      }\n    } catch {\n      setError('Network error');\n    } finally {\n      setLoading(false);\n    }\n  };\n`;

  if (!content.includes('handleResetDevices')) {
    content = replaceOnce(
      content,
      `  const handleDelete = async (licenseKey: string) => {`,
      `${handler}\n  const handleDelete = async (licenseKey: string) => {`,
      'admin reset devices handler',
    );
  }

  content = replaceOnce(
    content,
    `                      <div className="font-medium text-gray-900">{license.productName}</div>\n                      <div className="text-xs text-gray-500">{license.deviceLimit} thiết bị</div>\n`,
    `                      <div className="font-medium text-gray-900">{license.productName}</div>\n                      <div className="text-xs text-gray-500">{license.activeDeviceCount ?? license.devices?.length ?? 0}/{license.deviceLimit} thiết bị active</div>\n                      {license.devices && license.devices.length > 0 ? (\n                        <div className="mt-1 max-w-[220px] text-[11px] text-gray-400">\n                          {license.devices.slice(0, 2).map((device) => (\n                            <div key={device.activationId || device.deviceId} className="truncate" title={device.deviceId}>\n                              {device.deviceName || device.deviceId} · {device.lastSeenAt ? formatDate(device.lastSeenAt) : '-'}\n                            </div>\n                          ))}\n                          {license.devices.length > 2 ? <div>+{license.devices.length - 2} thiết bị khác</div> : null}\n                        </div>\n                      ) : null}\n`,
    'admin device count display',
  );

  content = replaceOnce(
    content,
    `                         <button\n                           onClick={() => handleDelete(license.licenseKey)}\n                           className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition"\n                         >\n                           Xóa\n                         </button>\n`,
    `                         <button\n                           onClick={() => handleResetDevices(license.licenseKey)}\n                           disabled={!((license.activeDeviceCount ?? license.devices?.length ?? 0) > 0)}\n                           className="px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100 transition disabled:opacity-50"\n                         >\n                           Reset thiết bị\n                         </button>\n                         <button\n                           onClick={() => handleDelete(license.licenseKey)}\n                           className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition"\n                         >\n                           Xóa\n                         </button>\n`,
    'admin reset devices button',
  );

  write(relPath, content);
}

function patchPolicyDoc() {
  const relPath = 'docs/license-policy.md';
  let content = read(relPath);

  content = replaceOnce(
    content,
    `- Nếu khách đổi máy, admin cần có chức năng reset hoặc chuyển device ID.\n- Không cho 1 key kích hoạt nhiều desktop device cùng lúc.\n`,
    `- Nếu khách đổi máy, admin cần có chức năng reset hoặc chuyển device ID.\n- Không cho 1 key kích hoạt nhiều desktop device cùng lúc.\n- Desktop binding phải dùng machine/device ID ổn định, không dùng random ID trong localStorage.\n`,
    'desktop policy detail',
  );

  content = replaceOnce(
    content,
    `- Khách có thể đăng nhập trên nhiều thiết bị.\n- Nhưng tại một thời điểm chỉ cho 1 web session hoạt động.\n`,
    `- Khách có thể đăng nhập trên nhiều thiết bị.\n- Nhưng tại một thời điểm chỉ cho 1 web session hoạt động.\n- Web session không được gắn chết vĩnh viễn vào một browser localStorage. Nếu khách mất browser cũ, admin phải reset được slot thiết bị.\n`,
    'web policy reset detail',
  );

  if (!content.includes('## Triển khai đợt 1')) {
    content = content.replace(
      `## Lưu ý bảo mật\n`,
      `## Triển khai đợt 1\n\n- Default license mới: deviceLimit = 1 cho cả auto-paid và admin tạo tay.\n- Backend vẫn chặn theo active device slots, nhưng admin có endpoint reset thiết bị bị kẹt.\n- Admin UI cần hiển thị activeDeviceCount và nút reset thiết bị cho từng license.\n- Desktop fingerprint ổn định sẽ xử lý ở đợt sau.\n\n## Lưu ý bảo mật\n`,
    );
  }

  write(relPath, content);
}

patchServer();
patchAdminLicensesPage();
patchPolicyDoc();

console.log('Đã áp dụng license policy phase 1. Hãy review git diff trước khi commit.');
