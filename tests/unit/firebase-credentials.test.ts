import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { credentialValue, firebasePrivateKey } from '@/lib/firebase/credentials';

const pem = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ format: 'pem', type: 'pkcs8' })
  .toString();

describe('Firebase dashboard credential formatting', () => {
  it.each([
    pem,
    pem.replaceAll('\n', '\r\n'),
    pem.replaceAll('\n', '\\n'),
    JSON.stringify(pem),
    `FIREBASE_PRIVATE_KEY=${JSON.stringify(pem)}`,
    `  '${pem.replaceAll('\n', '\\n')}'  `,
  ])('accepts supported PEM input format %# without changing the key', (value) => {
    const parsed = createPrivateKey(firebasePrivateKey(value));
    expect(parsed.export({ format: 'pem', type: 'pkcs8' })).toBe(pem);
  });

  it('does not make a truncated key valid', () => {
    expect(() => createPrivateKey(firebasePrivateKey('"-----BEGIN PRIVATE KEY-----\\ntruncated"'))).toThrow();
  });

  it('accepts a quoted client email or copied assignment', () => {
    const email = 'service@example.iam.gserviceaccount.com';
    expect(credentialValue(` FIREBASE_CLIENT_EMAIL="${email}" `, 'FIREBASE_CLIENT_EMAIL')).toBe(email);
  });
});
