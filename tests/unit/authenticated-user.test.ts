import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), migration: vi.fn(), cookie: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock('@/lib/firebase/admin', () => ({
  isConfigured: () => true,
  adminAuth: () => ({ verifySessionCookie: mocks.verify }),
  firestore: () => ({ collection: () => ({ doc: () => ({ get: mocks.migration }) }) }),
}));
vi.mock('@/lib/firebase/identity', () => ({ profileId: (uid: string) => `profile-${uid}` }));
import { authenticatedUser } from '@/lib/firebase/server';

const token = {
  uid: 'teacher',
  email: 'teacher@example.test',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
};
const complete = { exists: true, data: () => ({ status: 'complete' }) };

describe('parallel session checks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookie.mockReturnValue({ value: 'session' });
    mocks.verify.mockResolvedValue(token);
    mocks.migration.mockResolvedValue(complete);
  });

  it('starts both checks together and returns a user only after both succeed', async () => {
    const verification = Promise.withResolvers<typeof token>();
    const migration = Promise.withResolvers<typeof complete>();
    mocks.verify.mockReturnValue(verification.promise);
    mocks.migration.mockReturnValue(migration.promise);
    const result = authenticatedUser();
    await vi.waitFor(() => expect(mocks.migration).toHaveBeenCalledTimes(1));
    expect(mocks.verify).toHaveBeenCalledWith('session', true);
    verification.resolve(token);
    migration.resolve(complete);
    await expect(result).resolves.toEqual({
      id: 'profile-teacher',
      firebaseUid: 'teacher',
      email: token.email,
    });
  });

  it('still rejects revoked sessions', async () => {
    mocks.verify.mockRejectedValue(new Error('revoked'));
    await expect(authenticatedUser()).resolves.toBeNull();
    expect(mocks.verify).toHaveBeenCalledWith('session', true);
  });

  it('blocks access during migration', async () => {
    mocks.migration.mockResolvedValue({ exists: true, data: () => ({ status: 'running' }) });
    await expect(authenticatedUser()).resolves.toBeNull();
  });

  it('fails closed if either service is unavailable', async () => {
    mocks.migration.mockRejectedValue(new Error('unavailable'));
    await expect(authenticatedUser()).resolves.toBeNull();
  });

  it('does not call Firebase for anonymous requests', async () => {
    mocks.cookie.mockReturnValue(undefined);
    await expect(authenticatedUser()).resolves.toBeNull();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.migration).not.toHaveBeenCalled();
  });

  it.each([
    { ...token, email_verified: false },
    { ...token, firebase: { sign_in_provider: 'password' } },
  ])('rejects unverified and non-Google identities', async (invalid) => {
    mocks.verify.mockResolvedValue(invalid);
    await expect(authenticatedUser()).resolves.toBeNull();
  });
});
