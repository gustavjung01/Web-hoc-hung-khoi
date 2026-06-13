import { Component, useCallback } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { UserButton, useUser, useClerk } from '@clerk/clerk-react';
import { UserRound } from 'lucide-react';
import { isInAppBrowser, startClerkSignIn } from './shared/auth/inAppBrowserAuth';

// ErrorBoundary: nếu Clerk lỗi chỉ hiện fallback, không trắng trang
type EBState = { hasError: boolean };
class ClerkErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, EBState> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): EBState {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[ClerkHeaderAuth] Clerk error caught by boundary:', error.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Inner component dùng Clerk hooks
function ClerkAuthInner({
  isMobile,
  onMobileMenuClose,
  onGoToAccount,
}: {
  isMobile: boolean;
  onMobileMenuClose?: () => void;
  onGoToAccount?: () => void;
}) {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const inAppBrowser = isInAppBrowser();

  const handleSignIn = useCallback(() => {
    startClerkSignIn(clerk, { nextUrl: window.location.href });
    if (onMobileMenuClose) {
      setTimeout(onMobileMenuClose, 0);
    }
  }, [clerk, onMobileMenuClose]);

  const mobileBtnBase = 'inline-flex w-full items-center gap-2.5 rounded-xl border border-[#eadcc4] bg-white px-3 py-2.5 text-left text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-[#fbf6ed] active:scale-[0.98]';
  const desktopBtnBase = 'inline-flex items-center gap-2 rounded-2xl border border-[#eadcc4] bg-white px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-[#fbf6ed] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]';

  if (!isLoaded) {
    return (
      <button
        type="button"
        onClick={inAppBrowser ? handleSignIn : undefined}
        disabled={!inAppBrowser}
        className={isMobile ? mobileBtnBase + (inAppBrowser ? '' : ' opacity-50') : desktopBtnBase + (inAppBrowser ? '' : ' opacity-50')}
      >
        <UserRound className="h-4 w-4" /> Đăng nhập
      </button>
    );
  }

  if (isMobile) {
    return user ? (
      <div className="inline-flex items-center justify-between gap-2 rounded-xl border border-[#eadcc4] bg-white px-3 py-2 text-sm font-bold shadow-sm">
        <button
          type="button"
          onClick={onGoToAccount}
          className="inline-flex items-center gap-2 text-sm font-bold text-[#302819] hover:text-[#9b783e] transition-colors"
        >
          <UserRound className="h-4 w-4" /> Tài khoản
        </button>
        <UserButton afterSignOutUrl="/" />
      </div>
    ) : (
      <button type="button" onClick={handleSignIn} className={mobileBtnBase}>
        <UserRound className="h-4 w-4" /> Đăng nhập
      </button>
    );
  }

  // Desktop
  return user ? (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onGoToAccount}
        className="inline-flex items-center gap-2 rounded-2xl border border-[#eadcc4] bg-white px-4 py-2 text-sm font-semibold text-[#302819] shadow-sm hover:bg-[#fbf6ed] transition-colors"
      >
        <UserRound className="h-4 w-4" /> Tài khoản
      </button>
      <div className="inline-flex items-center rounded-2xl border border-[#eadcc4] bg-white px-2 py-1 shadow-sm">
        <UserButton afterSignOutUrl="/" />
      </div>
    </div>
  ) : (
    <button type="button" onClick={handleSignIn} className={desktopBtnBase}>
      <UserRound className="h-4 w-4" /> Đăng nhập
    </button>
  );
}

// Exported component: dùng trong HomePage khi clerkEnabled=true
// Wrapped với ErrorBoundary - nếu Clerk lỗi chỉ hiện fallback nút Đăng nhập
export default function ClerkHeaderAuth({
  isMobile = false,
  onMobileMenuClose,
  onFallback,
  onGoToAccount,
}: {
  isMobile?: boolean;
  onMobileMenuClose?: () => void;
  onFallback: () => void;
  onGoToAccount?: () => void;
}) {
  const btnClass = isMobile
    ? 'inline-flex w-full items-center gap-3 rounded-2xl border border-[#eadcc4] bg-white px-4 py-3 text-left text-sm font-semibold shadow-sm hover:bg-[#fbf6ed]'
    : 'inline-flex items-center gap-2 rounded-2xl border border-[#eadcc4] bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-[#fbf6ed]';

  const fallback = (
    <button
      onClick={() => {
        if (isInAppBrowser()) {
          startClerkSignIn(null);
          return;
        }
        onFallback();
      }}
      type="button"
      className={btnClass}
    >
      <UserRound className="h-4 w-4" /> Đăng nhập
    </button>
  );

  return (
    <ClerkErrorBoundary fallback={fallback}>
      <ClerkAuthInner isMobile={isMobile} onMobileMenuClose={onMobileMenuClose} onGoToAccount={onGoToAccount} />
    </ClerkErrorBoundary>
  );
}
