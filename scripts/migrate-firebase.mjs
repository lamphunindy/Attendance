import './firebase-env.mjs';
import { services } from './firebase-env.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const snapshotFlag = process.argv.indexOf('--snapshot');
const file = snapshotFlag >= 0 ? process.argv[snapshotFlag + 1] : '.migration-data/supabase-snapshot.json';
if (!file) throw new Error('Missing snapshot path');
const schema = JSON.parse(await readFile('src/lib/firebase/schema.json', 'utf8'));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
async function exportSource() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || key.startsWith('sb_publishable_'))
    throw new Error('Source Supabase URL and server secret are required for export only');
  const headers = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  async function request(path) {
    const r = await fetch(new URL(path, base), { headers, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Source request failed (${r.status}) for ${path.split('?')[0]}`);
    return r.json();
  }
  const tables = {};
  for (const table of Object.keys(schema)) {
    const rows = [];
    let last = '';
    for (;;) {
      const batch = await request(
        `/rest/v1/${table}?select=*&order=id&limit=500${last ? '&id=gt.' + last : ''}`,
      );
      if (!Array.isArray(batch)) throw new Error('Invalid export response');
      rows.push(...batch);
      if (batch.length < 500) break;
      last = batch.at(-1).id;
    }
    tables[table] = rows;
  }
  const users = [];
  for (let page = 1; ; page++) {
    const result = await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
    users.push(...result.users);
    if (result.users.length < 100) break;
  }
  return {
    version: 1,
    sourceProject: new URL(base).hostname.split('.')[0],
    exportedAt: new Date().toISOString(),
    tables,
    users,
  };
}
const parents = {
  terms: ['academic_years', 'academic_year_id'],
  enrollments: ['classrooms', 'classroom_id'],
  score_categories: ['teacher_assignments', 'teacher_assignment_id'],
  score_items: ['score_categories', 'score_category_id'],
  student_scores: ['score_items', 'score_item_id'],
  final_results: ['teacher_assignments', 'teacher_assignment_id'],
  attendance_sessions: ['teacher_assignments', 'teacher_assignment_id'],
  attendance_records: ['attendance_sessions', 'attendance_session_id'],
  learning_indicators: ['teacher_assignments', 'teacher_assignment_id'],
  indicator_results: ['learning_indicators', 'learning_indicator_id'],
  characteristic_results: ['teacher_assignments', 'teacher_assignment_id'],
  reading_assessment_results: ['teacher_assignments', 'teacher_assignment_id'],
};
function decorated(snapshot) {
  const maps = Object.fromEntries(
    Object.entries(snapshot.tables).map(([t, rows]) => [t, new Map(rows.map((r) => [r.id, r]))]),
  );
  function scope(t, d) {
    if (t === 'schools') return { _school_id: d.id };
    if (t === 'teacher_assignments')
      return { _school_id: d.school_id, _assignment_id: d.id, _classroom_id: d.classroom_id };
    if (t === 'classrooms') return { _school_id: d.school_id, _classroom_id: d.id };
    if (parents[t]) {
      const [pt, f] = parents[t],
        parent = maps[pt].get(d[f]);
      if (!parent) throw new Error(`Broken reference ${t}.${f}`);
      return scope(pt, parent);
    }
    return { _school_id: d.school_id || d.requested_school_id || '' };
  }
  return Object.fromEntries(
    Object.entries(snapshot.tables).map(([t, rows]) => [t, rows.map((r) => ({ ...r, ...scope(t, r) }))]),
  );
}
async function verify(db, tables) {
  for (const [t, rows] of Object.entries(tables)) {
    const actual = (await db.collection(t).get()).docs
      .map((d) => d.data())
      .sort((a, b) => a.id.localeCompare(b.id));
    const expected = [...rows].sort((a, b) => a.id.localeCompare(b.id));
    if (digest(actual) !== digest(expected))
      throw new Error(`Verification failed for ${t}; destination remains closed`);
    console.log(`${t}: verified ${rows.length}`);
  }
}
try {
  const command = process.argv[2] || 'export';
  if (command === 'export') {
    const snapshot = await exportSource();
    await mkdir('.migration-data', { recursive: true });
    try {
      await readFile(file);
      throw new Error('Snapshot already exists. Archive it before starting a new export.');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    await writeFile(file, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(
      JSON.stringify({
        exported: true,
        tables: Object.keys(snapshot.tables).length,
        rows: Object.values(snapshot.tables).reduce((n, r) => n + r.length, 0),
        authUsers: snapshot.users.length,
        file,
      }),
    );
  } else {
    const snapshot = JSON.parse(await readFile(file, 'utf8'));
    const tables = decorated(snapshot),
      hash = digest({ tables: snapshot.tables, users: snapshot.users });
    const { db, auth, projectId } = services();
    if (command === 'verify') {
      await verify(db, tables);
      console.log('Destination data matches snapshot');
    } else if (command === 'import') {
      if (process.argv[3] !== projectId)
        throw new Error('Pass the exact destination Firebase project ID after import');
      const fresh = await exportSource();
      if (digest(fresh.tables) !== digest(snapshot.tables))
        throw new Error('Source changed since export. Freeze source writes and create a fresh snapshot.');
      const state = await db.collection('_system').doc('migration').get();
      if (state.exists && state.data().snapshot !== hash)
        throw new Error('A different migration already exists');
      if (state.exists && state.data().status === 'complete') {
        await verify(db, tables);
        console.log('Migration already complete; verified without rewriting destination data.');
        process.exit(0);
      }
      if (!state.exists) {
        for (const t of Object.keys(tables))
          if (!(await db.collection(t).limit(1).get()).empty)
            throw new Error('Destination must be empty: ' + t);
        if ((await auth.listUsers(1)).users.length)
          throw new Error('Destination Authentication must be empty');
      }
      await db
        .collection('_system')
        .doc('migration')
        .set({ status: 'running', snapshot: hash, sourceProject: snapshot.sourceProject });
      for (const user of snapshot.users) {
        const google = user.identities?.find((i) => i.provider === 'google');
        if (!google) throw new Error('Source account has no Google identity; resolve before migration');
        const googleUid = google.provider_id || google.identity_data?.sub;
        if (!googleUid) throw new Error('Missing Google identity identifier');
        try {
          const existing = await auth.getUser(user.id);
          if (!existing.providerData.some((p) => p.providerId === 'google.com' && p.uid === googleUid))
            throw new Error('Destination identity mismatch');
        } catch (e) {
          if (e.code !== 'auth/user-not-found') throw e;
          const result = await auth.importUsers([
            {
              uid: user.id,
              email: user.email,
              emailVerified: !!user.email_confirmed_at,
              displayName: user.user_metadata?.full_name || undefined,
              photoURL: user.user_metadata?.avatar_url || undefined,
              disabled: false,
              providerData: [{ providerId: 'google.com', uid: googleUid, email: user.email }],
            },
          ]);
          if (result.failureCount) throw new Error('Firebase identity import failed');
        }
      }
      for (const [t, rows] of Object.entries(tables))
        for (let start = 0; start < rows.length; start += 200) {
          const batch = db.batch();
          for (const r of rows.slice(start, start + 200)) batch.set(db.collection(t).doc(r.id), r);
          await batch.commit();
        }
      await verify(db, tables);
      const after = await exportSource();
      if (digest(after.tables) !== digest(snapshot.tables))
        throw new Error('Source changed during import. Destination remains closed.');
      const sourceAdmins = snapshot.tables.user_roles.filter((r) => r.role === 'admin');
      if (sourceAdmins.length)
        await db
          .collection('_system')
          .doc('bootstrap')
          .set({ user_id: sourceAdmins[0].user_id, imported: true });
      await db
        .collection('_system')
        .doc('migration')
        .update({ status: 'complete', completedAt: new Date().toISOString() });
      console.log('Migration verified and complete. Source Supabase was not modified.');
    } else throw new Error('Use export, import <firebase-project-id>, or verify');
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
