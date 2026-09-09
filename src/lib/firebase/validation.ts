import { z } from 'zod';
import schema from './schema.json';
import { type Doc, type Store, newDoc, now, fail, refId, audit } from './store';
import { Permissions } from './permissions';
import type { Json, TableName } from '@/types/database.types';
type Column = { type: string; nullable: boolean; default: unknown; hasDefault: boolean };
export function validateDocument(table: TableName, input: Record<string, unknown>, actor: string): Doc {
  const fields: Record<string, z.ZodType> = {};
  for (const [name, col] of Object.entries(schema[table]) as [string, Column][]) {
    let v: z.ZodType =
      col.type === 'integer'
        ? z.number().int()
        : col.type === 'numeric'
          ? z.number().finite()
          : col.type === 'boolean'
            ? z.boolean()
            : col.type === 'uuid'
              ? z.uuid()
              : col.type === 'date'
                ? z.iso.date()
                : col.type === 'timestamp with time zone'
                  ? z.iso.datetime({ offset: true })
                  : col.type === 'jsonb'
                    ? z.json()
                    : col.type === 'app_role'
                      ? z.enum(['admin', 'teacher'])
                      : col.type === 'result_workflow'
                        ? z.enum(['draft', 'submitted', 'approved', 'locked'])
                        : z.string().max(10000);
    if (col.nullable) v = v.nullable();
    const d =
      col.default === '$uuid'
        ? newDoc({}).id
        : col.default === '$now'
          ? now()
          : col.default === '$expiry'
            ? new Date(Date.now() + 14 * 86400000).toISOString()
            : col.default === '$actor'
              ? actor
              : col.default;
    if (col.hasDefault) v = v.default(d);
    else if (col.nullable) v = v.default(null);
    fields[name] = v;
  }
  return z.object(fields).parse(input) as Doc;
}
const unique: Partial<Record<TableName, string[][]>> = {
  schools: [['code']],
  user_roles: [['user_id', 'school_id', 'role']],
  academic_years: [['school_id', 'year']],
  terms: [['academic_year_id', 'term_number']],
  grade_levels: [['school_id', 'code']],
  classrooms: [['academic_year_id', 'grade_level_id', 'room_number']],
  subjects: [['school_id', 'subject_code']],
  teacher_assignments: [['teacher_id', 'classroom_id', 'subject_id', 'term_id']],
  students: [['school_id', 'student_code']],
  enrollments: [
    ['student_id', 'classroom_id'],
    ['classroom_id', 'student_number'],
  ],
  student_scores: [['score_item_id', 'enrollment_id']],
  final_results: [['teacher_assignment_id', 'enrollment_id']],
  attendance_sessions: [['teacher_assignment_id', 'attendance_date', 'period_number']],
  attendance_records: [['attendance_session_id', 'enrollment_id']],
  indicator_results: [['learning_indicator_id', 'enrollment_id']],
  desirable_characteristics: [['school_id', 'code']],
  characteristic_results: [['teacher_assignment_id', 'characteristic_id', 'enrollment_id']],
  reading_assessment_results: [['teacher_assignment_id', 'category_id', 'enrollment_id']],
  school_settings: [['school_id', 'key']],
};
const foreign: Record<string, string> = {
  school_id: 'schools',
  requested_school_id: 'schools',
  user_id: 'profiles',
  teacher_id: 'profiles',
  homeroom_teacher_id: 'profiles',
  academic_year_id: 'academic_years',
  grade_level_id: 'grade_levels',
  classroom_id: 'classrooms',
  subject_id: 'subjects',
  term_id: 'terms',
  student_id: 'students',
  teacher_assignment_id: 'teacher_assignments',
  score_category_id: 'score_categories',
  score_item_id: 'score_items',
  enrollment_id: 'enrollments',
  attendance_session_id: 'attendance_sessions',
  learning_indicator_id: 'learning_indicators',
  characteristic_id: 'desirable_characteristics',
  category_id: 'reading_assessment_categories',
  invited_by: 'profiles',
  accepted_by: 'profiles',
  entered_by: 'profiles',
  updated_by: 'profiles',
  calculated_by: 'profiles',
  created_by: 'profiles',
  actor_user_id: 'profiles',
};
export async function persist(
  s: Store,
  p: Permissions,
  table: TableName,
  input: Record<string, unknown>,
  before: Doc | null = null,
  internal = false,
) {
  const d = validateDocument(table, { ...input, updated_at: now() }, p.actor);
  const scope = await p.scope(table, d);
  if (!internal) {
    if (
      [
        'profiles',
        'user_roles',
        'audit_logs',
        'final_results',
        'student_scores',
        'attendance_records',
        'attendance_sessions',
        'indicator_results',
        'characteristic_results',
        'reading_assessment_results',
      ].includes(table)
    )
      fail();
    if (['score_categories', 'score_items', 'learning_indicators'].includes(table)) {
      if (!scope.assignment) fail();
      await p.assertAssignment(scope.assignment, true);
    } else await p.assertAdmin(scope.school);
    if (before) {
      const old = await p.scope(table, before);
      if (old.school !== scope.school || old.assignment !== scope.assignment) fail();
      for (const k of Object.keys(d))
        if (
          k.endsWith('_id') &&
          !['homeroom_teacher_id', ...(table === 'teacher_assignments' ? ['teacher_id'] : [])].includes(k) &&
          d[k] !== before[k]
        )
          fail('กรุณาสร้างรายการใหม่หรือใช้คำสั่งย้ายข้อมูล');
    }
    if (
      table === 'teacher_assignments' &&
      (d.workflow !== 'draft' || (before && before.workflow !== 'draft'))
    )
      fail('ต้องปลดล็อกผลก่อนแก้ไขการมอบหมาย');
  }
  if (scope.school) await s.lock(scope.school);
  for (const [field, target] of Object.entries(foreign))
    if (d[field]) {
      const parent = await s.require(target, refId(d, field));
      if (target === 'profiles') continue;
      const other = await p.scope(target, parent);
      if (scope.school && other.school && scope.school !== other.school)
        fail('ข้อมูลอ้างอิงอยู่คนละโรงเรียน', '23503');
    }
  const all =
    scope.school && table !== 'schools'
      ? await s.list(table, { field: '_school_id', op: '==', value: scope.school })
      : await s.list(table);
  for (const keys of unique[table] || [])
    if (
      keys.every((k) => d[k] !== null && d[k] !== undefined) &&
      all.some((r) => r.id !== d.id && keys.every((k) => r[k] === d[k]))
    )
      fail('ข้อมูลซ้ำ กรุณาตรวจสอบรหัสหรือเลขที่', '23505');
  const duplicates = (keys: string[], condition: (r: Doc) => boolean) =>
    all.some((r) => r.id !== d.id && condition(r) && keys.every((k) => r[k] === d[k]));
  if (table === 'academic_years' && d.is_active && duplicates(['school_id'], (r) => r.is_active === true))
    fail('มีปีการศึกษาที่เปิดใช้งานแล้ว');
  if (table === 'terms' && d.is_active && duplicates(['academic_year_id'], (r) => r.is_active === true))
    fail('มีภาคเรียนที่เปิดใช้งานแล้ว');
  if (table === 'teacher_invitations') {
    z.email().parse(d.email);
    if (d.email !== String(d.email).trim().toLowerCase()) fail('อีเมลไม่ถูกต้อง');
    z.enum(['pending', 'accepted', 'cancelled', 'expired']).parse(d.status);
    if (d.status === 'pending' && duplicates(['school_id', 'email'], (r) => r.status === 'pending'))
      fail('มีคำเชิญสำหรับอีเมลนี้แล้ว');
    if (!internal && (d.invited_by !== p.actor || (d.role === 'admin' && !(await p.admin(scope.school)))))
      fail();
  }
  for (const f of ['name', 'title', 'first_name', 'last_name', 'student_code', 'subject_code', 'code'])
    if (typeof d[f] === 'string' && f !== 'code' && !String(d[f]).trim()) fail('กรุณากรอกข้อมูลให้ครบ');
  for (const f of [
    'hours',
    'hours_per_term',
    'max_score',
    'weight',
    'student_number',
    'term_number',
    'period_number',
  ])
    if (d[f] !== undefined && d[f] !== null && !(Number(d[f]) > 0)) fail('ค่าตัวเลขต้องมากกว่า 0');
  if (d.level !== undefined) z.number().int().min(0).max(3).parse(d.level);
  if (table === 'academic_years') z.number().int().min(2400).max(3000).parse(d.year);
  if (table === 'academic_years' && d.archived_at && d.is_active)
    fail('ปีที่เก็บเข้าคลังแล้วไม่สามารถเป็นปีปัจจุบัน');
  if (
    table === 'enrollments' &&
    (await s.list('teacher_assignments', { field: 'classroom_id', op: '==', value: d.classroom_id })).some(
      (a) => a.workflow !== 'draft',
    )
  )
    fail('กรุณาปลดล็อกผลการเรียนก่อนเปลี่ยนรายชื่อ');
  if (
    before &&
    ['desirable_characteristics', 'reading_assessment_categories'].includes(table) &&
    (await s.list('teacher_assignments', { field: 'school_id', op: '==', value: scope.school })).some(
      (a) => a.workflow !== 'draft',
    )
  )
    fail('กรุณาปลดล็อกผลก่อนเปลี่ยนหัวข้อประเมิน');
  if (table === 'terms' && String(d.end_date) < String(d.start_date))
    fail('วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มต้น');
  if (table === 'subjects' && Number(d.credits) < 0) fail('หน่วยกิตไม่ถูกต้อง');
  if (table === 'attendance_sessions') z.number().positive().max(12).parse(d.hours);
  if (table === 'attendance_records') z.enum(['present', 'late', 'leave', 'sick', 'absent']).parse(d.status);
  if (table === 'indicator_results') z.enum(['excellent', 'good', 'pass', 'improve']).parse(d.result);
  if (table === 'enrollments') {
    z.enum(['active', 'moved', 'withdrawn', 'graduated']).parse(d.status);
    const c = await s.require('classrooms', refId(d, 'classroom_id'));
    if (c.academic_year_id !== d.academic_year_id) fail('ปีการศึกษาของห้องไม่ตรงกัน');
    if (d.status === 'active' && duplicates(['student_id', 'academic_year_id'], (r) => r.status === 'active'))
      fail('นักเรียนมีห้องเรียนในปีนี้แล้ว');
    const y = await s.require('academic_years', refId(d, 'academic_year_id'));
    if (y.archived_at) fail('ปีการศึกษาถูกเก็บถาวรแล้ว');
  }
  if (table === 'classrooms' || table === 'teacher_assignments') {
    const teacher = refId(d, table === 'classrooms' ? 'homeroom_teacher_id' : 'teacher_id');
    if (
      teacher &&
      !(await s.list('user_roles', { field: 'user_id', op: '==', value: teacher })).some(
        (r) => r.school_id === scope.school,
      )
    )
      fail('ครูไม่ได้รับสิทธิ์ในโรงเรียนนี้');
    if (teacher && !(await s.require('profiles', teacher)).active) fail('บัญชีครูถูกปิดใช้งาน');
    if (table === 'teacher_assignments') {
      const c = await s.require('classrooms', refId(d, 'classroom_id')),
        t = await s.require('terms', refId(d, 'term_id'));
      if (c.academic_year_id !== t.academic_year_id || d.score_total !== 100)
        fail('ปีการศึกษาหรือคะแนนเต็มไม่ถูกต้อง');
    }
  }
  if (scope.assignment && d.enrollment_id) {
    const a = await s.require('teacher_assignments', scope.assignment),
      e = await s.require('enrollments', refId(d, 'enrollment_id'));
    if (a.classroom_id !== e.classroom_id) fail('นักเรียนไม่อยู่ในห้องเรียนนี้');
  }
  if (table === 'score_categories') {
    z.enum(['before_midterm', 'midterm', 'after_midterm', 'final', 'custom']).parse(d.category_type);
    const cats = all.filter((r) => r.id !== d.id && r.teacher_assignment_id === d.teacher_assignment_id);
    if (Number(d.max_score) > 100 || Number(d.weight) + cats.reduce((n, r) => n + Number(r.weight), 0) > 100)
      fail('น้ำหนักหมวดคะแนนรวมต้องไม่เกิน 100');
    const items = await s.list('score_items', { field: 'score_category_id', op: '==', value: d.id });
    if (items.filter((r) => r.active).reduce((n, r) => n + Number(r.max_score), 0) > Number(d.max_score))
      fail('คะแนนเต็มน้อยกว่าคะแนนเต็มงานย่อย');
  }
  if (table === 'score_items') {
    const c = await s.require('score_categories', refId(d, 'score_category_id'));
    if (
      d.active &&
      all
        .filter((r) => r.id !== d.id && r.score_category_id === d.score_category_id && r.active)
        .reduce((n, r) => n + Number(r.max_score), Number(d.max_score)) > Number(c.max_score)
    )
      fail('คะแนนเต็มงานรวมเกินคะแนนเต็มหมวด');
    if (
      (await s.list('student_scores', { field: 'score_item_id', op: '==', value: d.id })).some(
        (r) => Number(r.score) > Number(d.max_score),
      )
    )
      fail('คะแนนเต็มน้อยกว่าคะแนนที่บันทึกแล้ว');
  }
  if (table === 'student_scores') {
    const i = await s.require('score_items', refId(d, 'score_item_id'));
    if (!i.active || Number(d.score) < 0 || Number(d.score) > Number(i.max_score))
      fail(`คะแนนต้องอยู่ระหว่าง 0 ถึง ${i.max_score}`);
  }
  if (table === 'final_results') {
    z.enum(['normal', 'ร', 'มส', 'ผ', 'มผ']).parse(d.result_status);
    z.number().min(0).max(100).parse(d.total_score);
  }
  if (table === 'grading_scales') {
    z.number().min(0).max(4).parse(d.grade_value);
    if (
      Number(d.min_score) < 0 ||
      Number(d.max_score) > 100 ||
      Number(d.min_score) > Number(d.max_score) ||
      all.some(
        (r) =>
          r.id !== d.id &&
          Number(r.min_score) <= Number(d.max_score) &&
          Number(r.max_score) >= Number(d.min_score),
      )
    )
      fail('ช่วงเกณฑ์เกรดทับซ้อนหรือไม่ถูกต้อง');
  }
  if (table === 'school_settings') {
    if (d.key === 'minimum_attendance_percentage') z.number().min(0).max(100).parse(d.value);
    if (d.key === 'score_decimal_places') z.number().int().min(0).max(2).parse(d.value);
    if (['teacher_edit_students', 'setup_completed'].includes(String(d.key))) z.boolean().parse(d.value);
  }
  d._school_id = scope.school;
  if (scope.assignment) d._assignment_id = scope.assignment;
  if (scope.classroom) d._classroom_id = scope.classroom;
  s.put(table, d);
  if (scope.school && table !== 'audit_logs') await audit(s, scope.school, p.actor, table, before, d);
  return d;
}
export async function upsert(
  s: Store,
  p: Permissions,
  table: TableName,
  keys: Record<string, Json>,
  values: Record<string, unknown>,
) {
  const [field, value] = Object.entries(keys)[0];
  const before =
    (await s.list(table, { field, op: '==', value })).find((r) =>
      Object.entries(keys).every(([k, v]) => r[k] === v),
    ) || null;
  return persist(s, p, table, { ...before, ...keys, ...values }, before, true);
}
