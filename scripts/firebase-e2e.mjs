import { spawn, execFile } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const children = [];
const env = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'fake-api-key',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-pp5',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-pp5.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_APP_ID: 'test-app',
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3001',
  FIREBASE_CLIENT_EMAIL: '',
  FIREBASE_PRIVATE_KEY: '',
  GOOGLE_APPLICATION_CREDENTIALS: '',
  BOOTSTRAP_ADMIN_EMAILS: '',
  PP5_TEST_SERVERS: 'managed',
  PP5_TEST_BASE_URL: 'http://localhost:3001',
};
function launch(args) {
  const c = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
  children.push(c);
  return c;
}
function exitCode(c) {
  return new Promise((resolve) => c.once('exit', (code) => resolve(code ?? 1)));
}
try {
  if (await exitCode(launch(['--import', 'tsx', 'scripts/firebase-prepare-test.ts'])))
    throw new Error('Failed to prepare Firebase fixtures');
  launch(['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3001']);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch('http://localhost:3001/login')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await setTimeout(1000);
  }
  if (!ready) throw new Error('Next server did not start');
  process.exitCode = await exitCode(
    launch(['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)]),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  for (const c of children.reverse())
    if (c.pid && c.exitCode === null) {
      if (process.platform === 'win32')
        await new Promise((resolve) =>
          execFile('taskkill.exe', ['/pid', String(c.pid), '/t', '/f'], { windowsHide: true }, resolve),
        );
      else c.kill('SIGTERM');
    }
}
