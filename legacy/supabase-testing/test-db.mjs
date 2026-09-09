import { database } from './db-engine.mjs';
import { readFile, readdir } from 'node:fs/promises';
const db = await database();
try {
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  console.log('PASS: all migrations and development seed executed');
  for (const file of (await readdir('supabase/tests')).filter((f) => f.endsWith('.sql')).sort()) {
    console.log('Suite:', file);
    const results = await db.exec(await readFile('supabase/tests/' + file, 'utf8'));
    for (const result of results)
      for (const row of result.rows)
        for (const value of Object.values(row))
          if (typeof value === 'string' && /^(ok |1\.\.)/.test(value)) console.log(value);
  }
  console.log('PASS: PostgreSQL RLS and transactional workflow tests');
} catch (error) {
  console.error('FAIL:', error.message, '\n', error.where || '');
  process.exitCode = 1;
} finally {
  await db.close();
}
