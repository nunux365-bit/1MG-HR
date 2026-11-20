/**
 * Global authenticated fetch interceptor for Tata 1mg People Desk.
 * Automatically injects Authorization: Bearer <1mg_token> on /api/ calls
 * and handles live session revocation (401) by redirecting to login.
 */
(function () {
  const originalFetch = window.fetch.bind(window);
  const AUTH_PUBLIC_PATHS = [
    '/api/v1/auth/check-email',
    '/api/v1/auth/login',
    '/api/v1/auth/set-password',
    '/api/v1/auth/change-password',
  ];

  function isSameOriginApi(input) {
    try {
      const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
      if (!urlStr) return false;
      if (urlStr.startsWith('/api/')) return true;
      const parsed = new URL(urlStr, window.location.origin);
      return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
    } catch (_) {
      return false;
    }
  }

  function isPublicAuthPath(input) {
    const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
    return AUTH_PUBLIC_PATHS.some((p) => urlStr.includes(p));
  }

  window.fetch = async function (input, init = {}) {
    if (!isSameOriginApi(input)) {
      return originalFetch(input, init);
    }

    const token = localStorage.getItem('1mg_token');
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined) || {});
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const nextInit = { ...init, headers };
    const response = await originalFetch(input, nextInit);

    if (response.status === 401 && !isPublicAuthPath(input)) {
      localStorage.removeItem('1mg_token');
      localStorage.removeItem('1mg_user');
      if (!window.location.pathname.endsWith('/index.html') && window.location.pathname !== '/' && window.location.pathname !== '/login.html') {
        window.location.href = '/?reason=session_revoked';
      }
    }

    return response;
  };

  window.authorizedDownload = async function (url, fallbackFilename = 'export.csv') {
    const res = await window.fetch(url);
    if (!res.ok) {
      throw new Error(`Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const disp = res.headers.get('content-disposition') || '';
    const match = disp.match(/filename="?([^"]+)"?/i);
    const filename = match ? match[1] : fallbackFilename;
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  };
})();
