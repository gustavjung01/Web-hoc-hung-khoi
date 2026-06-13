import { useMemo, useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { ArrowLeft, Copy, ExternalLink, UserRound } from 'lucide-react';
import { getSafeSignInNextUrl, isInAppBrowser, startClerkSignIn } from './shared/auth/inAppBrowserAuth';

function getNextUrlFromQuery(): string {
  if (typeof window === 'undefined') return '/';

  const params = new URLSearchParams(window.location.search);
  return getSafeSignInNextUrl(params.get('next') || '/');
}

function AuthBridgeLayout({
  clerkEnabled,
  onSignIn,
}: {
  clerkEnabled: boolean;
  onSignIn?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const nextUrl = useMemo(() => getNextUrlFromQuery(), []);
  const inApp = isInAppBrowser();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(nextUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f0e5] px-4 py-8 text-[#2d2518]">
      <section className="mx-auto max-w-xl rounded-[2rem] border border-[#e6d7bd] bg-white p-5 shadow-xl md:p-7">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1dfb5]">
            <UserRound className="h-6 w-6 text-[#74511e]" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b783e]">Đăng nhập</p>
            <h1 className="text-2xl font-black text-[#302819]">Mở tài khoản Học Hứng Khởi</h1>
          </div>
        </div>

        <div className="rounded-2xl border border-[#eadcc4] bg-[#fffaf1] p-4 text-sm leading-6 text-[#5f5342]">
          {inApp ? (
            <p>
              Bạn đang mở trang trong Facebook/Messenger/Instagram. Một số trình duyệt trong app có thể chặn popup đăng nhập.
              Hãy bấm đăng nhập bên dưới. Nếu vẫn không phản hồi, sao chép link và mở bằng Chrome/Safari.
            </p>
          ) : (
            <p>
              Bấm đăng nhập để tiếp tục. Sau khi đăng nhập xong, hệ thống sẽ đưa bạn quay lại trang đang xem.
            </p>
          )}
        </div>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            onClick={onSignIn}
            disabled={!clerkEnabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#302819] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#4b3a22] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UserRound className="h-4 w-4" />
            Đăng nhập ngay
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#302819] bg-white px-4 py-3 text-sm font-black text-[#302819] transition hover:bg-[#fbf6ed]"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Đã copy link' : 'Copy link để mở bằng trình duyệt ngoài'}
          </button>

          <a
            href={nextUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#eadcc4] bg-[#fbf7ef] px-4 py-3 text-sm font-black text-[#74511e] transition hover:bg-[#f1dfb5]"
          >
            <ExternalLink className="h-4 w-4" />
            Mở lại trang hiện tại
          </a>

          <a
            href="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-[#6a5b46] transition hover:bg-[#fbf6ed]"
          >
            <ArrowLeft className="h-4 w-4" />
            Về trang chủ
          </a>
        </div>

        {!clerkEnabled ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            Chưa cấu hình Clerk publishable key, không thể mở đăng nhập.
          </p>
        ) : null}
      </section>
    </main>
  );
}

export function AuthBridgePage() {
  const clerk = useClerk();

  return (
    <AuthBridgeLayout
      clerkEnabled={true}
      onSignIn={() => startClerkSignIn(clerk, { forceRedirect: true, nextUrl: getNextUrlFromQuery() })}
    />
  );
}

export function AuthBridgeFallbackPage() {
  return <AuthBridgeLayout clerkEnabled={false} />;
}
