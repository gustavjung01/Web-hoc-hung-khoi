type AiCapacityTransaction = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
};

type AiQuotaBarProps = {
  balance: number;
  transactions?: AiCapacityTransaction[];
  totalOverride?: number | null;
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  purchaseLabel?: string;
  purchaseHref?: string;
  compact?: boolean;
  variant?: 'card' | 'inline';
  className?: string;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const formatDopi = (value: number) => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('vi-VN');

function formatPercent(value: number): string {
  return `${Math.round(clamp(value))}%`;
}

function getQuotaStats(balance: number, transactions: AiCapacityTransaction[] = [], totalOverride: number | null = null) {
  const purchaseTotal = transactions.reduce((sum, txn) => (txn.amount > 0 ? sum + txn.amount : sum), 0);
  const usageTotal = transactions.reduce((sum, txn) => (txn.amount < 0 ? sum + Math.abs(txn.amount) : sum), 0);

  const inferredTotal =
    Number.isFinite(Number(totalOverride)) && Number(totalOverride) > 0
      ? Number(totalOverride)
      : purchaseTotal > 0
        ? purchaseTotal
        : usageTotal > 0
          ? balance + usageTotal
          : Math.max(balance, 1);

  const remainingRatio = clamp((balance / Math.max(inferredTotal, 1)) * 100) / 100;
  const usedRatio = clamp(1 - remainingRatio);

  let tone: 'good' | 'warning' | 'critical' = 'good';
  if (balance <= 0 || remainingRatio <= 0.2) {
    tone = 'critical';
  } else if (remainingRatio <= 0.6) {
    tone = 'warning';
  }

  const label =
    balance <= 0
      ? 'Hết Dopi'
      : remainingRatio <= 0.2
        ? 'Gần hết'
        : remainingRatio <= 0.6
          ? 'Sắp hết'
          : 'Còn nhiều';

  return {
    remainingRatio,
    usedRatio,
    tone,
    label,
  };
}

export default function AiQuotaBar({
  balance,
  transactions = [],
  totalOverride = null,
  title = 'Quota Dopi AI',
  subtitle = 'Dopi trừ trực tiếp trên key đang dùng.',
  onRefresh,
  purchaseLabel = 'Mua AI',
  purchaseHref = 'https://hochungkhoi.site/',
  compact = false,
  variant = 'card',
  className = '',
}: AiQuotaBarProps) {
  const stats = getQuotaStats(balance, transactions, totalOverride);
  const inline = variant === 'inline';
  const isCompact = compact || inline;

  const toneClass =
    stats.tone === 'good'
      ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
      : stats.tone === 'warning'
        ? 'border-amber-200 bg-amber-50/90 text-amber-900'
        : 'border-rose-200 bg-rose-50/90 text-rose-900';

  const barClass =
    stats.tone === 'good'
      ? 'from-emerald-500 to-cyan-500'
      : stats.tone === 'warning'
        ? 'from-amber-500 to-orange-500'
        : 'from-rose-500 to-red-500';

  const cardPadding = isCompact ? 'p-3' : 'p-4';
  const titleSize = isCompact ? 'text-sm' : 'text-base';
  const valueSize = isCompact ? 'text-xl' : 'text-2xl';
  const helperSize = isCompact ? 'text-[11px]' : 'text-xs';

  if (inline) {
    return (
      <div className={`rounded-2xl border shadow-sm font-sans ${toneClass} ${cardPadding} ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-80">{title}</p>
            <p className="mt-1 text-[11px] font-medium opacity-75">{subtitle}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-black leading-none">{formatDopi(balance)} Dopi</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">{stats.label}</p>
          </div>
        </div>

        <div className="mt-2 overflow-hidden rounded-full bg-white/70 h-2.5">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barClass} transition-all duration-300`}
            style={{ width: `${stats.remainingRatio * 100}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-medium opacity-75">
          <span>Đã dùng {formatPercent(stats.usedRatio * 100)}</span>
          <span>Còn lại {formatPercent(stats.remainingRatio * 100)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border shadow-sm font-sans ${toneClass} ${cardPadding} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-extrabold ${titleSize}`}>{title}</p>
          <p className={`mt-1 ${helperSize} opacity-80`}>{subtitle}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`font-black ${valueSize}`}>{formatDopi(balance)} Dopi</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">{stats.label}</p>
        </div>
      </div>

      <div className={`mt-3 overflow-hidden rounded-full bg-white/70 ${compact ? 'h-2.5' : 'h-3'}`}>
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barClass} transition-all duration-300`}
          style={{ width: `${stats.remainingRatio * 100}%` }}
        />
      </div>

      <div className={`mt-3 flex items-center justify-between gap-3 ${helperSize} font-semibold opacity-85`}>
        <span>Đã dùng {formatPercent(stats.usedRatio * 100)}</span>
        <span>Còn lại {formatPercent(stats.remainingRatio * 100)}</span>
      </div>

      {stats.tone !== 'good' && (
        <div className={`mt-2 ${helperSize} font-medium`}>
          {stats.tone === 'warning'
            ? 'Dopi sắp hết, bạn nên nạp thêm để không bị gián đoạn.'
            : 'Dopi đã hết, hãy nạp thêm để tiếp tục dùng AI.'}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center justify-center rounded-xl border border-current/20 bg-white/85 px-3 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.98]"
          >
            Cập nhật Dopi
          </button>
        )}
        {purchaseHref && (
          <a
            href={purchaseHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl bg-[#302819] px-3 py-2 text-xs font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4b3a22] hover:shadow-sm active:scale-[0.98]"
          >
            {purchaseLabel}
          </a>
        )}
      </div>
    </div>
  );
}
