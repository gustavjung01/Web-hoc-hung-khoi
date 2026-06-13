import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth, useClerk } from '@clerk/clerk-react';
import { ArrowLeft, Eye, Search, ChevronLeft, RefreshCw } from 'lucide-react';

interface Customer {
  email: string;
  licenseCount: number;
  activeLicenseCount: number;
  expiredLicenseCount: number;
  revokedLicenseCount: number;
  orderCount: number;
  totalCount: number;
  products: string[];
  latestCreatedAt: string | null;
  latestExpiresAt: string | null;
}

interface License {
  licenseKey: string;
  productId: string;
  productName: string;
  appId?: string;
  customerEmail: string;
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
  expiresAt: string | null;
  deviceLimit: number;
  allowedGrades: number[];
  selectedGrades?: number[];
  adminNotes?: string;
  plan?: string;
}

interface Order {
  orderId: string;
  productId: string;
  productName: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'expired' | 'cancelled';
  selectedGrades: number[];
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
}

interface CustomerDetail {
  email: string;
  licenses: License[];
  orders: Order[];
  products: string[];
  licenseCount: number;
  activeLicenseCount: number;
  orderCount: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const API_BASE = '';

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '-';
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    expired: 'bg-red-100 text-red-800',
    revoked: 'bg-gray-100 text-gray-800',
    paid: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };
  const labels: Record<string, string> = {
    active: 'Hoạt động',
    expired: 'Hết hạn',
    revoked: 'Thu hồi',
    paid: 'Đã thanh toán',
    pending: 'Chờ thanh toán',
    cancelled: 'Đã hủy',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>
      {labels[status] || status}
    </span>
  );
}

function AdminNav({ active }: { active: 'customers' | 'licenses' | 'ai-credits' | 'ai-settings' }) {
  const base = 'min-h-10 rounded-lg px-3 py-2 text-sm transition';
  const activeClass = 'bg-blue-600 text-white font-medium';
  const idleClass = 'bg-gray-100 text-gray-700 hover:bg-gray-200';
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <button onClick={() => window.location.hash = '#/admin/customers'} className={`${base} ${active === 'customers' ? activeClass : idleClass}`}>
        Khách hàng
      </button>
      <button onClick={() => window.location.hash = '#/admin/licenses'} className={`${base} ${active === 'licenses' ? activeClass : idleClass}`}>
        License Keys
      </button>
      <button onClick={() => window.location.hash = '#/admin/ai-credits'} className={`${base} ${active === 'ai-credits' ? activeClass : idleClass}`}>
        Gói Dopi AI
      </button>
      <button onClick={() => window.location.hash = '#/admin/ai-settings'} className={`${base} ${active === 'ai-settings' ? activeClass : idleClass}`}>
        AI bán ra
      </button>
    </div>
  );
}

