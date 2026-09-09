import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const pkg = JSON.parse(await readFile('node_modules/supabase/package.json', 'utf8'));
const binary = resolve('node_modules/supabase', pkg.bin.supabase);
const args = ['gen', 'types', 'typescript', '--local'];
const { stdout } = await promisify(execFile)(
  binary.endsWith('.js') ? process.execPath : binary,
  binary.endsWith('.js') ? [binary, ...args] : args,
  { maxBuffer: 10 * 1024 * 1024, windowsHide: true },
);
const aliases =
  '\nexport type TableName = keyof Database["public"]["Tables"];\nexport type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];\n';
await writeFile('src/types/database.types.ts', stdout + aliases);
