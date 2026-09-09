import { database } from './db-engine.mjs';
import { readdir,mkdir,writeFile } from 'node:fs/promises';
const db=await database();
try {
 const {rows:[inventory]}=await db.query(`select
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') as tables,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as rls_tables,
 (select count(*) from pg_policies where schemaname='public') as rls_policies,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') as public_functions,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private') as private_functions,
 (select count(*) from pg_indexes where schemaname='public') as indexes,
 (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and c.contype='f') as foreign_keys`);
 const data={migrations:(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).length,...inventory};
 await mkdir('docs',{recursive:true});await writeFile('docs/database-inventory.json',JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify(data));
} finally {await db.close();}
