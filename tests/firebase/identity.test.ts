import { beforeAll, afterAll, it, expect } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { registerIdentity, profileId } from '@/lib/firebase/identity';
import { Repository } from '@/lib/firebase/repository';
const projectId = 'demo-pp5-bootstrap',
  app = initializeApp({ projectId }, 'bootstrap-tests'),
  db = getFirestore(app);
const token = (uid: string, email: string) =>
  ({
    uid,
    email,
    email_verified: true,
    name: uid,
    firebase: { sign_in_provider: 'google.com' },
  }) as unknown as DecodedIdToken;
let school: string;
const adminToken = token('first-admin', 'first@example.test');
const admin = new Repository(db, profileId(adminToken.uid));
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw new Error('Requires emulator');
  const r = await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!r.ok) throw new Error('Emulator reset failed');
});
afterAll(async () => {
  await deleteApp(app);
});
it('bootstraps first admin, defaults and audit atomically', async () => {
  await registerIdentity(db, adminToken, ['first@example.test']);
  const roles = (await admin.from('user_roles').select('*')).data!;
  expect(roles).toHaveLength(1);
  expect(roles[0].role).toBe('admin');
  school = roles[0].school_id;
  expect((await admin.from('grading_scales').select('id')).data).toHaveLength(8);
  expect((await admin.from('audit_logs').select('*')).data!.some((d) => d.action === 'bootstrap_admin')).toBe(
    true,
  );
});
it('cannot bootstrap a second admin with an allow-listed email', async () => {
  const t = token('second-admin', 'second@example.test');
  await registerIdentity(db, t, ['second@example.test']);
  expect((await new Repository(db, profileId(t.uid)).from('user_roles').select('id')).data).toHaveLength(0);
});
it('routes new teacher requests to the first-created school regardless of document ID order', async () => {
  const original = (await db.collection('schools').doc(school).get()).data()!;
  const laterSchool = '00000000-0000-4000-8000-000000000001';
  await db
    .collection('schools')
    .doc(laterSchool)
    .set({
      ...original,
      id: laterSchool,
      _school_id: laterSchool,
      name: 'Later school',
      created_at: '2099-01-01T00:00:00.000Z',
    });
  const t = token('self-signup-teacher', 'signup@example.test');
  await registerIdentity(db, t, []);
  expect((await db.collection('profiles').doc(profileId(t.uid)).get()).data()?.requested_school_id).toBe(
    school,
  );
  expect((await new Repository(db, profileId(t.uid)).from('user_roles').select('id')).data).toHaveLength(0);
});
it('accepts an unexpired invitation by verified Google email', async () => {
  expect(
    (
      await admin.from('teacher_invitations').insert({
        school_id: school,
        email: 'teacher@example.test',
        role: 'teacher',
        invited_by: profileId(adminToken.uid),
      })
    ).error,
  ).toBeNull();
  const t = token('invited-teacher', 'teacher@example.test');
  await registerIdentity(db, t, []);
  expect((await new Repository(db, profileId(t.uid)).from('user_roles').select('*')).data![0].role).toBe(
    'teacher',
  );
  expect((await admin.from('teacher_invitations').select('*')).data![0].status).toBe('accepted');
});
it('expired invitations grant no role', async () => {
  expect(
    (
      await admin.from('teacher_invitations').insert({
        school_id: school,
        email: 'expired@example.test',
        role: 'admin',
        invited_by: profileId(adminToken.uid),
        expires_at: '2020-01-01T00:00:00Z',
      })
    ).error,
  ).toBeNull();
  const t = token('expired-teacher', 'expired@example.test');
  await registerIdentity(db, t, []);
  expect((await new Repository(db, profileId(t.uid)).from('user_roles').select('id')).data).toHaveLength(0);
});
it('audit date filters compare Bangkok dates as instants', async () => {
  const id = crypto.randomUUID();
  await db
    .collection('audit_logs')
    .doc(id)
    .set({
      id,
      school_id: school,
      _school_id: school,
      action: 'timezone_fixture',
      created_at: '2026-09-07T18:00:00.000Z',
    });
  const request = new Repository(db, profileId(adminToken.uid));
  const today = await request
    .from('audit_logs')
    .select('id')
    .eq('action', 'timezone_fixture')
    .gte('created_at', '2026-09-08T00:00:00+07:00')
    .lt('created_at', '2026-09-09T00:00:00+07:00');
  expect(today.data).toHaveLength(1);
  const yesterday = await request
    .from('audit_logs')
    .select('id')
    .eq('action', 'timezone_fixture')
    .gte('created_at', '2026-09-07T00:00:00+07:00')
    .lt('created_at', '2026-09-08T00:00:00+07:00');
  expect(yesterday.data).toHaveLength(0);
});
