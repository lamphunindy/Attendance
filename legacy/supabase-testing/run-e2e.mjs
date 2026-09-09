import { spawn, execFile } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const children = [];
function launch(file, args, env = {}) {
  const child = spawn(process.execPath, [file, ...args], {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, ...env },
  });
  children.push(child);
  return child;
}
async function ready(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Server is starting. */
    }
    await setTimeout(1000);
  }
  throw new Error('Test server startup timed out: ' + url);
}
async function stop(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32')
    await new Promise((resolve) =>
      execFile('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, resolve),
    );
  else child.kill('SIGTERM');
}
try {
  launch('tests/support/database-api.mjs', []);
  await ready('http://127.0.0.1:54329/health');
  launch('node_modules/next/dist/bin/next', ['dev', '--hostname', '127.0.0.1'], {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-only-publishable-key',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    SUPABASE_SERVICE_ROLE_KEY: '',
    BOOTSTRAP_ADMIN_EMAILS: '',
  });
  await ready('http://localhost:3000/login');
  const tests = launch('node_modules/@playwright/test/cli.js', ['test', ...process.argv.slice(2)], {
    PP5_TEST_SERVERS: 'managed',
  });
  process.exitCode = await new Promise((resolve) => tests.once('exit', (code) => resolve(code ?? 1)));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const child of children.reverse()) await stop(child);
}
