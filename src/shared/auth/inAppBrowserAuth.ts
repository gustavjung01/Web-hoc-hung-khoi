export type ClerkSignInController = {
  openSignIn?: (options?: Record<string, unknown>) => void;
  redirectToSignIn?: (options?: Record<string, unknown>) => Promise<unknown> | void;
};

const IN_APP_BROWSER_PATTERN = /(FBAN|FBAV|FB_IAB|FBIOS|FB4A|Messenger|Instagram|Line|Zalo)/i;

export function isInAppBrowser(userAgent?: string): boolean {
  const ua = String(userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : ''));
  return IN_APP_BROWSER_PATTERN.test(ua);
}

export function getSafeSignInNextUrl(nextUrl?: string | null): string {
  if (typeof window === 'undefined') return '/';

  try {
    const parsed = new URL(nextUrl || window.location.href, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return window.location.origin;
    }
    return parsed.href;
  } catch {
    return window.location.origin;
  }
}

export function getAuthBridgeUrl(nextUrl?: string | null): string {
  if (typeof window === 'undefined') return '/auth-bridge';

  const url = new URL('/auth-bridge', window.location.origin);
  url.searchParams.set('next', getSafeSignInNextUrl(nextUrl));
  return url.toString();
}

export function startClerkSignIn(
  clerk?: ClerkSignInController | null,
  options: { forceRedirect?: boolean; nextUrl?: string | null } = {},
): boolean {
  if (typeof window === 'undefined') return false;

  const nextUrl = getSafeSignInNextUrl(options.nextUrl);
  const shouldRedirect = options.forceRedirect || isInAppBrowser();

  if (shouldRedirect && typeof clerk?.redirectToSignIn === 'function') {
    try {
      void clerk.redirectToSignIn({
        redirectUrl: nextUrl,
        afterSignInUrl: nextUrl,
        afterSignUpUrl: nextUrl,
        signInFallbackRedirectUrl: nextUrl,
        signUpFallbackRedirectUrl: nextUrl,
      });
      return true;
    } catch {
      // fallback below
    }
  }

  if (!shouldRedirect && typeof clerk?.openSignIn === 'function') {
    try {
      clerk.openSignIn({
        afterSignInUrl: nextUrl,
        afterSignUpUrl: nextUrl,
        signInFallbackRedirectUrl: nextUrl,
        signUpFallbackRedirectUrl: nextUrl,
      });
      return true;
    } catch {
      // fallback below
    }
  }

  window.location.assign(getAuthBridgeUrl(nextUrl));
  return false;
}
