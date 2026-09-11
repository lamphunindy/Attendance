import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/app', () => ({
  applicationDefault: vi.fn(),
  cert: vi.fn(),
  getApps: () => [{ name: 'pp5' }],
  initializeApp: vi.fn(),
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({ orderBy: () => ({ limit: () => ({ get: read }) }) }),
  }),
}));

import { loginBranding } from '@/lib/firebase/admin';

describe('login page branding when Firebase is unavailable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'test-key');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'test');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    read.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns branding when Firestore responds', async () => {
    read.mockResolvedValue({ docs: [{ data: () => ({ name: 'School', logo_url: '/logo.svg' }) }] });
    await expect(loginBranding()).resolves.toEqual({ name: 'School', logo_url: '/logo.svg' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets the login page render after two seconds when Firestore never responds', async () => {
    read.mockReturnValue(new Promise(() => {}));
    const result = loginBranding();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('handles a late database failure after falling back', async () => {
    let rejectRead!: (error: Error) => void;
    read.mockReturnValue(
      new Promise((_, reject) => {
        rejectRead = reject;
      }),
    );
    const result = loginBranding();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBeNull();
    rejectRead(new Error('late failure'));
    await vi.advanceTimersByTimeAsync(1);
  });

  it('falls back on credential errors without logging the error message', async () => {
    read.mockRejectedValue(Object.assign(new Error('sensitive detail'), { code: 'app/invalid-credential' }));
    await expect(loginBranding()).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[firebase/login-branding] unavailable',
      'app/invalid-credential',
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not query Firestore when configuration is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', '');
    await expect(loginBranding()).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
