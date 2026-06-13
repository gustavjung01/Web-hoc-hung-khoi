import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import './index.css';
import HomePage from './HomePage';
import ClerkTest from './ClerkTest';
import { DataDeletionPage, PrivacyPolicyPage } from './PublicLegalPages';
import { AuthBridgeFallbackPage, AuthBridgePage } from './AuthBridgePage';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkReady = !!(CLERK_KEY && !CLERK_KEY.endsWith('_xxx'));

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-[#f6f0e5] px-4 py-8 text-[#2d2518]">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-[#e6d7bd] bg-white p-5 shadow-xl md:p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b783e]">Học Hứng Khởi</p>
          <h1 className="mt-2 text-2xl font-black text-[#302819]">Trang đang cần nạp lại</h1>
          <p className="mt-3 text-sm leading-6 text-[#5f5342]">Vui lòng tải lại trang. Nếu đang mở trong Facebook/Messenger, hãy mở bằng Chrome hoặc Safari.</p>
          <div className="mt-5 grid gap-3">
            <button type="button" onClick={() => window.location.reload()} className="rounded-2xl bg-[#302819] px-4 py-3 text-sm font-black text-white">Tải lại trang</button>
            <a href="/auth-bridge" className="rounded-2xl border border-[#302819] bg-white px-4 py-3 text-center text-sm font-black text-[#302819]">Mở đăng nhập an toàn</a>
          </div>
        </section>
      </main>
    );
  }
}

function MissingClerkConfigPage() {
  return (
    <main className="min-h-screen bg-[#f6f0e5] px-4 py-8 text-[#2d2518]">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-[#e6d7bd] bg-white p-5 shadow-xl md:p-7">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b783e]">Học Hứng Khởi</p>
        <h1 className="mt-2 text-3xl font-black text-[#302819]">Trang chủ đang thiếu cấu hình đăng nhập</h1>
        <p className="mt-3 text-sm leading-6 text-[#5f5342]">Bản build thiếu cấu hình đăng nhập nên không mở trang chủ có tài khoản. Cần cấu hình rồi build lại.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <a href="https://app.hochungkhoi.site/cap-01/" className="rounded-2xl bg-[#302819] px-4 py-3 text-center text-sm font-black text-white">Mở app Cấp 1</a>
          <a href="https://app.hochungkhoi.site/lop-06/" className="rounded-2xl border border-[#302819] bg-white px-4 py-3 text-center text-sm font-black text-[#302819]">Mở app Lớp 6</a>
        </div>
      </section>
    </main>
  );
}

function App() {
  const pathname = window.location.pathname.replace(/\/$/, '');

  if (pathname === '/privacy-policy') return <PrivacyPolicyPage />;
  if (pathname === '/data-deletion') return <DataDeletionPage />;

  if (pathname === '/auth-bridge') {
    if (!clerkReady) return <AuthBridgeFallbackPage />;
    return (
      <ClerkProvider publishableKey={CLERK_KEY!}>
        <AuthBridgePage />
      </ClerkProvider>
    );
  }

  if (pathname === '/auth-test') {
    if (!clerkReady) return <AuthBridgeFallbackPage />;
    return (
      <ClerkProvider publishableKey={CLERK_KEY!}>
        <ClerkTest />
      </ClerkProvider>
    );
  }

  if (!clerkReady) return <MissingClerkConfigPage />;

  return (
    <ClerkProvider publishableKey={CLERK_KEY!}>
      <HomePage clerkEnabled={true} />
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
