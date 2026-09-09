import { beforeAll, afterAll, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomUUID } from 'node:crypto';
const projectId = 'demo-pp5-migration',
  app = initializeApp({ projectId }, 'migration-tests'),
  db = getFirestore(app),
  auth = getAuth(app);
const path = '.migration-data/emulator-migration-test.json';
const school = randomUUID(),
  user = randomUUID(),
  role = randomUUID();
const timestamp = '2026-09-08T00:00:00.000Z';
const tables: Record<string, Record<string, unknown>[]> = Object.fromEntries(
  Object.keys(JSON.parse(readFileSync('src/lib/firebase/schema.json', 'utf8'))).map((t) => [t, []]),
);
tables.schools = [
  {
    id: school,
    name: 'Migration fixture',
    code: null,
    logo_url: null,
    address: null,
    phone: null,
    director_name: null,
    education_area: null,
    created_at: timestamp,
    updated_at: timestamp,
  },
];
tables.profiles = [
  {
    id: user,
    full_name: 'Imported teacher',
    email: 'migrated@example.test',
    active: true,
    avatar_url: null,
    phone: null,
    requested_school_id: school,
    last_login_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  },
];
tables.user_roles = [
  { id: role, school_id: school, user_id: user, role: 'admin', created_at: timestamp, updated_at: timestamp },
];
let server: Server, port: number;
async function run(args: string[]) {
  return new Promise<{ code: number; output: string }>((resolve) => {
    const child = spawn(process.execPath, ['scripts/migrate-firebase.mjs', ...args, '--snapshot', path], {
      windowsHide: true,
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`,
        SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_fixture',
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
        FIREBASE_CLIENT_EMAIL: '',
        FIREBASE_PRIVATE_KEY: '',
        GOOGLE_APPLICATION_CREDENTIALS: '',
      },
    });
    let output = '';
    child.stdout.on('data', (d) => (output += String(d)));
    child.stderr.on('data', (d) => (output += String(d)));
    child.on('exit', (code) => resolve({ code: code ?? 1, output }));
  });
}
beforeAll(async () => {
  if (
    process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
  )
    throw new Error('Requires loopback emulators');
  await rm(path, { force: true });
  for (const url of [
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    `http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`,
  ])
    expect((await fetch(url, { method: 'DELETE' })).ok).toBe(true);
  server = createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url!, 'http://localhost');
    if (url.pathname.startsWith('/rest/v1/'))
      res.end(JSON.stringify(tables[url.pathname.split('/').at(-1)!] || []));
    else
      res.end(
        JSON.stringify({
          users: [
            {
              id: user,
              email: 'migrated@example.test',
              email_confirmed_at: timestamp,
              user_metadata: { full_name: 'Imported teacher' },
              identities: [{ provider: 'google', provider_id: 'migration-google-user' }],
            },
          ],
        }),
      );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await deleteApp(app);
  await rm(path, { force: true });
});
it('exports all collections and imports Google identity with preserved UUID, then verifies every document', async () => {
  expect(await run(['export'])).toMatchObject({ code: 0 });
  const imported = await run(['import', projectId]);
  expect(imported.output).toContain('Migration verified and complete');
  expect(imported.code).toBe(0);
  expect((await db.collection('profiles').doc(user).get()).data()?.email).toBe('migrated@example.test');
  expect((await auth.getUser(user)).providerData[0].uid).toBe('migration-google-user');
  expect((await run(['verify'])).code).toBe(0);
}, 60000);
it('resumes the same snapshot safely and rejects a changed source', async () => {
  expect((await run(['import', projectId])).code).toBe(0);
  tables.schools[0].name = 'Changed while migrating';
  expect((await run(['import', projectId])).code).toBe(1);
  tables.schools[0].name = 'Migration fixture';
  await db.collection('schools').doc(school).update({name:'Edited after migration'});
  expect((await run(['import',projectId])).code).toBe(1);
  expect((await db.collection('schools').doc(school).get()).data()?.name).toBe('Edited after migration');
}, 60000);
