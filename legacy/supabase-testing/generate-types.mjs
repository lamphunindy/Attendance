import { database } from './db-engine.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const db = await database();
const { rows } = await db.query(
  `select table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position`,
);
const enums = {
  app_role: "'admin' | 'teacher'",
  result_workflow: "'draft' | 'submitted' | 'approved' | 'locked'",
};
function type(c) {
  return (
    (enums[c.udt_name] ||
      { integer: 'number', numeric: 'number', boolean: 'boolean', jsonb: 'Json' }[c.data_type] ||
      'string') + (c.is_nullable === 'YES' ? ' | null' : '')
  );
}
let out = `// Generated from the executed PostgreSQL migrations. Do not edit.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport type Database = { public: { Tables: {\n`;
for (const name of [...new Set(rows.map((r) => r.table_name))]) {
  const cols = rows.filter((r) => r.table_name === name);
  out += `${name}: { Row: { ${cols.map((c) => `${c.column_name}: ${type(c)}`).join('; ')} };\nInsert: { ${cols.map((c) => `${c.column_name}${c.column_default || c.is_nullable === 'YES' ? '?' : ''}: ${type(c)}`).join('; ')} };\nUpdate: { ${cols.map((c) => `${c.column_name}?: ${type(c)}`).join('; ')} }; Relationships: [] };\n`;
}
out += '}; Views: { [_ in never]: never }; Functions: {\n';
const { rows: funcs } = await db.query(
  `select p.proname,p.proargnames,p.proargtypes::oid[] as argtypes,t.typname as ret from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_type t on t.oid=p.prorettype where n.nspname='public' and p.proname<>'touch_updated_at'`,
);
const { rows: types } = await db.query('select oid,typname from pg_type');
function sqlType(name) {
  return (
    enums[name] ||
    { void: 'undefined', bool: 'boolean', numeric: 'number', int4: 'number', jsonb: 'Json' }[name] ||
    'string'
  );
}
for (const f of funcs) {
  const args = (f.proargnames || [])
    .map((n, i) => `${n}: ${sqlType(types.find((t) => t.oid === f.argtypes[i])?.typname)}`)
    .join('; ');
  out += `${f.proname}: { Args: ${args ? `{ ${args} }` : 'Record<PropertyKey, never>'}; Returns: ${sqlType(f.ret)} };\n`;
}
out +=
  '}; Enums: { app_role: ' +
  enums.app_role +
  '; result_workflow: ' +
  enums.result_workflow +
  ' }; CompositeTypes: { [_ in never]: never } } };\nexport type TableName = keyof Database["public"]["Tables"];\nexport type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];\n';
await mkdir('src/types', { recursive: true });
await writeFile('src/types/database.types.ts', out);
await db.close();
console.log('Generated database types from migrations.');
