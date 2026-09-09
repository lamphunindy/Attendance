// Test-only HTTP adapter: real PostgreSQL/RLS, synthetic authenticated identities.
// It is never imported by the application and never used in production.
import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { database } from '../../scripts/db-engine.mjs';
const db = await database();
await db.exec(await readFile('supabase/seed.sql', 'utf8'));
const admin = '90000000-0000-4000-8000-000000000001',
  teacher = '90000000-0000-4000-8000-000000000002';
const {
  rows: [school],
} = await db.query("select id from schools where code='DEMO'");
for (const [id, name, email, role] of [
  [admin, 'ผู้ดูแลทดสอบ', 'admin@example.test', 'admin'],
  [teacher, 'ครูทดสอบ', 'teacher@example.test', 'teacher'],
]) {
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, email]);
  await db.query('insert into profiles(id,full_name,email,requested_school_id) values($1,$2,$3,$4)', [
    id,
    name,
    email,
    school.id,
  ]);
  await db.query('insert into user_roles(user_id,school_id,role) values($1,$2,$3)', [id, school.id, role]);
}
const {
  rows: [assignment],
} = await db.query(
  `insert into teacher_assignments(school_id,teacher_id,classroom_id,subject_id,term_id) select c.school_id,$1,c.id,s.id,t.id from classrooms c join subjects s on s.school_id=c.school_id join terms t on t.academic_year_id=c.academic_year_id where c.school_id=$2 returning id`,
  [teacher, school.id],
);
const { rows: columns } = await db.query(
  "select table_name,column_name,data_type from information_schema.columns where table_schema='public'",
);
const tableNames = new Set(columns.map((c) => c.table_name));
const { rows: functions } = await db.query(
  "select p.proname,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'",
);
const key = 'pp5-test-only-identity-signing-key';
function token(id) {
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const unsigned =
    encode({ alg: 'HS256', typ: 'JWT' }) +
    '.' +
    encode({
      sub: id,
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'http://127.0.0.1:54329/auth/v1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7200,
    });
  return unsigned + '.' + createHmac('sha256', key).update(unsigned).digest('base64url');
}
function identify(req) {
  const raw = req.headers.authorization?.replace('Bearer ', '');
  if (!raw) return null;
  try {
    const [header, payload, sig] = raw.split('.'),
      expected = createHmac('sha256', key)
        .update(header + '.' + payload)
        .digest();
    if (!timingSafeEqual(Buffer.from(sig, 'base64url'), expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    return [admin, teacher].includes(claims.sub) && claims.exp > Date.now() / 1000 ? claims.sub : null;
  } catch {
    return null;
  }
}
function user(id) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: id === admin ? 'admin@example.test' : 'teacher@example.test',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: { full_name: id === admin ? 'ผู้ดูแลทดสอบ' : 'ครูทดสอบ' },
    identities: [{ provider: 'google', user_id: id, identity_data: { email_verified: true } }],
    created_at: new Date().toISOString(),
  };
}
function session(id) {
  return {
    access_token: token(id),
    refresh_token: 'test-refresh-' + id,
    expires_in: 7200,
    expires_at: Math.floor(Date.now() / 1000) + 7200,
    token_type: 'bearer',
    user: user(id),
  };
}
function ident(v) {
  if (!/^[a-z_][a-z0-9_]*$/.test(v)) throw new Error('Invalid identifier');
  return '"' + v + '"';
}
function jsonRows(table, rows) {
  const numeric = new Set(
    columns.filter((c) => c.table_name === table && c.data_type === 'numeric').map((c) => c.column_name),
  );
  return rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, numeric.has(k) && v !== null ? Number(v) : v])),
  );
}
function queryParts(table, params, values) {
  const where = [];
  for (const [column, filter] of params) {
    if (['select', 'order', 'offset', 'limit', 'on_conflict'].includes(column)) continue;
    if (column === 'or') {
      const parts = filter.replace(/^\(|\)$/g, '').split(',');
      where.push(
        '(' +
          parts
            .map((p) => {
              const dot = p.indexOf('.');
              return expression(p.slice(0, dot), p.slice(dot + 1));
            })
            .join(' or ') +
          ')',
      );
    } else where.push(expression(column, filter));
  }
  function expression(column, filter) {
    ident(column);
    const dot = filter.indexOf('.'),
      op = filter.slice(0, dot),
      value = filter.slice(dot + 1);
    if (op === 'in') {
      const list = value
        .replace(/^\(|\)$/g, '')
        .split(',')
        .filter(Boolean);
      if (!list.length) return 'false';
      return `${ident(column)} in (${list
        .map((v) => {
          values.push(v);
          return '$' + values.length;
        })
        .join(',')})`;
    }
    if (op === 'is' && value === 'null') return `${ident(column)} is null`;
    const sqlop = { eq: '=', neq: '<>', gte: '>=', gt: '>', lt: '<', lte: '<=', ilike: 'ilike' }[op];
    if (!sqlop) throw new Error('Unsupported operator ' + op);
    values.push(value);
    return `${ident(column)} ${sqlop} $${values.length}`;
  }
  return where.length ? ' where ' + where.join(' and ') : '';
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization,apikey,content-type,x-client-info,prefer,range',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,HEAD,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1:54329'),
    uid = identify(req);
  const send = (status, data) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  if (url.pathname === '/health') {
    send(200, { ready: true });
    return;
  }
  if (url.pathname === '/test/session') {
    const id = url.searchParams.get('role') === 'admin' ? admin : teacher;
    send(200, { session: session(id), assignment: assignment.id, school: school.id });
    return;
  }
  if (url.pathname === '/auth/v1/user') {
    send(uid ? 200 : 401, uid ? user(uid) : { message: 'Unauthorized' });
    return;
  }
  if (url.pathname === '/auth/v1/logout') {
    send(204, null);
    return;
  }
  if (url.pathname === '/auth/v1/.well-known/jwks.json') {
    send(200, { keys: [] });
    return;
  }
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 5000000) throw new Error('Payload too large');
    }
    const data = body ? JSON.parse(body) : null;
    const result = await db.transaction(async (tx) => {
      await tx.exec('set local role ' + (uid ? 'authenticated' : 'anon'));
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [uid || '']);
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').pop(),
          fn = functions.find((f) => f.proname === name);
        if (!fn) throw new Error('Unknown RPC');
        const values = [],
          args = [];
        for (const arg of fn.proargnames || []) {
          if (!Object.hasOwn(data || {}, arg)) continue;
          values.push(
            typeof data[arg] === 'object' && data[arg] !== null ? JSON.stringify(data[arg]) : data[arg],
          );
          args.push(ident(arg) + '=> $' + values.length);
        }
        const r = await tx.query(`select public.${ident(name)}(${args.join(',')}) as value`, values);
        return { rpc: true, value: r.rows[0]?.value ?? null };
      }
      const table = url.pathname.split('/').pop();
      if (!tableNames.has(table)) throw new Error('Unknown table');
      const params = url.searchParams,
        select = params.get('select') || '*',
        projection = select === '*' ? '*' : select.split(',').map(ident).join(',');
      let rows = [],
        count = 0;
      const values = [];
      if (req.method === 'GET' || req.method === 'HEAD') {
        const where = queryParts(table, params, values);
        const cr = await tx.query(`select count(*) from public.${ident(table)}${where}`, values);
        count = Number(cr.rows[0].count);
        let suffix = '';
        const order = params.get('order');
        if (order)
          suffix +=
            ' order by ' +
            order
              .split(',')
              .map((o) => {
                const [col, dir] = o.split('.');
                return ident(col) + (dir === 'desc' ? ' desc' : ' asc');
              })
              .join(',');
        const offset = Math.max(0, Number(params.get('offset')) || 0),
          limit = Math.min(1000, Math.max(1, Number(params.get('limit')) || 1000));
        suffix += ` limit ${limit} offset ${offset}`;
        if (req.method !== 'HEAD')
          rows = (await tx.query(`select ${projection} from public.${ident(table)}${where}${suffix}`, values))
            .rows;
        return { rows: jsonRows(table, rows), count, offset };
      }
      if (req.method === 'POST') {
        for (const row of Array.isArray(data) ? data : [data]) {
          const cols = Object.keys(row),
            vals = cols.map((c) =>
              typeof row[c] === 'object' && row[c] !== null ? JSON.stringify(row[c]) : row[c],
            );
          let sql = `insert into public.${ident(table)}(${cols.map(ident).join(',')}) values(${vals.map((_, i) => '$' + (i + 1)).join(',')})`;
          if (req.headers.prefer?.includes('resolution=merge-duplicates')) {
            const conflict = params.get('on_conflict') || 'id';
            sql +=
              ` on conflict(${conflict.split(',').map(ident).join(',')}) do update set ` +
              cols
                .filter((c) => !conflict.split(',').includes(c))
                .map((c) => ident(c) + '=excluded.' + ident(c))
                .join(',');
          }
          sql += ' returning ' + projection;
          rows.push(...(await tx.query(sql, vals)).rows);
        }
      } else if (req.method === 'PATCH') {
        const sets = Object.entries(data).map(([k, v]) => {
          values.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
          return ident(k) + '=$' + values.length;
        });
        const where = queryParts(table, params, values);
        rows = (
          await tx.query(
            `update public.${ident(table)} set ${sets.join(',')}${where} returning ${projection}`,
            values,
          )
        ).rows;
      } else throw new Error('Unsupported method');
      return { rows: jsonRows(table, rows), count: rows.length, offset: 0 };
    });
    if (result.rpc) {
      send(200, result.value);
      return;
    }
    res.setHeader(
      'Content-Range',
      `${result.offset}-${result.offset + Math.max(0, result.rows.length - 1)}/${result.count}`,
    );
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    if (req.headers.accept?.includes('vnd.pgrst.object')) {
      if (result.rows.length !== 1) {
        send(406, { code: 'PGRST116', message: 'Expected one row', details: result.rows.length + ' rows' });
        return;
      }
      send(200, result.rows[0]);
      return;
    }
    send(
      req.method === 'POST' ? 201 : 200,
      req.headers.prefer?.includes('return=minimal') ? null : result.rows,
    );
  } catch (error) {
    send(error.code === '42501' ? 403 : 400, {
      code: error.code || 'TEST_ADAPTER',
      message: error.message,
      details: error.detail || null,
    });
  }
});
server.listen(54329, '127.0.0.1', () => console.log('Test PostgreSQL adapter ready on 54329'));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      process.exit(0);
    }),
  );
