import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { Repository } from '@/lib/firebase/repository';
import { seedFixture, fixtureIds } from '../support/firebase-fixture';
import { registerIdentity, profileId } from '@/lib/firebase/identity';
import type { DecodedIdToken } from 'firebase-admin/auth';

const projectId = 'demo-pp5';
const app = initializeApp({ projectId }, 'firestore-tests');
const db = getFirestore(app);
let f: Awaited<ReturnType<typeof seedFixture>>, rules: RulesTestEnvironment;
const teacher = new Repository(db, fixtureIds.teacher),
  admin = new Repository(db, fixtureIds.admin),
  pending = new Repository(db, fixtureIds.pending);
beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Tests require Firestore emulator');
  rules = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  });
  await rules.clearFirestore();
  f = await seedFixture(db);
});
afterAll(async () => {
  await rules?.cleanup();
  await deleteApp(app);
});
describe('Firestore authorization and atomic business operations', () => {
  it('school template exports require a school admin and create an audit record', async () => {
    expect(
      (await admin.rpc('log_export', { p_school: f.school, p_assignment: null, p_kind: 'template' })).error,
    ).toBeNull();
    expect(
      (await teacher.rpc('log_export', { p_school: f.school, p_assignment: null, p_kind: 'template' })).error,
    ).not.toBeNull();
    expect(
      (await admin.rpc('log_export', { p_school: f.schoolB, p_assignment: null, p_kind: 'template' })).error,
    ).not.toBeNull();
    const logs = await admin.from('audit_logs').select('action,metadata').eq('action', 'export');
    expect(logs.data?.some((entry) => JSON.stringify(entry.metadata).includes('template'))).toBe(true);
  });
  it('teacher reads own assignment and classroom', async () => {
    expect((await teacher.from('teacher_assignments').select('id').eq('id', f.assignment)).data).toHaveLength(
      1,
    );
    expect((await teacher.from('classrooms').select('id').eq('id', f.classroom)).data).toHaveLength(1);
  });
  it('teacher cannot read another classroom or assignment', async () => {
    expect((await teacher.from('classrooms').select('id').eq('id', f.classroomB)).data).toHaveLength(0);
    expect(
      (await teacher.from('teacher_assignments').select('id').eq('id', f.assignmentB)).data,
    ).toHaveLength(0);
  });
  it('admin cannot read or mutate another school', async () => {
    expect((await admin.from('schools').select('id').eq('id', f.school)).data).toHaveLength(1);
    expect((await admin.from('schools').select('id').eq('id', f.schoolB)).data).toHaveLength(0);
    expect((await admin.from('schools').update({ name: 'injected' }).eq('id', f.schoolB)).error).toBeTruthy();
  });
  it('pending and anonymous actors cannot read students or scores', async () => {
    for (const actor of [pending, new Repository(db, '')])
      for (const table of ['students', 'student_scores'] as const)
        expect((await actor.from(table).select('id')).data).toHaveLength(0);
  });
  it('browser access is denied even with admin claims', async () => {
    for (const client of [
      rules.unauthenticatedContext(),
      rules.authenticatedContext(fixtureIds.admin, { role: 'admin' }),
    ]) {
      const sdk = client.firestore();
      await assertFails(getDoc(doc(sdk, 'students', f.enrollments[0].student_id as string)));
      await assertFails(getDoc(doc(sdk, 'student_scores', 'unknown')));
      await assertFails(setDoc(doc(sdk, 'user_roles', 'injected'), { role: 'admin' }));
    }
  });
  it('teacher cannot self promote or inject cross-school references', async () => {
    expect(
      (
        await teacher.rpc('manage_member', {
          p_school: f.school,
          p_user: fixtureIds.teacher,
          p_role: 'admin',
          p_active: true,
        })
      ).error,
    ).toBeTruthy();
    expect(
      (
        await admin.from('classrooms').insert({
          school_id: f.schoolB,
          academic_year_id: f.year,
          grade_level_id: '11111111-1111-4111-a111-111111111111',
          name: 'X',
          room_number: 'X',
        })
      ).error,
    ).toBeTruthy();
  });
  it('creates dynamic categories and stores zero scores', async () => {
    expect((await teacher.rpc('default_score_categories', { p_assignment: f.assignment })).error).toBeNull();
    const cats = (
      await teacher.from('score_categories').select('*').eq('teacher_assignment_id', f.assignment)
    ).data!;
    for (const c of cats)
      expect(
        (
          await teacher
            .from('score_items')
            .insert({ score_category_id: c.id, title: c.name, max_score: c.max_score })
        ).error,
      ).toBeNull();
    const item = (await teacher.from('score_items').select('*')).data![0];
    expect(
      (
        await teacher.rpc('bulk_save_scores', {
          p_assignment: f.assignment,
          p_item: item.id,
          p_rows: [{ enrollment_id: f.enrollments[0].id, score: 0 }],
        })
      ).error,
    ).toBeNull();
    expect(
      (await teacher.from('student_scores').select('*').eq('score_item_id', item.id)).data![0].score,
    ).toBe(0);
  });
  it('rejects overmaximum and rolls back the entire score matrix', async () => {
    const items = (await teacher.from('score_items').select('*')).data!;
    const result = await teacher.rpc('bulk_score_matrix', {
      p_assignment: f.assignment,
      p_items: [
        { item_id: items[0].id, rows: [{ enrollment_id: f.enrollments[0].id, score: 5 }] },
        { item_id: items[1].id, rows: [{ enrollment_id: f.enrollments[0].id, score: 999 }] },
      ],
    });
    expect(result.error).toBeTruthy();
    expect(
      (await teacher.from('student_scores').select('*').eq('score_item_id', items[0].id)).data![0].score,
    ).toBe(0);
    expect(
      (
        await teacher.rpc('bulk_save_scores', {
          p_assignment: f.assignmentB,
          p_item: items[0].id,
          p_rows: [],
        })
      ).error,
    ).toBeTruthy();
  });
  it('rolls back an invalid attendance session and records valid hours', async () => {
    expect(
      (
        await teacher.rpc('bulk_attendance', {
          p_assignment: f.assignment,
          p_date: '2026-09-08',
          p_period: 1,
          p_hours: 1,
          p_topic: '',
          p_rows: [{ enrollment_id: '99999999-9999-4999-a999-999999999999', status: 'present' }],
        })
      ).error,
    ).toBeTruthy();
    expect((await teacher.from('attendance_sessions').select('id')).data).toHaveLength(0);
    expect(
      (
        await teacher.rpc('bulk_attendance', {
          p_assignment: f.assignment,
          p_date: '2026-09-08',
          p_period: 1,
          p_hours: 1,
          p_topic: '',
          p_rows: f.enrollments.map((e) => ({ enrollment_id: e.id, status: 'present' })),
        })
      ).error,
    ).toBeNull();
    expect((await teacher.from('attendance_records').select('id')).data).toHaveLength(10);
  });
  it('rejects duplicate imports without partial students', async () => {
    const count = (await admin.from('students').select('id')).data!.length;
    const result = await admin.rpc('import_students', {
      p_classroom: f.classroom,
      p_rows: [
        {
          student_code: 'IMPORT1',
          student_number: 11,
          prefix: '',
          first_name: 'Test',
          last_name: 'Import',
          nickname: '',
        },
        {
          student_code: 'IMPORT1',
          student_number: 12,
          prefix: '',
          first_name: 'Test',
          last_name: 'Import',
          nickname: '',
        },
      ],
    });
    expect(result.error).toBeTruthy();
    expect((await admin.from('students').select('id')).data).toHaveLength(count);
  });
  it('calculates 100 and grade 4 on server and rejects client final writes', async () => {
    const items = (await teacher.from('score_items').select('*')).data!;
    expect(
      (
        await teacher.rpc('bulk_score_matrix', {
          p_assignment: f.assignment,
          p_items: items.map((i) => ({
            item_id: i.id,
            rows: f.enrollments.map((e) => ({ enrollment_id: e.id, score: i.max_score })),
          })),
        })
      ).error,
    ).toBeNull();
    expect((await teacher.rpc('calculate_final_results', { p_assignment: f.assignment })).error).toBeNull();
    const finals = (await teacher.from('final_results').select('*')).data!;
    expect(finals).toHaveLength(10);
    expect(finals.every((r) => r.total_score === 100 && r.grade === '4')).toBe(true);
    expect(
      (await teacher.from('final_results').update({ total_score: 0 }).eq('id', finals[0].id)).error,
    ).toBeTruthy();
  });
  it('requires assessments then enforces submit approve lock and audited unlock', async () => {
    expect(
      (
        await teacher.rpc('transition_results', {
          p_assignment: f.assignment,
          p_state: 'submitted',
          p_reason: '',
        })
      ).error,
    ).toBeTruthy();
    for (const [kind, table] of [
      ['reading', 'reading_assessment_categories'],
      ['characteristics', 'desirable_characteristics'],
    ] as const)
      for (const c of (await teacher.from(table).select('*')).data!)
        expect(
          (
            await teacher.rpc('bulk_assessments', {
              p_assignment: f.assignment,
              p_kind: kind,
              p_category: c.id,
              p_rows: f.enrollments.map((e) => ({ enrollment_id: e.id, level: 3 })),
            })
          ).error,
        ).toBeNull();
    expect(
      (
        await teacher.rpc('transition_results', {
          p_assignment: f.assignment,
          p_state: 'submitted',
          p_reason: '',
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await teacher.rpc('transition_results', {
          p_assignment: f.assignment,
          p_state: 'approved',
          p_reason: '',
        })
      ).error,
    ).toBeTruthy();
    for (const state of ['approved', 'locked'] as const)
      expect(
        (await admin.rpc('transition_results', { p_assignment: f.assignment, p_state: state, p_reason: '' }))
          .error,
      ).toBeNull();
    expect((await teacher.rpc('calculate_final_results', { p_assignment: f.assignment })).error).toBeTruthy();
    expect(
      (await admin.rpc('transition_results', { p_assignment: f.assignment, p_state: 'draft', p_reason: '' }))
        .error,
    ).toBeTruthy();
    expect(
      (
        await admin.rpc('transition_results', {
          p_assignment: f.assignment,
          p_state: 'draft',
          p_reason: 'Correction requested',
        })
      ).error,
    ).toBeNull();
    expect(
      (await admin.from('audit_logs').select('*').eq('entity_id', f.assignment)).data!.some((r) =>
        JSON.stringify(r.after_data).includes('Correction requested'),
      ),
    ).toBe(true);
  });
  it('hides national identifiers and blocks disabled users immediately', async () => {
    expect(
      (await admin.from('students').select('id,national_student_id')).data!.every(
        (r) => !('national_student_id' in r),
      ),
    ).toBe(true);
    expect(
      (
        await admin.rpc('manage_member', {
          p_school: f.school,
          p_user: fixtureIds.teacher,
          p_role: 'teacher',
          p_active: false,
        })
      ).error,
    ).toBeNull();
    expect((await new Repository(db, fixtureIds.teacher).from('students').select('id')).data).toHaveLength(0);
    expect((await teacher.rpc('calculate_final_results', { p_assignment: f.assignment })).error).toBeTruthy();
  });
  it('Firebase identities require verified Google; login does not auto-grant a role', async () => {
    const token = {
      uid: 'new-google-user',
      email: 'new@example.test',
      email_verified: true,
      name: 'New user',
      firebase: { sign_in_provider: 'google.com' },
    } as unknown as DecodedIdToken;
    await expect(registerIdentity(db, { ...token, email_verified: false }, [])).rejects.toThrow();
    await expect(
      registerIdentity(db, { ...token, firebase: { ...token.firebase, sign_in_provider: 'password' } }, []),
    ).rejects.toThrow();
    await registerIdentity(db, token, ['new@example.test']);
    expect((await db.collection('user_roles').where('user_id', '==', profileId(token.uid)).get()).empty).toBe(
      true,
    );
  });
});
