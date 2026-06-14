import React, { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth, useClerk } from '@clerk/clerk-react';
import { ArrowLeft } from 'lucide-react';

interface License {
  licenseKey: string;
  productId: string;
  productName: string;
  appId?: string;
  customerEmail: string;
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
  expiresAt: string;
  deviceLimit: number;
  activeDeviceCount?: number;
  allowedGrades: number[];
  selectedGrades?: number[];
  adminNotes?: string;
  devices?: {
    activationId?: string;
    deviceId: string;
    deviceName?: string;
    appId?: string | null;
    ipAddress?: string | null;
    activatedAt?: string | null;
    lastSeenAt?: string | null;
    isActive?: boolean;
  }[];
}

interface Product {
  productId: string;
  name: string;
  price: number;
  durationMonths: number;
  gradeIds: number[];
  requiresGradeSelection?: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const API_BASE = '';
// Admin emails allowed to access the admin panel
const ADMIN_EMAILS = (import.meta as any).env?.VITE_ADMIN_EMAILS || '';

function AdminLicensesPage({ onBack }: { onBack: () => void }) {
  // Clerk auth
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { openSignIn } = useClerk();

  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [licenses, setLicenses] = useState<License[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [licenseProducts, setLicenseProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productError, setProductError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLicense, setNewLicense] = useState({
    customerEmail: '',
    productId: '',
    durationMonths: 12,
    deviceLimit: 1,
    notes: ''
  });
  const [createdLicense, setCreatedLicense] = useState<License | null>(null);

  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [editForm, setEditForm] = useState({ status: '', extendMonths: 0, deviceLimit: 1, notes: '' });

  // Check if current user is admin
  useEffect(() => {
    if (!isLoaded) return;

    if (!user) {
      setAuthChecked(true);
      setIsAdmin(false);
      return;
    }

    const userEmail = user.primaryEmailAddress?.emailAddress?.toLowerCase() || '';
    const adminEmailList = ADMIN_EMAILS.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);

    const isAdminUser = adminEmailList.length === 0 || adminEmailList.includes(userEmail);
    setIsAdmin(isAdminUser);
    setAuthChecked(true);
  }, [isLoaded, user]);

  const fetchLicenses = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(productFilter && { productId: productFilter })
      });

      // Get Clerk token for auth
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/api/admin/licenses?${params}`, { headers });
      const data = await res.json();
      if (data.ok) {
        setLicenses(data.licenses || []);
        setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
      } else {
        setError(data.error || 'Failed to load licenses');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter, productFilter, isAdmin, getToken]);

  const fetchProducts = async () => {
    if (!isAdmin) return;
    setProductError('');
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const [regularRes, allRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/products`, { headers }),
        fetch(`${API_BASE}/api/admin/products?includeAiCredit=1`, { headers }),
      ]);

      const regularData = await regularRes.json().catch(() => null);
      const allData = await allRes.json().catch(() => null);

      const regularProducts = regularData?.ok ? (regularData.products || []) : [];
      const allProducts = allData?.ok ? (allData.products || []) : [];

      if (regularProducts.length > 0) {
        setProducts(regularProducts);
      } else if (allProducts.length > 0) {
        setProducts(allProducts);
      } else {
        setProducts([]);
      }

      if (allProducts.length > 0) {
        setLicenseProducts(allProducts);
      } else if (regularProducts.length > 0) {
        setLicenseProducts(regularProducts);
      } else {
        setLicenseProducts([]);
      }

      if (!regularData?.ok && !allData?.ok) {
        const errMsg = regularData?.error || allData?.error || 'Không thể tải danh sách sản phẩm';
        setProductError(errMsg);
      }
    } catch (err) {
      setProducts([]);
      setLicenseProducts([]);
      setProductError('Lỗi kết nối server - không thể tải sản phẩm');
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchLicenses();
      fetchProducts();
    }
  }, [isAdmin, fetchLicenses]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/api/admin/licenses`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newLicense)
      });
      const data = await res.json();
      if (data.ok) {
        setCreatedLicense(data.license);
        setNewLicense({ customerEmail: '', productId: '', durationMonths: 12, deviceLimit: 1, notes: '' });
        fetchLicenses();
      } else {
        setError(data.error || 'Failed to create license');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (licenseKey: string) => {
    setLoading(true);
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/api/admin/licenses/${licenseKey}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (data.ok) {
        setEditingLicense(null);
        fetchLicenses();
      } else {
        setError(data.error || 'Failed to update license');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetDevices = async (licenseKey: string) => {
    const deviceId = window.prompt('Nhập deviceId để reset 1 thiết bị. Để trống rồi bấm OK để reset toàn bộ thiết bị đang active.');
    if (deviceId === null) return;

    const normalizedDeviceId = deviceId.trim();
    if (!normalizedDeviceId) {
      const confirmed = confirm('Reset toàn bộ thiết bị đang active của license này?');
      if (!confirmed) return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/api/admin/licenses/${licenseKey}/devices/reset`, {
        method: 'POST',
        headers,
        body: JSON.stringify(normalizedDeviceId ? { deviceId: normalizedDeviceId } : {})
      });
      const data = await res.json();
      if (data.ok) {
        setCreatedLicense(data.license || null);
        fetchLicenses();
      } else {
        setError(data.error || 'Failed to reset devices');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (licenseKey: string) => {
    if (!confirm('Bạn chắc chắn muốn xóa license này?')) return;
    setLoading(true);
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/api/admin/licenses/${licenseKey}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (data.ok) {
        fetchLicenses();
      } else {
        setError(data.error || 'Failed to delete license');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('vi-VN');
  };

  const getLicenseDeviceSnapshot = (license: License) => {
    const devices = Array.isArray(license.devices) ? license.devices : [];
    const activeDeviceCount = Number.isFinite(Number(license.activeDeviceCount))
      ? Number(license.activeDeviceCount)
      : devices.length;
    const deviceLimit = Number.isFinite(Number(license.deviceLimit)) && Number(license.deviceLimit) > 0
      ? Number(license.deviceLimit)
      : 1;

    return { activeDeviceCount, deviceLimit, devices };
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      expired: 'bg-red-100 text-red-800',
      revoked: 'bg-gray-100 text-gray-800'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>
        {status === 'active' ? 'Hoạt động' : status === 'expired' ? 'Hết hạn' : 'Thu hồi'}
      </span>
    );
  };

  // Loading state while checking auth
  if (!isLoaded || !authChecked) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
            <p className="text-gray-500">Đang kiểm tra đăng nhập...</p>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in - show login button
  if (!user) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1 text-center">Đăng nhập Admin</h2>
          <p className="text-sm text-gray-500 mb-4 text-center">Vui lòng đăng nhập để truy cập trang quản trị</p>
          <button
            onClick={() => openSignIn()}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Đăng nhập với Clerk
          </button>
          <button
            onClick={onBack}
            className="w-full mt-3 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
          >
            <ArrowLeft className="inline h-4 w-4 mr-2" />
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  // Logged in but not admin
  if (!isAdmin) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
          <div className="text-center mb-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 text-2xl mb-4">
              ✕
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Không có quyền truy cập</h2>
            <p className="text-sm text-gray-500">
              Tài khoản <strong>{user.primaryEmailAddress?.emailAddress}</strong> không có quyền truy cập trang quản trị.
            </p>
          </div>
          <button
            onClick={onBack}
            className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
          >
            <ArrowLeft className="inline h-4 w-4 mr-2" />
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  // Admin user - show main content
  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Về trang chủ
          </button>
          <h1 className="text-xl font-bold text-gray-900 mb-1 sm:text-2xl">Quản lý License Keys</h1>
          <p className="text-gray-500 text-sm">Trang quản trị nội bộ, chỉ dành cho người vận hành.</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left sm:text-right">
          <p className="text-xs text-gray-500">Đăng nhập với</p>
          <p className="max-w-full break-all text-sm font-medium text-gray-900">{user.primaryEmailAddress?.emailAddress}</p>
        </div>
      </div>

      {/* Main admin content */}
      <>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            onClick={() => window.location.hash = '#/admin/customers'}
            className="min-h-10 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-200"
          >
            Khách hàng
          </button>
          <button
            onClick={() => window.location.hash = '#/admin/licenses'}
            className="min-h-10 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
          >
            License Keys
          </button>
          <button
            onClick={() => window.location.hash = '#/admin/ai-credits'}
            className="min-h-10 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-200"
          >
            Gói Dopi AI
          </button>
          <button
            onClick={() => window.location.hash = '#/admin/ai-settings'}
            className="min-h-10 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-200"
          >
            AI bán ra
          </button>
        </div>
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 ml-2">✕</button>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 p-4 bg-white rounded-lg shadow border border-gray-200">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_180px_220px_auto_auto] lg:items-center">
            <div className="sm:col-span-2 lg:col-span-1">
              <input
                type="text"
                placeholder="Tìm kiếm (email, key, sản phẩm)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="active">Hoạt động</option>
              <option value="expired">Hết hạn</option>
              <option value="revoked">Thu hồi</option>
            </select>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">Tất cả sản phẩm</option>
              {products.map(p => (
                <option key={p.productId} value={p.productId}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={() => fetchLicenses()}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
            >
              Làm mới
            </button>
            <button
              onClick={() => { setShowCreateForm(true); setCreatedLicense(null); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              Tạo License
            </button>
          </div>
        </div>

        {/* Create Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3">
            <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-900">Tạo License Mới</h2>
                <button
                  onClick={() => { setShowCreateForm(false); setCreatedLicense(null); }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {createdLicense ? (
                <div className="text-center">
                  <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-left space-y-1 text-sm text-green-800">
                    <p className="font-medium text-green-700">✅ License đã tạo!</p>
                    <p><strong>Key:</strong> <code className="font-mono bg-white px-1 rounded">{createdLicense.licenseKey}</code></p>
                    <p><strong>appId:</strong> {createdLicense.appId || '-'}</p>
                    <p><strong>productId:</strong> {createdLicense.productId}</p>
                    <p><strong>productName:</strong> {createdLicense.productName}</p>
                    <p><strong>allowedGrades:</strong> [{createdLicense.allowedGrades?.join(', ')}]</p>
                    <p><strong>selectedGrades:</strong> [{createdLicense.selectedGrades?.join(', ')}]</p>
                    <p><strong>status:</strong> {createdLicense.status}</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      onClick={() => copyToClipboard(createdLicense.licenseKey)}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                    >
                      📋 Copy Key
                    </button>
                    <button
                      onClick={() => { setShowCreateForm(false); setCreatedLicense(null); }}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email khách hàng *</label>
                    <input
                      type="email"
                      required
                      value={newLicense.customerEmail}
                      onChange={(e) => setNewLicense({ ...newLicense, customerEmail: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="customer@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sản phẩm *</label>
                    {productError && (
                      <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                        ⚠️ {productError}
                      </div>
                    )}
                    <select
                      required
                      value={newLicense.productId}
                      onChange={(e) => setNewLicense({ ...newLicense, productId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100"
                    >
                      <option value="">Chọn sản phẩm</option>
                      {(licenseProducts.length > 0 ? licenseProducts : products).map(p => (
                        <option key={p.productId} value={p.productId}>
                          {p.name} — {p.price.toLocaleString()}đ
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Thời hạn (tháng)</label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={newLicense.durationMonths}
                        onChange={(e) => setNewLicense({ ...newLicense, durationMonths: parseInt(e.target.value) || 12 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giới hạn thiết bị</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={newLicense.deviceLimit}
                      onChange={(e) => setNewLicense({ ...newLicense, deviceLimit: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                    <textarea
                      value={newLicense.notes}
                      onChange={(e) => setNewLicense({ ...newLicense, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      rows={2}
                      placeholder="Ghi chú..."
                    />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !newLicense.customerEmail || !newLicense.productId}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm font-medium"
                    >
                      {loading ? 'Đang tạo...' : 'Tạo License'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingLicense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3">
            <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-900">Chỉnh sửa License</h2>
                <button onClick={() => setEditingLicense(null)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="break-all font-mono text-sm font-bold">{editingLicense.licenseKey}</p>
                <p className="break-all text-xs text-gray-500">{editingLicense.customerEmail}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Không thay đổi</option>
                    <option value="active">Hoạt động</option>
                    <option value="revoked">Thu hồi</option>
                    <option value="expired">Hết hạn</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gia hạn thêm (tháng)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={editForm.extendMonths}
                    onChange={(e) => setEditForm({ ...editForm, extendMonths: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Giới hạn thiết bị</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={editForm.deviceLimit}
                    onChange={(e) => setEditForm({ ...editForm, deviceLimit: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => setEditingLicense(null)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={() => handleUpdate(editingLicense.licenseKey)}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm font-medium"
                  >
                    {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Licenses Table */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">License Key</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sản phẩm</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lớp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hết hạn</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {licenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">
                      {loading ? 'Đang tải...' : 'Chưa có license nào'}
                    </td>
                  </tr>
                ) : licenses.map((license) => (
                  <tr key={license.licenseKey} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{license.licenseKey}</code>
                        <button
                          onClick={() => copyToClipboard(license.licenseKey)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                          title="Copy"
                        >
                          📋
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const { activeDeviceCount, deviceLimit, devices } = getLicenseDeviceSnapshot(license);

                        return (
                          <>
                            <div className="font-medium text-gray-900">{license.productName}</div>
                            <div className="text-xs text-gray-500">{activeDeviceCount}/{deviceLimit} thiết bị active</div>
                            {devices.length > 0 ? (
                              <div className="mt-1 max-w-[240px] space-y-0.5 text-[11px] text-gray-400">
                                {devices.slice(0, 2).map((device) => (
                                  <div key={device.activationId || device.deviceId} className="truncate" title={device.deviceId}>
                                    {device.deviceName || device.deviceId} · {formatDate(device.lastSeenAt)}
                                  </div>
                                ))}
                                {devices.length > 2 ? (
                                  <div>+{devices.length - 2} thiết bị khác</div>
                                ) : null}
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 break-all text-gray-600">{license.customerEmail}</td>
                    <td className="px-4 py-3">{getStatusBadge(license.status)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {license.selectedGrades
                        ? `Chọn: [${license.selectedGrades.join(', ')}]`
                        : license.allowedGrades?.map(g => `L${g}`).join(', ') || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(license.expiresAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setEditingLicense(license);
                            setEditForm({
                              status: license.status,
                              extendMonths: 0,
                              deviceLimit: license.deviceLimit || 1,
                              notes: license.adminNotes || ''
                            });
                          }}
                          className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => handleResetDevices(license.licenseKey)}
                          disabled={(license.activeDeviceCount ?? license.devices?.length ?? 0) <= 0}
                          className="px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100 transition disabled:opacity-50"
                        >
                          Reset thiết bị
                        </button>
                        <button
                          onClick={() => handleDelete(license.licenseKey)}
                          className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <span>Hiển thị {licenses.length} / {pagination.total} licenses</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                disabled={pagination.page <= 1}
                className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                ← Trước
              </button>
              <span className="px-3 py-1">
                Trang {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Sau →
              </button>
            </div>
          </div>
        </div>
      </>
    </div>
  );
}

export default AdminLicensesPage;
