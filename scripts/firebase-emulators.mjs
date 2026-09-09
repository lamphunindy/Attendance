import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
const env = { ...process.env };
const root = path.resolve('.tools/java21');
if (existsSync(root)) {
  const java = readdirSync(root).find((n) => existsSync(path.join(root, n, 'bin', 'java.exe')));
  if (java) {
    env.JAVA_HOME = path.join(root, java);
    const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')||'PATH';
    env[pathKey] = path.join(env.JAVA_HOME, 'bin') + path.delimiter + (env[pathKey]||'');
  }
}
const mode = process.argv[2] || 'test';
const args =
  mode === 'start'
    ? ['emulators:start', '--only', 'auth,firestore', '--project', 'demo-pp5']
    : [
        'emulators:exec',
        '--only',
        'auth,firestore',
        '--project',
        'demo-pp5',
        mode === 'e2e'
          ? 'node scripts/firebase-e2e.mjs'
          : 'node node_modules/vitest/vitest.mjs run --config vitest.firebase.config.ts',
      ];
const child = spawn(process.execPath, ['node_modules/firebase-tools/lib/bin/firebase.js', ...args], {
  env,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => (process.exitCode = code ?? 1));
