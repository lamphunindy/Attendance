export function safeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value))
    return '/dashboard';
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || /[\\\u0000-\u0020]/.test(decoded)) return '/dashboard';
    const url = new URL(value, 'https://internal.invalid');
    return url.origin === 'https://internal.invalid' ? url.pathname + url.search : '/dashboard';
  } catch {
    return '/dashboard';
  }
}
