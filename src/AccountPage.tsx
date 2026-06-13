import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth, useClerk } from '@clerk/clerk-react';
import {
  UserRound,
  ShoppingBag,
  Key,
  GraduationCap,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ArrowLeft,
  Plus,
  BookOpen,
  Brain,
  Copy,
  Check,
} from 'lucide-react';
import AiQuotaBar from './shared/components/AiQuotaBar';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://hochungkhoi.site/api';
const DOPI_KEY_STORAGE_KEY = 'hhk_dopi_key';

function getStoredDopiKey(): string | null {
  try {
    return localStorage.getItem(DOPI_KEY_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function saveDopiKey(key: string): void {
  try {
    const normalized = String(key || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) {
      localStorage.removeItem(DOPI_KEY_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DOPI_KEY_STORAGE_KEY, normalized);
  } catch {
    // ignore storage errors
  }
}

// ===== TYPES =====
interface MyOrder {
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
  licenseKeyMasked: string | null;
  dopiAmount?: number | null;
  dopiRechargeKey?: string | null;
  dopiRechargeKeyMasked?: string | null;
  dopiRechargeStatus?: string | null;
}

interface MyLicense {
  licenseKey: string | null;
  licenseKeyMasked: string | null;
  orderId: string | null;
  productId: string;
  productName: string;
  appId: string;
  appUrl: string;
  allowedGrades: number[] | Array<{id: number; name?: string; gradeName?: string; title?: string}>;
  selectedGrades: number[] | Array<{id: number; name?: string; gradeName?: string; title?: string}>;
  status: 'active' | 'expired' | 'revoked';
  startDate: string | null;
  expiresAt: string | null;
  deviceLimit: number;
  plan: string | null;
  durationMonths: number | null;
}

interface AiCapacityTransaction {
  id: string;
  orderId: string;
  productId: string | null;
  type: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
}

interface AiCapacityData {
  balance: number;
  walletBalance?: number | null;
  dopiKeyBalance?: number | null;
  dopiKeyAmount?: number | null;
  authType?: string | null;
  transactions: AiCapacityTransaction[];
  count: number;
}

interface DopiRechargeKey {
  id: string;
  key: string | null;
  keyMasked: string | null;
  amountDopi: number;
  remainingDopi?: number | null;
  spentDopi?: number | null;
  orderId: string | null;
  productName: string;
  status: 'active' | 'unused' | 'redeemed' | 'void';
  createdAt: string;
  redeemedAt: string | null;
  ownerEmail: string | null;
  customerEmail: string | null;
  redeemedByEmail: string | null;
  walletId: string | null;
  customerWalletId: string | null;
  redeemedByWalletId: string | null;
}



// ===== HELPERS =====

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function normalizeEmail(email: string | null | undefined): string {
  return String(email || '').toLowerCase().trim();
}

function formatWalletId(walletId: string | null | undefined): string {
  const value = String(walletId || '').trim();
  return value || '—';
}

function gradeLabel(grades: number[] | Array<{id: number; name?: string; gradeName?: string; title?: string}> | undefined): string {
  if (!grades || grades.length === 0) return 'Tất cả lớp';

  // Handle array of objects
  if (typeof grades[0] === 'object' && grades[0] !== null) {
    const objGrades = grades as Array<{id: number; name?: string; gradeName?: string; title?: string}>;
    const names = objGrades
      .map(g => g.name || g.gradeName || g.title || `Lớp ${g.id}`)
      .filter(Boolean);
    return names.join(', ');
  }

  // Handle array of numbers
  const numGrades = grades as number[];
  return 'Lớp ' + numGrades.slice().sort((a, b) => a - b).join(', ');
}

const STATUS_CONFIG = {
  paid: { label: 'Đã thanh toán', color: '#065F46', bg: '#D1FAE5', Icon: CheckCircle2 },
  active: { label: 'Đang hoạt động', color: '#065F46', bg: '#D1FAE5', Icon: CheckCircle2 },
  pending: { label: 'Chờ thanh toán', color: '#92400E', bg: '#FEF3C7', Icon: Clock },
  expired: { label: 'Đã hết hạn', color: '#991B1B', bg: '#FEE2E2', Icon: XCircle },
  cancelled: { label: 'Đã huỷ', color: '#6B7280', bg: '#F3F4F6', Icon: XCircle },
  revoked: { label: 'Đã thu hồi', color: '#991B1B', bg: '#FEE2E2', Icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? {
    label: status, color: '#374151', bg: '#F3F4F6', Icon: AlertCircle,
  };
  const { Icon } = cfg;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

function RechargeKeyQuotaBar({ item, currentEmail }: { item: DopiRechargeKey; currentEmail?: string | null }) {
  const isVoid = item.status === 'void';
  const totalAmount = Math.max(0, Math.floor(Number(item.amountDopi) || 0));
  const remainingAmountRaw = Number(item.remainingDopi);
  const spentAmountRaw = Number(item.spentDopi);
  const hasRemainingValue = Number.isFinite(remainingAmountRaw);
  const hasSpentValue = Number.isFinite(spentAmountRaw);
  const remainingAmount = isVoid
    ? 0
    : hasRemainingValue
      ? Math.max(0, Math.min(totalAmount, Math.floor(remainingAmountRaw)))
      : (item.redeemedAt ? 0 : totalAmount);
  const spentAmount = isVoid
    ? 0
    : hasSpentValue
      ? Math.max(0, Math.min(totalAmount, Math.floor(spentAmountRaw)))
      : Math.max(0, totalAmount - remainingAmount);
  const isRedeemed = Boolean(item.redeemedAt) && !isVoid;
  const label = isVoid
    ? 'Đã hủy'
    : isRedeemed
      ? (remainingAmount <= 0 ? 'Đã dùng hết' : 'Đang dùng')
      : 'Chưa kích hoạt';
  const amountLabel = isVoid
    ? '0 / 0 Dopi'
    : remainingAmount <= 0
      ? `Đã dùng hết ${totalAmount.toLocaleString('vi-VN')} Dopi`
      : `${remainingAmount.toLocaleString('vi-VN')} / ${totalAmount.toLocaleString('vi-VN')} Dopi còn lại`;
  const currentEmailNormalized = normalizeEmail(currentEmail);
  const redeemedEmail = normalizeEmail(item.redeemedByEmail);
  const ownerEmail = normalizeEmail(item.ownerEmail || item.customerEmail);
  const redeemedWalletId = String(item.redeemedByWalletId || '').trim();
  const customerWalletId = String(item.customerWalletId || item.walletId || '').trim();
  const recipientLabel = isVoid
    ? 'Mã này đã bị hủy.'
    : !isRedeemed
      ? 'Chưa kích hoạt.'
      : redeemedEmail
        ? currentEmailNormalized && redeemedEmail === currentEmailNormalized
          ? 'Đã kích hoạt key của bạn.'
          : ownerEmail && redeemedEmail === ownerEmail
            ? `Đã kích hoạt cho chủ key: ${redeemedEmail}.`
            : `Đã kích hoạt cho tài khoản khác: ${redeemedEmail}.`
        : redeemedWalletId
          ? `Đã kích hoạt: ${formatWalletId(redeemedWalletId)}.`
          : customerWalletId
            ? `Đã kích hoạt: ${formatWalletId(customerWalletId)}.`
            : 'Đã kích hoạt nhưng chưa xác định được nơi nhận.';

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-[#736754]">
        <span>{label}</span>
        <span>{amountLabel}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/80">
        <div
          className={`h-full rounded-full transition-all ${isVoid ? 'bg-slate-300' : remainingAmount <= 0 ? 'bg-rose-500' : 'bg-gradient-to-r from-emerald-500 to-cyan-500'}`}
          style={{ width: isVoid || totalAmount <= 0 ? '0%' : `${Math.max(0, Math.min(100, (remainingAmount / totalAmount) * 100))}%` }}
        />
      </div>
      <div className="mt-1 space-y-0.5 text-[10px] text-[#9b783e]">
        <p className="truncate">Chủ key: {item.ownerEmail || item.customerEmail || '—'}</p>
        <p className="truncate">{recipientLabel}</p>
        <p className="truncate">
          {isVoid
            ? '0 / 0 Dopi còn lại'
            : remainingAmount <= 0
              ? `Đã dùng hết ${totalAmount.toLocaleString('vi-VN')} Dopi`
              : `${spentAmount.toLocaleString('vi-VN')} / ${totalAmount.toLocaleString('vi-VN')} Dopi đã dùng`}
          {isRedeemed && item.redeemedAt ? ` · Đã nạp lúc ${formatDate(item.redeemedAt)}` : ''}
        </p>
      </div>
    </div>
  );
}

// ===== LOADING / ERROR / EMPTY =====

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c9b17f] border-t-transparent" />
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
      <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-400" />
      <p className="mb-3 text-sm text-red-700">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
      >
        <RefreshCw size={14} /> Thử lại
      </button>
    </div>
  );
}

// ===== LICENSE KEY LIST WITH COPY =====

function LicenseKeyList({ licenses }: { licenses: MyLicense[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (key: string, id: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Silent fail - không log lỗi
    }
  };

  const keyLicenses = licenses.filter(l => l.licenseKey || l.licenseKeyMasked);

  return (
    <div className="flex flex-col gap-3">
      {keyLicenses.map((l) => (
        <div key={l.licenseKey || l.licenseKeyMasked} className="flex items-center gap-3 py-2 border-t border-[#f0e8d8] first:border-t-0">
          <div className="flex-1 min-w-0">
            <code className="block w-full truncate font-mono text-sm text-[#302819] bg-[#fdfaf6] rounded-lg px-3 py-1.5 border border-[#eadcc4]">
              {l.licenseKeyMasked || l.licenseKey}
            </code>
            <p className="mt-1 text-xs text-[#736754] truncate">{l.productName}</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {l.licenseKey && (
              <button
                onClick={() => handleCopy(l.licenseKey!, l.licenseKey!)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  copiedId === l.licenseKey
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'border border-[#eadcc4] text-[#302819] hover:bg-[#fbf6ed]'
                }`}
              >
                {copiedId === l.licenseKey ? (
                  <><Check size={12} /> Đã sao chép</>
                ) : (
                  <><Copy size={12} /> Sao chép</>
                )}
              </button>
            )}
            <a
              href={l.appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[#eadcc4] px-2.5 py-1.5 text-xs font-semibold text-[#302819] hover:bg-[#fbf6ed] transition-colors"
            >
              <ExternalLink size={12} /> App
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== LICENSE CARD =====

function LicenseCard({ license }: { license: MyLicense }) {
  const isActive = license.status === 'active';
  const grades = license.selectedGrades?.length
    ? license.selectedGrades
    : license.allowedGrades;

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor: isActive ? '#A7F3D0' : '#E5E7EB',
        background: isActive ? '#F0FDF4' : '#FAFAFA',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={license.status} />
            {license.licenseKeyMasked && (
              <code className="rounded bg-white border border-gray-200 px-2 py-0.5 text-xs font-mono text-gray-600">
                {license.licenseKeyMasked}
              </code>
            )}
          </div>
          <p className="font-bold text-[#1a1207] text-sm">{license.productName}</p>
          <p className="text-xs text-[#6b7280] mt-0.5">{gradeLabel(grades)}</p>
          {license.expiresAt && (
            <p className="text-xs text-[#9b783e] mt-1">
              Hết hạn: <strong>{formatDate(license.expiresAt)}</strong>
            </p>
          )}
        </div>
        <div className="shrink-0">
          {isActive && (
            <a
              href={license.appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#302819] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#4b3a22] transition-colors"
            >
              <BookOpen size={13} /> Vào học
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== ORDER CARD =====

function OrderCard({ order }: { order: MyOrder }) {
  const isPaid = order.status === 'paid';
  return (
    <div className="rounded-2xl border border-[#e8ddd0] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={order.status} />
            <span className="text-xs text-gray-400 font-mono">{order.orderId}</span>
          </div>
          <p className="font-bold text-[#1a1207] text-sm">{order.productName}</p>
          {order.selectedGrades?.length > 0 && (
            <p className="text-xs text-[#6b7280]">{gradeLabel(order.selectedGrades)}</p>
          )}
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-[#302819]">{formatVND(order.amount)}</span>
            <span className="text-xs text-gray-400">
              {isPaid ? `Thanh toán: ${formatDate(order.paidAt)}` : `Tạo: ${formatDate(order.createdAt)}`}
            </span>
          </div>
          {isPaid && order.licenseKeyMasked && (
            <div className="mt-2 flex items-center gap-2">
              <Key size={12} className="text-[#9b783e]" />
              <code className="text-xs font-mono text-[#6b7280]">{order.licenseKeyMasked}</code>
            </div>
          )}
          {isPaid && order.dopiRechargeKeyMasked && (
            <div className="mt-2 rounded-xl border border-[#eadcc4] bg-[#fffdf8] p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#9b783e]">Dopi key</p>
                  <code className="block truncate text-xs font-mono text-[#302819]">{order.dopiRechargeKeyMasked}</code>
                </div>
                {order.dopiRechargeKey && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(order.dopiRechargeKey || '')}
                    className="shrink-0 rounded-lg border border-[#eadcc4] bg-white px-2 py-1 text-[10px] font-bold text-[#302819] hover:bg-[#fbf6ed]"
                  >
                    Copy
                  </button>
                )}
              </div>
              {order.dopiAmount ? (
                <p className="mt-1 text-[10px] font-semibold text-[#6b8d35]">
                  + {order.dopiAmount.toLocaleString('vi-VN')} Dopi vào key
                </p>
              ) : null}
            </div>
          )}
        </div>
        {order.status === 'pending' && (
          <div className="shrink-0 text-right">
            <p className="text-xs text-amber-600 font-medium">Đang chờ</p>
            {order.expiresAt && (
              <p className="text-xs text-gray-400">Hết hạn: {formatDate(order.expiresAt)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== MAIN ACCOUNT PAGE =====

export default function AccountPage({ onBack }: { onBack: () => void }) {
  const { user, isLoaded: userLoaded } = useUser();
  const { getToken } = useAuth();
  const { openSignIn } = useClerk();
  const currentEmail = normalizeEmail(user?.primaryEmailAddress?.emailAddress || null);

  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [licenses, setLicenses] = useState<MyLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [aiCapacity, setAiCapacity] = useState<AiCapacityData | null>(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dopiKeys, setDopiKeys] = useState<DopiRechargeKey[]>([]);
  const [redeemKey, setRedeemKey] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const [ordersRes, licensesRes] = await Promise.all([
        fetch(`${API_BASE}/me/orders`, { headers }),
        fetch(`${API_BASE}/me/licenses`, { headers }),
      ]);

      if (ordersRes.status === 401 || licensesRes.status === 401) {
        setError('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
        setLoading(false);
        return;
      }

      const [ordersData, licensesData] = await Promise.all([
        ordersRes.json(),
        licensesRes.json(),
      ]);

      setOrders(ordersData.orders || []);
      setLicenses(licensesData.licenses || []);
    } catch {
      setError('Không thể tải dữ liệu. Kiểm tra kết nối mạng và thử lại.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const fetchAiCapacity = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const token = await getToken();
      if (!token) {
        setAiLoading(false);
        return;
      }
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const dopiKey = getStoredDopiKey();
      if (dopiKey) {
        headers['X-Dopi-Key'] = dopiKey;
      }
      const [capacityRes, keysRes] = await Promise.all([
        fetch(`${API_BASE}/ai/capacity`, { headers }),
        fetch(`${API_BASE}/dopi/recharge-keys`, { headers }),
      ]);

      if (capacityRes.status === 401 || capacityRes.status === 403) {
        setAiError('Vui lòng đăng nhập lại để xem Dopi.');
        setAiLoading(false);
        return;
      }

      const data = await capacityRes.json();
      if (data.ok) {
        setAiCapacity({
          balance: Number(data.balance || 0),
          walletBalance: data.walletBalance ?? data.balance ?? null,
          dopiKeyBalance: data.dopiKeyBalance ?? null,
          dopiKeyAmount: data.dopiKeyAmount ?? null,
          authType: data.authType || null,
          transactions: data.transactions || [],
          count: data.count || 0,
        });
      } else {
        setAiError('Không thể tải quota Dopi AI.');
      }

      if (keysRes.ok) {
        const keysData = await keysRes.json();
        if (keysData.ok) {
          setDopiKeys(keysData.keys || []);
        }
      }
    } catch {
      setAiError('Không thể tải Dopi. Kiểm tra kết nối mạng và thử lại.');
    } finally {
      setAiLoading(false);
    }
  }, [getToken]);

  const handleRedeemDopiKey = useCallback(async () => {
    const key = redeemKey.trim();
    if (!key) {
      setRedeemMessage('Vui lòng nhập Dopi key.');
      return;
    }

    setRedeemLoading(true);
    setRedeemMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setRedeemMessage('Vui lòng đăng nhập lại để nạp Dopi key.');
        return;
      }
      const res = await fetch(`${API_BASE}/dopi/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Dopi-Key': key,
        },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (data.ok) {
        saveDopiKey(key);
        setRedeemKey('');
        setRedeemMessage('Đã kích hoạt Dopi key thành công.');
        await Promise.all([fetchAiCapacity(), fetchData()]);
      } else {
        setRedeemMessage(data.error || 'Không thể nạp Dopi key.');
      }
    } catch {
      setRedeemMessage('Lỗi kết nối khi nạp Dopi key. Vui lòng thử lại.');
    } finally {
      setRedeemLoading(false);
    }
  }, [fetchAiCapacity, fetchData, getToken, redeemKey]);

  useEffect(() => {
    if (userLoaded && user) {
      fetchData();
      fetchAiCapacity();
    } else if (userLoaded && !user) {
      setLoading(false);
      setAiLoading(false);
    }
  }, [userLoaded, user, fetchData, fetchAiCapacity]);

  const activeLicenses = licenses.filter(l => l.status === 'active');
  const paidOrders = orders.filter(o => o.status === 'paid');
  const otherOrders = orders.filter(o => o.status !== 'paid');

  // Not logged in
  if (userLoaded && !user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-5 px-4 py-12 text-center">
        <UserRound className="h-16 w-16 text-[#c9b17f]" />
        <h2 className="text-xl font-bold text-[#302819]">Đăng nhập để xem tài khoản</h2>
        <p className="text-sm text-[#736754]">Xem đơn hàng, gói học và key kích hoạt của bạn.</p>
        <button
          onClick={() => openSignIn()}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#302819] px-6 py-3 text-sm font-bold text-white shadow hover:bg-[#4b3a22] transition-colors"
        >
          Đăng nhập ngay
        </button>
        <button onClick={onBack} className="text-sm text-[#9b783e] hover:underline mt-1">
          ← Về trang chủ
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#eadcc4] bg-white px-3 py-2 text-sm font-semibold text-[#302819] shadow-sm hover:bg-[#fbf6ed] transition-colors"
        >
          <ArrowLeft size={15} /> Trang chủ
        </button>
        <h1 className="text-xl font-extrabold text-[#1a1207]">Tài khoản của tôi</h1>
      </div>

      {/* User info card */}
      {user && (
        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-[#e8ddd0] bg-white p-4 shadow-sm">
          {user.imageUrl ? (
            <img src={user.imageUrl} alt="avatar" className="h-14 w-14 rounded-full object-cover border border-[#eadcc4]" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#fbf6ed] border border-[#eadcc4]">
              <UserRound className="h-7 w-7 text-[#c9b17f]" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-bold text-[#1a1207] truncate">{user.fullName || user.firstName || 'Người dùng'}</p>
            <p className="text-sm text-[#736754] truncate">{user.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>
      )}

      {/* Section: Quota Dopi AI */}
      {user && (
        <section className="mb-6 px-4">
          <div className="mb-3 flex items-center gap-2">
            <Brain className="h-5 w-5 text-[#9b783e]" />
            <h2 className="text-base font-extrabold text-[#1a1207]">Quota Dopi AI</h2>
            {aiCapacity && (
              <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                Dopi đã sẵn sàng
              </span>
            )}
          </div>

          {aiLoading ? (
            <div className="rounded-2xl border border-[#e8ddd0] bg-white p-4">
              <div className="flex items-center justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#c9b17f] border-t-transparent" />
              </div>
            </div>
          ) : aiError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-700">{aiError}</p>
            </div>
          ) : !aiCapacity ? (
            <div className="rounded-2xl border border-dashed border-[#e8ddd0] bg-[#fdfaf6] p-6 text-center">
              <Brain className="mx-auto mb-2 h-8 w-8 text-[#c9b17f]" />
              <p className="text-sm font-semibold text-[#302819]">Đăng nhập để xem quota Dopi AI</p>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-[#e8ddd0] bg-white p-4">
              <AiQuotaBar
                balance={aiCapacity.balance}
                transactions={aiCapacity.transactions}
                totalOverride={aiCapacity.authType === 'dopi' ? aiCapacity.dopiKeyAmount ?? null : null}
                title="Quota Dopi AI"
                subtitle="Dopi trừ trực tiếp trên key đang dùng."
                onRefresh={fetchAiCapacity}
              />

              <div className="rounded-2xl border border-[#eadcc4] bg-[#fffdf8] p-3">
                <p className="text-sm font-extrabold text-[#302819]">Nhập Dopi key</p>
                <p className="mt-1 text-xs text-[#736754]">
                  Dopi key dùng như API key. Quota trừ trực tiếp trên key đang dùng.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={redeemKey}
                    onChange={(event) => setRedeemKey(event.target.value)}
                    placeholder="DOPI2_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="min-w-0 flex-1 rounded-xl border border-[#eadcc4] bg-white px-3 py-2 text-sm font-mono text-[#302819] outline-none focus:border-[#9b783e]"
                  />
                  <button
                    type="button"
                    onClick={handleRedeemDopiKey}
                    disabled={redeemLoading}
                    className="rounded-xl bg-[#302819] px-4 py-2 text-sm font-bold text-white hover:bg-[#4b3a22] disabled:opacity-60"
                  >
                    {redeemLoading ? 'Đang nạp...' : 'Nạp & lưu'}
                  </button>
                </div>
                {redeemMessage && (
                  <p className="mt-2 text-xs font-semibold text-[#74511e]">{redeemMessage}</p>
                )}
              </div>

              {dopiKeys.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-[#736754]">Dopi key của tôi</p>
                  <div className="flex flex-col gap-2">
                    {dopiKeys.slice(0, 5).map((item) => (
                      <div key={item.id} className="rounded-lg bg-[#fbf6ed] px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-[#302819]">
                              {item.productName || 'Gói Dopi'} · {item.amountDopi.toLocaleString('vi-VN')} Dopi
                            </p>
                              <p className="text-[10px] text-[#9b783e]">
                                {item.status === 'void'
                                  ? 'Đã hủy'
                                  : Number.isFinite(Number(item.remainingDopi))
                                    ? (
                                        Math.max(0, Math.floor(Number(item.remainingDopi))) > 0
                                          ? `${Math.max(0, Math.floor(Number(item.remainingDopi))).toLocaleString('vi-VN')} / ${Math.max(0, Math.floor(Number(item.amountDopi) || 0)).toLocaleString('vi-VN')} Dopi còn lại`
                                          : `Đã dùng hết ${Math.max(0, Math.floor(Number(item.amountDopi) || 0)).toLocaleString('vi-VN')} Dopi`
                                      )
                                    : item.redeemedAt
                                  ? 'Đã kích hoạt key'
                                  : 'Chưa kích hoạt'}
                              </p>
                            </div>
                          {item.key && (
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(item.key || '')}
                              className="shrink-0 rounded-lg border border-[#eadcc4] bg-white px-2 py-1 text-[10px] font-bold text-[#302819]"
                            >
                              Copy key
                            </button>
                          )}
                        </div>
                        <code className="mt-2 block truncate rounded-lg border border-[#eadcc4] bg-white px-2 py-1 text-[11px] text-[#302819]">
                          {item.key || item.keyMasked || 'DOPI-****'}
                        </code>
                        <RechargeKeyQuotaBar item={item} currentEmail={currentEmail} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiCapacity.transactions.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-[#736754]">Lịch sử cập nhật gần đây</p>
                  <div className="flex flex-col gap-2">
                    {aiCapacity.transactions.slice(0, 5).map((txn) => (
                      <div key={txn.id} className="flex items-center justify-between rounded-lg bg-[#fbf6ed] px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-[#302819]">
                          {txn.type === 'purchase' ? 'Đã cộng Dopi vào key' : 'Đã trừ khi dùng AI'}
                          </p>
                          <p className="text-[10px] text-[#9b783e]">{formatDate(txn.createdAt)}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${txn.amount > 0 ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                          {txn.amount > 0 ? '+' : '-'}{Math.abs(Math.round(txn.amount)).toLocaleString('vi-VN')} Dopi
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Loading */}
      {loading && <Spinner />}

      {/* Error */}
      {!loading && error && <ErrorCard message={error} onRetry={fetchData} />}

      {/* Content */}
      {!loading && !error && (
        <div className="flex flex-col gap-6">

          {/* Section: Gói học / Licenses */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-[#9b783e]" />
              <h2 className="text-base font-extrabold text-[#1a1207]">Gói học của tôi</h2>
              {activeLicenses.length > 0 && (
                <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                  {activeLicenses.length} đang hoạt động
                </span>
              )}
            </div>

            {licenses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#e8ddd0] bg-[#fdfaf6] p-6 text-center">
                <GraduationCap className="mx-auto mb-2 h-8 w-8 text-[#c9b17f]" />
                <p className="text-sm font-semibold text-[#302819]">Bạn chưa có gói học nào</p>
                <p className="mt-1 text-xs text-[#736754]">Mua gói để bắt đầu học cùng con.</p>
                <button
                  onClick={onBack}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#302819] px-4 py-2 text-xs font-bold text-white hover:bg-[#4b3a22] transition-colors"
                >
                  <Plus size={13} /> Xem bảng giá
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {licenses.map((l, i) => <LicenseCard key={l.licenseKeyMasked ?? i} license={l} />)}
              </div>
            )}
          </section>

          {/* Section: Đơn hàng đã thanh toán */}
          {paidOrders.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-[#9b783e]" />
                <h2 className="text-base font-extrabold text-[#1a1207]">Đơn hàng đã thanh toán</h2>
              </div>
              <div className="flex flex-col gap-3">
                {paidOrders.map(o => <OrderCard key={o.orderId} order={o} />)}
              </div>
            </section>
          )}

          {/* Section: Đơn hàng khác (pending/expired/cancelled) */}
          {otherOrders.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#c9b17f]" />
                <h2 className="text-base font-bold text-[#736754]">Đơn hàng khác</h2>
              </div>
              <div className="flex flex-col gap-3">
                {otherOrders.map(o => <OrderCard key={o.orderId} order={o} />)}
              </div>
            </section>
          )}

          {/* Empty orders */}
          {orders.length === 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-[#9b783e]" />
                <h2 className="text-base font-extrabold text-[#1a1207]">Đơn hàng</h2>
              </div>
              <div className="rounded-2xl border border-dashed border-[#e8ddd0] bg-[#fdfaf6] p-6 text-center">
                <ShoppingBag className="mx-auto mb-2 h-8 w-8 text-[#c9b17f]" />
                <p className="text-sm font-semibold text-[#302819]">Bạn chưa có đơn hàng nào</p>
                <p className="mt-1 text-xs text-[#736754]">Mua gói học để cùng con chinh phục chương trình lớp 1–3.</p>
              </div>
            </section>
          )}

          {/* Key section — visible only if there are licenses */}
          {licenses.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Key className="h-5 w-5 text-[#9b783e]" />
                <h2 className="text-base font-extrabold text-[#1a1207]">Key kích hoạt</h2>
              </div>
              <div className="rounded-2xl border border-[#e8ddd0] bg-white p-4">
                <p className="text-xs text-[#736754] mb-3">
                  Dùng key này để kích hoạt trên App hoặc phần mềm Windows. Nhấn nút "Sao chép" để copy key.
                </p>
                <LicenseKeyList licenses={licenses} />
              </div>
            </section>
          )}

          {/* CTA: Mua thêm / Nâng cấp */}
          <div className="rounded-2xl border border-[#eadcc4] bg-gradient-to-br from-[#fdfaf6] to-white p-5 text-center">
            <p className="text-sm font-bold text-[#302819] mb-1">Muốn học thêm lớp hoặc nâng cấp gói?</p>
            <p className="text-xs text-[#736754] mb-3">Xem tất cả gói học dành cho lớp 1–3.</p>
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl bg-[#302819] px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-[#4b3a22] transition-colors"
            >
              <Plus size={14} /> Xem bảng giá
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
