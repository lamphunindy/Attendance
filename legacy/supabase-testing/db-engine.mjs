import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
export async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
 create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),provider_id text,provider text,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon,service_role;
 grant execute on function auth.uid() to authenticated,anon,service_role;`);
  for (const file of (await readdir('supabase/migrations')).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = (await readFile('supabase/migrations/' + file, 'utf8')).replace(
      'create extension if not exists pgcrypto;',
      '',
    );
    await db.exec(sql);
  }
  return db;
}