export default function AdminCustomersPage({ onBack }: { onBack: () => void }) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { openSignIn } = useClerk();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const fetchCustomers = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search && { search }),
      });

      const res = await fetch(`${API_BASE}/api/admin/customers?${params}`, { headers });
      const data = await res.json();
      if (data.ok) {
        setCustomers(data.customers || []);
        setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
      } else {
        setError(data.error || 'Không tải được danh sách khách hàng');
      }
    } catch {
      setError('Lỗi kết nối mạng');
    } finally {
      setLoading(false);
    }
  }, [getToken, search]);

  const fetchCustomerDetail = async (email: string) => {
    setDetailLoading(true);
    setDetailError('');
    setSelectedCustomer(null);
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/admin/customers/${encodeURIComponent(email)}`, { headers });
      const data = await res.json();
      if (data.ok) {
        setSelectedCustomer(data.customer);
      } else {
        setDetailError(data.error || 'Không tải được chi tiết khách hàng');
      }
    } catch {
      setDetailError('Lỗi kết nối mạng');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers(1);
  }, [fetchCustomers]);

  if (!isLoaded) {
    return (
      <div className="w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4 mx-auto" />
            <p className="text-gray-500">Đang kiểm tra đăng nhập...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-sm mx-auto mt-20 px-3">
        <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1 text-center">Đăng nhập Admin</h2>
          <p className="text-sm text-gray-500 mb-4 text-center">Vui lòng đăng nhập để truy cập trang quản trị</p>
          <button onClick={() => openSignIn()} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
            Đăng nhập với Clerk
          </button>
          <button onClick={onBack} className="w-full mt-3 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm">
            <ArrowLeft className="inline h-4 w-4 mr-2" />
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  if (selectedCustomer) {
    return (
      <div className="w-full max-w-5xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => setSelectedCustomer(null)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ChevronLeft className="h-4 w-4" />
            Quay lại danh sách
          </button>
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-200 p-4 mb-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-all text-xl font-bold text-gray-900">{selectedCustomer.email}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {selectedCustomer.activeLicenseCount} license hoạt động / {selectedCustomer.licenseCount} tổng license
                {' · '}
                {selectedCustomer.orderCount} đơn hàng
              </p>
            </div>
            <button onClick={() => fetchCustomerDetail(selectedCustomer.email)} className="w-fit p-2 text-gray-400 hover:text-gray-600" title="Làm mới">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {selectedCustomer.products.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedCustomer.products.map((product) => (
                <span key={product} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">{product}</span>
              ))}
            </div>
          )}
        </div>

        {detailError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{detailError}</div>
        )}

        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden mb-4">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-700">Licenses ({selectedCustomer.licenses.length})</h3>
          </div>
          {detailLoading ? (
            <div className="p-8 text-center text-gray-500">Đang tải...</div>
          ) : selectedCustomer.licenses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Chưa có license nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">License Key</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sản phẩm</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hết hạn</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lớp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thiết bị</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedCustomer.licenses.map((license) => (
                    <tr key={license.licenseKey} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <code className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{license.licenseKey}</code>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{license.productName}</td>
                      <td className="px-4 py-3"><StatusBadge status={license.status} /></td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(license.expiresAt)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {license.selectedGrades?.length
                          ? `[${license.selectedGrades.join(', ')}]`
                          : license.allowedGrades?.map((grade) => `L${grade}`).join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{license.deviceLimit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-700">Đơn hàng ({selectedCustomer.orders.length})</h3>
          </div>
          {selectedCustomer.orders.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Chưa có đơn hàng nào</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sản phẩm</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tổng tiền</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày tạo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày thanh toán</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedCustomer.orders.map((order) => (
                    <tr key={order.orderId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-500">{order.orderId}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{order.productName}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {order.amount?.toLocaleString('vi-VN')}đ
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(order.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(order.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="h-4 w-4" />
            Về trang chủ
          </button>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Quản lý Khách hàng</h1>
          <p className="text-gray-500 text-sm">Xem danh sách khách hàng, license và đơn hàng</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left sm:text-right">
          <p className="text-xs text-gray-500">Đăng nhập với</p>
          <p className="max-w-full break-all text-sm font-medium text-gray-900">{user.primaryEmailAddress?.emailAddress}</p>
        </div>
      </div>

      <AdminNav active="customers" />

      <div className="mb-4 p-4 bg-white rounded-lg shadow border border-gray-200">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:min-w-[250px] sm:flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm theo email..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
          <button onClick={() => fetchCustomers(pagination.page)} className="inline-flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm">
            <RefreshCw className="mr-1 h-4 w-4" />
            Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 ml-2">×</button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Số license</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hoạt động</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sản phẩm</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Đơn hàng</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hết hạn gần nhất</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    {search ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng nào'}
                  </td>
                </tr>
              ) : customers.map((customer) => (
                <tr key={customer.email} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="break-all font-medium text-gray-900">{customer.email}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{customer.licenseCount}</td>
                  <td className="px-4 py-3">
                    <span className="text-green-600 font-medium">{customer.activeLicenseCount}</span>
                    {customer.expiredLicenseCount > 0 && (
                      <span className="text-red-500 ml-1">/ {customer.expiredLicenseCount} hết hạn</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {customer.products.slice(0, 2).map((product) => (
                        <span key={product} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{product}</span>
                      ))}
                      {customer.products.length > 2 && (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">+{customer.products.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{customer.orderCount}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(customer.latestExpiresAt)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => fetchCustomerDetail(customer.email)} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition text-xs">
                      <Eye className="h-3 w-3" />
                      Xem
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Hiển thị {customers.length} / {pagination.total} khách hàng</span>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fetchCustomers(pagination.page - 1)} disabled={pagination.page <= 1} className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
              ← Trước
            </button>
            <span className="px-3 py-1">Trang {pagination.page} / {pagination.totalPages}</span>
            <button onClick={() => fetchCustomers(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
              Sau →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
