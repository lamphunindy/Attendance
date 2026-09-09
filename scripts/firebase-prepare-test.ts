import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { seedFixture, fixtureIds } from '../tests/support/firebase-fixture';
import { mkdir, writeFile } from 'node:fs/promises';
if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Test fixtures require loopback Firebase emulators');
const projectId = 'demo-pp5';
for (const url of [
  `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
  `http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`,
]) {
  const r = await fetch(url, { method: 'DELETE' });
  if (!r.ok) throw new Error('Emulator reset failed');
}
const app = initializeApp({ projectId });
const fixture = await seedFixture(getFirestore(app));
const result = await getAuth(app).importUsers(
  Object.entries(fixtureIds).map(([role, uid]) => ({
    uid,
    email: `${role}@example.test`,
    emailVerified: true,
    displayName: role === 'teacher' ? 'ครูทดสอบ' : role,
    providerData: [{ providerId: 'google.com', uid: `test-${role}`, email: `${role}@example.test` }],
  })),
);
if (result.failureCount) throw new Error('Emulator identity setup failed');
await mkdir('.firebase', { recursive: true });
await writeFile('.firebase/test-fixture.json', JSON.stringify(fixture));
console.log('Firebase test fixtures prepared');
