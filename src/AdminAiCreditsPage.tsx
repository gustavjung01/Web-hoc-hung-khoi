import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth, useClerk } from '@clerk/clerk-react';
import { ArrowLeft } from 'lucide-react';

interface AICreditProduct {
  id: string;
  name: string;
  description?: string;
  originalPrice: number;
  price: number;
  credits: number;
  isActive: boolean;
  badge?: string | null;
}

interface AIPricingTaskConfig {
  enabled: boolean;
  inputPer1k: number;
  outputPer1k: number;
  multiplier: number;
}

interface AIPricingConfig {
  enabled: boolean;
  dopiValueVnd?: number;
  tasks: Record<string, AIPricingTaskConfig>;
}

interface DopiRechargeKey {
  id: string;
  key: string;
  keyMasked: string | null;
  amountDopi: number;
  orderId: string | null;
  productName: string;
  customerEmail: string;
  redeemedByEmail: string | null;
  status: 'active' | 'unused' | 'redeemed' | 'void';
  createdAt: string;
  redeemedAt: string | null;
}

const API_BASE = '';

const DEFAULT_CREATE_FORM: Partial<AICreditProduct> = {
  id: '',
  name: '',
  description: '',
  originalPrice: 0,
  price: 0,
  credits: 100,
  isActive: true,
  badge: '',
};

const DEFAULT_KEY_FORM = {
  customerEmail: '',
  productName: 'Gói Dopi thủ công',
  amountDopi: 100,
  note: '',
};

const TASK_LABELS: Record<string, string> = {
  chat: 'Chat thường',
  explain_lesson: 'Giải thích bài',
  generate_practice: 'Tạo luyện tập',
  deep_search: 'Search chuyên sâu',
};

const formatVnd = (value: number) => `${Math.round(Number(value) || 0).toLocaleString('vi-VN')}đ`;
const formatCapacity = (value: number) => Number(value || 0).toLocaleString('vi-VN');
const deriveCredits = (originalPrice: number, dopiValueVnd: number) => {
  const price = Number(originalPrice) || 0;
  const unit = Number(dopiValueVnd) || 100;
  if (price <= 0) return 0;
  return Math.max(1, Math.round(price / unit));
};
const getUnitPrice = (product: Pick<AICreditProduct, 'price' | 'credits'>) => {
  const credits = Number(product.credits) || 0;
  if (credits <= 0) return 0;
  return (Number(product.price) || 0) / credits;
};

