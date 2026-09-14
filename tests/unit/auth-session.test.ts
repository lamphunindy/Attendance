import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  adminAuth: vi.fn(),
  verifyIdToken: vi.fn(),
  createSessionCookie: vi.fn(),
  registerIdentity: vi.fn(),
}));
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: mocks.adminAuth, firestore: () => ({}) }));
vi.mock('@/lib/firebase/identity', () => ({ registerIdentity: mocks.registerIdentity }));
import { POST } from '@/app/api/auth/session/route';

describe('session failure diagnostics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://mkattendance.netlify.app');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.adminAuth.mockReturnValue(mocks);
    mocks.verifyIdToken.mockResolvedValue({
      auth_time: Math.floor(Date.now() / 1000),
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    });
    mocks.registerIdentity.mockResolvedValue('test-actor');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ['adminAuth', 'initialize-firebase', 'app/invalid-credential', 'invalid-private-key-format'],
    ['verifyIdToken', 'verify-token', 'auth/id-token-expired', 'operation-failed'],
    ['registerIdentity', 'register-profile', '7', 'operation-failed'],
    ['createSessionCookie', 'create-session', 'auth/internal-error', 'operation-failed'],
  ] as const)(
    'logs safe diagnostics when %s fails without exposing secrets',
    async (method, stage, code, reason) => {
      const secret = 'sensitive-token-and-private-key-content';
      const error = Object.assign(new Error(`Failed to parse private key: ${secret}`), { code });
      mocks[method].mockImplementation(() => {
        throw error;
      });
      const response = await POST(
        new NextRequest('https://mkattendance.netlify.app/api/auth/session', {
          method: 'POST',
          headers: { origin: 'https://mkattendance.netlify.app', 'content-type': 'application/json' },
          body: JSON.stringify({ idToken: secret }),
        }),
      );
      expect(response.status).toBe(401);
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(console.error).toHaveBeenCalledWith('[auth/session] failed', { stage, code, reason });
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
      const body = await response.json();
      expect(body.reference).toMatch(/^LOGIN-[A-Z-]+$/);
      if (reason === 'invalid-private-key-format') expect(body.reference).toBe('LOGIN-KEY');
      expect(JSON.stringify(body)).not.toContain(secret);
    },
  );
});
