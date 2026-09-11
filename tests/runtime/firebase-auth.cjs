/* eslint-disable @typescript-eslint/no-require-imports -- Regression test for Firebase's CommonJS entrypoint. */
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { createRequire } = require('node:module');
const test = require('node:test');

// Resolve the actual dependencies used by Firebase, including nested installs.
const firebaseRequire = createRequire(require.resolve('firebase-admin/auth'));

test('Firebase Auth loads with synchronous ESM require disabled', () => {
  assert.ok(process.execArgv.includes('--no-experimental-require-module'));
  assert.equal(typeof require('firebase-admin/auth').getAuth, 'function');
});

for (const algorithm of ['RS256', 'ES256']) {
  test(`JWKS ${algorithm} key lookup verifies signatures and rejects invalid tokens`, async () => {
    const jwks = firebaseRequire('jwks-rsa');
    const jwt = firebaseRequire('jsonwebtoken');
    const { publicKey, privateKey } =
      algorithm === 'RS256'
        ? generateKeyPairSync('rsa', { modulusLength: 2048 })
        : generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const key = { ...publicKey.export({ format: 'jwk' }), kid: 'runtime-test', alg: algorithm, use: 'sig' };
    const options = {
      jwksUri: 'https://unused.invalid/jwks',
      cache: false,
      // No credentials or network access: exercise the real JWK conversion.
      fetcher: async () => ({ keys: [key] }),
    };
    const client = jwks(options);
    const signingKey = await client.getSigningKey(key.kid);
    const token = jwt.sign({ sub: 'runtime-test' }, privateKey, {
      algorithm,
      keyid: key.kid,
      expiresIn: '1m',
    });
    assert.equal(
      jwt.verify(token, signingKey.getPublicKey(), { algorithms: [algorithm] }).sub,
      'runtime-test',
    );
    const parts = token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: 'tampered' })).toString('base64url');
    assert.throws(
      () => jwt.verify(parts.join('.'), signingKey.getPublicKey(), { algorithms: [algorithm] }),
      /invalid signature/,
    );
    await assert.rejects(client.getSigningKey('missing'), /Unable to find a signing key/);

    // The public jwks-rsa entrypoint also loads its Passport integration.
    const provider = jwks.passportJwtSecret(options);
    const passportKey = await new Promise((resolve, reject) => {
      provider({}, token, (error, value) => (error ? reject(error) : resolve(value)));
    });
    assert.equal(passportKey, signingKey.getPublicKey());
    const invalidKey = await new Promise((resolve, reject) => {
      provider({}, 'invalid-token', (error, value) => (error ? reject(error) : resolve(value)));
    });
    assert.equal(invalidKey, null);
  });
}