function AdminAiCreditsPage({ onBack }: { onBack: () => void }) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { openSignIn } = useClerk();

  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [products, setProducts] = useState<AICreditProduct[]>([]);
  const [pricingConfig, setPricingConfig] = useState<AIPricingConfig | null>(null);
  const [dopiKeys, setDopiKeys] = useState<DopiRechargeKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [editingProduct, setEditingProduct] = useState<AICreditProduct | null>(null);
  const [editForm, setEditForm] = useState<Partial<AICreditProduct>>({});
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [createForm, setCreateForm] = useState<Partial<AICreditProduct>>(DEFAULT_CREATE_FORM);
  const [keyForm, setKeyForm] = useState(DEFAULT_KEY_FORM);

  useEffect(() => {
    if (!isLoaded) return;

    if (!user) {
      setAuthChecked(true);
      setIsAdmin(false);
      return;
    }

    // Admin status is determined by API response, not frontend logic.
    setAuthChecked(true);
    setIsAdmin(true);
  }, [isLoaded, user]);

  const getAdminHeaders = useCallback(async () => {
    const token = await getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }, [getToken]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await getAdminHeaders();
      const [productsRes, settingsRes, keysRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/ai-credit-products`, { headers }),
        fetch(`${API_BASE}/api/admin/ai-settings`, { headers }),
        fetch(`${API_BASE}/api/admin/dopi-recharge-keys`, { headers }),
      ]);

      if (productsRes.status === 401 || productsRes.status === 403) {
        setError('Không có quyền admin');
        setIsAdmin(false);
        setProducts([]);
        return;
      }

      const productsData = await productsRes.json();
      if (productsData.ok) {
        setProducts(productsData.products || []);
        setIsAdmin(true);
      } else {
        setError(productsData.error || 'Không tải được gói Dopi AI');
        setIsAdmin(false);
        return;
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.ok && settingsData.pricing) {
          setPricingConfig(settingsData.pricing);
        }
      }
      if (keysRes.ok) {
        const keysData = await keysRes.json();
        if (keysData.ok) {
          setDopiKeys(keysData.keys || []);
        }
      }
    } catch {
      setError('Network error');
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, [getAdminHeaders]);

  useEffect(() => {
    if (isAdmin) {
      fetchProducts();
    }
  }, [isAdmin, fetchProducts]);

  const normalizePayload = (form: Partial<AICreditProduct>, includeId = false) => ({
    ...(includeId ? { id: form.id?.trim() || undefined } : {}),
    name: form.name?.trim(),
    description: form.description?.trim() || '',
    originalPrice: form.originalPrice !== undefined ? Number(form.originalPrice) : undefined,
    price: form.price !== undefined ? Number(form.price) : undefined,
    credits: form.credits !== undefined ? Number(form.credits) : undefined,
    isActive: form.isActive,
    badge: form.badge?.trim() || null,
  });

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`${API_BASE}/api/admin/ai-credit-products`, {
        method: 'POST',
        headers,
        body: JSON.stringify(normalizePayload(createForm, true)),
      });
      const data = await res.json();
      if (data.ok) {
        setCreatingProduct(false);
        setCreateForm(DEFAULT_CREATE_FORM);
        fetchProducts();
      } else {
        setError(data.error || 'Không tạo được gói AI');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`${API_BASE}/api/admin/ai-credit-products/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(normalizePayload(editForm)),
      });
      const data = await res.json();
      if (data.ok) {
        setEditingProduct(null);
        fetchProducts();
      } else {
        setError(data.error || 'Không lưu được gói AI');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (product: AICreditProduct) => {
    const confirmed = window.confirm(`Xóa gói "${product.name}"? Hành động này chỉ xóa gói bán mới, không ảnh hưởng Dopi đã có trong ví user.`);
    if (!confirmed) return;

    setLoading(true);
    setError('');
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`${API_BASE}/api/admin/ai-credit-products/${product.id}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (data.ok) {
        fetchProducts();
      } else {
        setError(data.error || 'Không xóa được gói AI');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDopiKey = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`${API_BASE}/api/admin/dopi-recharge-keys`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerEmail: keyForm.customerEmail,
          productName: keyForm.productName,
          amountDopi: Number(keyForm.amountDopi),
          note: keyForm.note,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setKeyForm(DEFAULT_KEY_FORM);
        fetchProducts();
      } else {
        setError(data.error || 'Không tạo được key Dopi');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleVoidDopiKey = async (key: DopiRechargeKey) => {
    const confirmed = window.confirm(`Hủy key ${key.keyMasked || key.key}? Key đã hủy sẽ không dùng được nữa.`);
    if (!confirmed) return;

    setLoading(true);
    setError('');
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`${API_BASE}/api/admin/dopi-recharge-keys/${key.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'void' }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchProducts();
      } else {
        setError(data.error || 'Không hủy được key Dopi');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (product: AICreditProduct) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      description: product.description || '',
      originalPrice: product.originalPrice,
      price: product.price,
      credits: product.credits,
      isActive: product.isActive,
      badge: product.badge || '',
    });
  };

  const pricingTasks = pricingConfig?.tasks
    ? Object.entries(pricingConfig.tasks).filter(([, task]) => task.enabled !== false)
    : [];

  if (!isLoaded || !authChecked) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full mb-4" />
            <p className="text-gray-500">Đang kiểm tra đăng nhập...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1 text-center">Đăng nhập Admin</h2>
          <p className="text-sm text-gray-500 mb-4 text-center">Vui lòng đăng nhập để truy cập trang quản trị</p>
          <button
            onClick={() => openSignIn()}
            className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
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
              {error || `Tài khoản ${user.primaryEmailAddress?.emailAddress || ''} không có quyền truy cập.`}
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

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Về trang chủ
          </button>
          <h1 className="text-xl font-bold text-gray-900 mb-1 sm:text-2xl">Quản lý Gói Dopi AI</h1>
          <p className="text-gray-500 text-sm">Tạo gói bán cho nhánh AI app, set giá và số Dopi vào ví AI của user.</p>
          <p className="mt-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-100 inline-block">
            Dopi là đơn vị hiển thị cho user. Server vẫn đếm token thật, quy đổi và trừ số Dopi nguyên.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left sm:text-right">
          <p className="text-xs text-gray-500">Đăng nhập với</p>
          <p className="max-w-full break-all text-sm font-medium text-gray-900">{user.primaryEmailAddress?.emailAddress}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <button
          onClick={() => window.location.hash = '#/admin/customers'}
          className="min-h-10 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-200"
        >
          Khách hàng
        </button>
        <button
          onClick={() => window.location.hash = '#/admin/licenses'}
          className="min-h-10 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-200"
        >
          License Keys
        </button>
        <button
          onClick={() => window.location.hash = '#/admin/ai-credits'}
          className="min-h-10 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white"
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

      <div className="mb-5 grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-4">
        <div className="bg-white rounded-xl shadow border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">Logic quy đổi token sang Dopi</h2>
              <p className="text-sm text-gray-500 mt-1">
                Gói bán cộng Dopi vào ví. Luồng AI đếm token input/output thật, quy đổi và làm tròn lên tối thiểu 1 Dopi mỗi request.
              </p>
              <p className="mt-2 text-xs font-semibold text-blue-700">
                Mốc tham chiếu hiện tại: 1 Dopi = {formatVnd(pricingConfig?.dopiValueVnd || 100)}
              </p>
            </div>
            <button
              onClick={() => window.location.hash = '#/admin/ai-settings'}
              className="px-3 py-2 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition shrink-0"
            >
              Sửa cấu hình AI bán ra
            </button>
          </div>
          {pricingTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
              {pricingTasks.map(([key, task]) => (
                <div key={key} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900">{TASK_LABELS[key] || key}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    In {task.inputPer1k} Dopi/1K · Out {task.outputPer1k} Dopi/1K · x{task.multiplier}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-500">
              Chưa đọc được bảng giá token. Gói vẫn sửa được, nhưng nên kiểm tra lại cấu hình AI bán ra.
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-200 p-4 flex flex-col justify-between gap-4">
          <div>
              <h2 className="text-base font-bold text-gray-900">Gói Dopi đang bán</h2>
            <p className="text-sm text-gray-500 mt-1">
              Thêm gói mới khi cần bán thêm Dopi, hoặc tắt/xóa gói không dùng nữa.
            </p>
          </div>
          <button
            onClick={() => {
              setCreateForm(DEFAULT_CREATE_FORM);
              setCreatingProduct(true);
            }}
            className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
          >
            + Thêm gói Dopi
          </button>
        </div>
      </div>

      {creatingProduct && (
        <ProductModal
          title="Thêm Gói AI"
          form={createForm}
          setForm={setCreateForm}
          loading={loading}
          dopiValueVnd={pricingConfig?.dopiValueVnd || 100}
          showIdField
          onClose={() => setCreatingProduct(false)}
          onSubmit={handleCreate}
        />
      )}

      {editingProduct && (
        <ProductModal
          title="Sửa Gói AI"
          form={editForm}
          setForm={setEditForm}
          loading={loading}
          dopiValueVnd={pricingConfig?.dopiValueVnd || 100}
          onClose={() => setEditingProduct(null)}
          onSubmit={() => handleUpdate(editingProduct.id)}
        />
      )}

      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID Gói</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tên gói</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Giá gốc</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Giá bán</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dopi trong ví</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Giá bán / 1 Dopi</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Badge</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 text-sm">
                    {loading ? 'Đang tải...' : 'Chưa có gói AI nào'}
                  </td>
                </tr>
              ) : products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{product.id}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{product.name}</p>
                    {product.description && (
                      <p className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{product.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-semibold">{formatVnd(product.originalPrice || 0)}</td>
                  <td className="px-4 py-3 text-gray-700 font-semibold">{formatVnd(product.price)}</td>
                  <td className="px-4 py-3 text-purple-600 font-bold">{formatCapacity(product.credits)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatVnd(getUnitPrice(product))}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${product.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {product.isActive ? 'Đang bật' : 'Đã tắt'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{product.badge || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(product)}
                        className="px-2 py-1 text-xs bg-purple-50 text-purple-600 rounded hover:bg-purple-100 transition"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
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
      </div>

      <div className="mt-5 bg-white rounded-xl shadow border border-gray-200 p-4">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Dopi key</h2>
            <p className="text-sm text-gray-500 mt-1">
              SePay tạo key tự động cho gói Dopi. Admin có thể tạo key thủ công khi hỗ trợ qua Zalo.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {dopiKeys.length} key gần nhất
          </span>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_120px_1fr_auto]">
          <input
            type="email"
            value={keyForm.customerEmail}
            onChange={(event) => setKeyForm({ ...keyForm, customerEmail: event.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Email khách (nếu có)"
          />
          <input
            type="text"
            value={keyForm.productName}
            onChange={(event) => setKeyForm({ ...keyForm, productName: event.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Tên gói"
          />
          <input
            type="number"
            min={1}
            value={keyForm.amountDopi}
            onChange={(event) => setKeyForm({ ...keyForm, amountDopi: Number(event.target.value) || 1 })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Dopi"
          />
          <input
            type="text"
            value={keyForm.note}
            onChange={(event) => setKeyForm({ ...keyForm, note: event.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Ghi chú"
          />
          <button
            type="button"
            onClick={handleCreateDopiKey}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            Tạo key
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Key</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Dopi</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Nguồn</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Trạng thái</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Chủ ví</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {dopiKeys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">Chưa có key Dopi</td>
                </tr>
              ) : dopiKeys.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <code className="font-mono text-xs text-gray-700">{item.key}</code>
                    <p className="text-[11px] text-gray-400">{item.orderId || 'manual'}</p>
                  </td>
                  <td className="px-3 py-2 font-bold text-purple-700">{item.amountDopi.toLocaleString('vi-VN')}</td>
                  <td className="px-3 py-2 text-gray-600">
                    <p>{item.productName || '-'}</p>
                    <p className="text-[11px] text-gray-400">{item.customerEmail || '-'}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'void' ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'}`}>
                      {item.status === 'void' ? 'Đã hủy' : 'Đang hoạt động'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{item.redeemedByEmail || '-'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(item.key)}
                        className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
                      >
                        Copy
                      </button>
                      {item.status !== 'void' && (
                        <button
                          type="button"
                          onClick={() => handleVoidDopiKey(item)}
                          className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                        >
                          Hủy
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductModal({
  title,
  form,
  setForm,
  loading,
  dopiValueVnd,
  showIdField = false,
  onClose,
  onSubmit,
}: {
  title: string;
  form: Partial<AICreditProduct>;
  setForm: (form: Partial<AICreditProduct>) => void;
  loading: boolean;
  dopiValueVnd: number;
  showIdField?: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const originalPrice = Number(form.originalPrice) || 0;
  const salePrice = Number(form.price) || 0;
  const dopiValue = Number(dopiValueVnd) || 100;
  const derivedCredits = deriveCredits(originalPrice || salePrice, dopiValue);
  const unitPrice = getUnitPrice({
    price: salePrice,
    credits: derivedCredits,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="space-y-4">
          {showIdField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID gói tùy chọn</label>
              <input
                type="text"
                value={form.id || ''}
                onChange={(event) => setForm({ ...form, id: event.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
                placeholder="Ví dụ: ai_monthly_100"
              />
              <p className="text-xs text-gray-500 mt-1">Để trống thì server tự tạo ID từ tên gói.</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên gói</label>
            <input
              type="text"
              value={form.name || ''}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
              placeholder="Ví dụ: Gói AI 100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả ngắn</label>
            <input
              type="text"
              value={form.description || ''}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
              placeholder="Ví dụ: Phù hợp dùng thử AI giải thích bài"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giá gốc (VND)</label>
              <input
                type="number"
                min={0}
                value={form.originalPrice !== undefined ? form.originalPrice : ''}
                onChange={(event) => setForm({ ...form, originalPrice: Number(event.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Giá bán (VND)</label>
              <input
                type="number"
                min={0}
                value={form.price !== undefined ? form.price : ''}
                onChange={(event) => setForm({ ...form, price: Number(event.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số Dopi vào ví</label>
              <input
                type="number"
                readOnly
                value={derivedCredits}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 text-sm font-semibold"
              />
              <p className="mt-1 text-xs text-gray-500">
                Tự tính từ giá gốc với mốc {formatVnd(dopiValue)} / 1 Dopi.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Giá bán trung bình: <strong>{formatVnd(unitPrice)}</strong> / 1 Dopi.
            Mốc quy đổi tham chiếu trong cấu hình AI bán ra: <strong>{formatVnd(dopiValue)}</strong> / 1 Dopi.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Badge (Nhãn)</label>
            <input
              type="text"
              value={form.badge || ''}
              onChange={(event) => setForm({ ...form, badge: event.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
              placeholder="Ví dụ: Tiết kiệm, Gói nhỏ..."
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`${title.replace(/\s+/g, '-')}-isActiveToggle`}
              checked={form.isActive !== false}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
            <label htmlFor={`${title.replace(/\s+/g, '-')}-isActiveToggle`} className="text-sm font-medium text-gray-700">
              Kích hoạt, hiển thị cho user mua
            </label>
          </div>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
            >
              Hủy
            </button>
            <button
              onClick={onSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 text-sm font-medium"
            >
              {loading ? 'Đang lưu...' : 'Lưu gói'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminAiCreditsPage;
