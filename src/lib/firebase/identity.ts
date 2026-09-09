import { createHash } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { Store, atomic, newDoc, now, refId, audit, fail, type Doc } from './store';
import { Permissions } from './permissions';
import { persist } from './validation';
import type { Firestore } from 'firebase-admin/firestore';

export function profileId(uid: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) return uid;
  const h = createHash('sha256')
    .update('pp5/firebase/' + uid)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export async function seedSchool(s: Store, actor: string, school: string) {
  const p = new Permissions(s, actor);
  for (const [index, [min, max, grade]] of [
    [80, 100, 4],
    [75, 79.99, 3.5],
    [70, 74.99, 3],
    [65, 69.99, 2.5],
    [60, 64.99, 2],
    [55, 59.99, 1.5],
    [50, 54.99, 1],
    [0, 49.99, 0],
  ].entries())
    await persist(
      s,
      p,
      'grading_scales',
      {
        school_id: school,
        min_score: min,
        max_score: max,
        grade_value: grade,
        display_grade: String(grade),
        sort_order: index,
      },
      null,
      true,
    );
  for (const [i, name] of [
    'รักชาติ ศาสน์ กษัตริย์',
    'ซื่อสัตย์สุจริต',
    'มีวินัย',
    'ใฝ่เรียนรู้',
    'อยู่อย่างพอเพียง',
    'มุ่งมั่นในการทำงาน',
    'รักความเป็นไทย',
    'มีจิตสาธารณะ',
  ].entries())
    await persist(
      s,
      p,
      'desirable_characteristics',
      { school_id: school, code: String(i + 1), name, sort_order: i },
      null,
      true,
    );
  for (const [i, name] of ['การอ่าน', 'การคิดวิเคราะห์', 'การเขียน'].entries())
    await persist(
      s,
      p,
      'reading_assessment_categories',
      { school_id: school, name, sort_order: i },
      null,
      true,
    );
  for (const [i, name] of ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'].entries())
    await persist(s, p, 'grade_levels', { school_id: school, code: name, name, sort_order: i }, null, true);
  for (const [key, value] of Object.entries({
    minimum_attendance_percentage: 80,
    score_decimal_places: 2,
    teacher_edit_students: false,
    setup_completed: false,
  }))
    await persist(s, p, 'school_settings', { school_id: school, key, value }, null, true);
}
export async function registerIdentity(db: Firestore, token: DecodedIdToken, bootstrap: string[]) {
  if (token.firebase.sign_in_provider !== 'google.com' || !token.email_verified || !token.email)
    fail('ต้องเข้าสู่ระบบด้วยบัญชี Google ที่ยืนยันอีเมลแล้ว');
  const actor = profileId(token.uid),
    email = token.email.toLowerCase();
  return atomic(db, async (s) => {
    await s.lock('identity-registration');
    const migration = await s.get('_system', 'migration');
    if (migration && migration.status !== 'complete') fail('กำลังย้ายข้อมูล กรุณาลองอีกครั้งภายหลัง');
    const before = await s.get('profiles', actor),
      schools = (await s.list('schools')).sort(
        (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id),
      );
    const name = typeof token.name === 'string' ? token.name : email;
    const d: Doc = {
      ...newDoc({
        id: actor,
        full_name: name,
        email,
        avatar_url: token.picture || null,
        phone: null,
        active: true,
        requested_school_id: schools[0]?.id || null,
        last_login_at: now(),
      }),
      ...before,
      last_login_at: now(),
      email,
      full_name: name,
      avatar_url: token.picture || before?.avatar_url || null,
    };
    s.put('profiles', d);
    if (!d.active) return actor;
    const p = new Permissions(s, actor);
    const existingAdmins = await s.list('user_roles', { field: 'role', op: '==', value: 'admin' });
    const mark = await s.get('_system', 'bootstrap');
    if (bootstrap.includes(email) && !mark && !existingAdmins.length) {
      let school = schools[0];
      if (!school) {
        school = newDoc({
          name: 'โรงเรียนของฉัน',
          code: null,
          logo_url: null,
          address: null,
          phone: null,
          director_name: null,
          education_area: null,
        });
        school._school_id = school.id;
        s.put('schools', school);
      }
      s.put('profiles', { ...d, requested_school_id: school.id });
      for (const pending of await s.list('profiles', {
        field: 'requested_school_id',
        op: '==',
        value: null,
      })) {
        s.put('profiles', { ...pending, requested_school_id: school.id, updated_at: now() });
      }
      await persist(s, p, 'user_roles', { school_id: school.id, user_id: actor, role: 'admin' }, null, true);
      if (!schools.length) await seedSchool(s, actor, school.id);
      s.put('_system', { id: 'bootstrap', user_id: actor, created_at: now() });
      await audit(s, school.id, actor, 'profiles', before, d, 'bootstrap_admin');
    }
    for (const invitation of await s.list('teacher_invitations', {
      field: 'email',
      op: '==',
      value: email,
    })) {
      if (invitation.status !== 'pending') continue;
      if (String(invitation.expires_at) <= now()) {
        s.put('teacher_invitations', { ...invitation, status: 'expired', updated_at: now() });
        continue;
      }
      const roles = await s.list('user_roles', { field: 'user_id', op: '==', value: actor });
      if (!roles.some((r) => r.school_id === invitation.school_id && r.role === invitation.role))
        await persist(
          s,
          p,
          'user_roles',
          { user_id: actor, school_id: invitation.school_id, role: invitation.role },
          null,
          true,
        );
      await persist(
        s,
        p,
        'teacher_invitations',
        { ...invitation, status: 'accepted', accepted_by: actor },
        invitation,
        true,
      );
    }
    for (const role of await s.list('user_roles', { field: 'user_id', op: '==', value: actor }))
      await audit(s, refId(role, 'school_id'), actor, 'profiles', null, { id: actor }, 'login');
    return actor;
  });
}
