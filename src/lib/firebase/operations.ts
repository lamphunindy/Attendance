import { z } from 'zod';
import { type Store, type Doc, refId, fail, audit, now } from './store';
import { Permissions } from './permissions';
import { persist, upsert } from './validation';
import { studentImportSchema } from '@/lib/validations';
import type { Json, TableName } from '@/types/database.types';

const id = z.uuid();
const rows = z
  .array(
    z.object({
      enrollment_id: id,
      score: z.number().finite().min(0).nullable().optional(),
      note: z.string().max(2000).optional(),
      status: z.enum(['present', 'late', 'leave', 'sick', 'absent']).optional(),
      result: z.enum(['excellent', 'good', 'pass', 'improve']).optional(),
      level: z.number().int().min(0).max(3).optional(),
    }),
  )
  .max(500);
async function roster(s: Store, a: Doc) {
  return (await s.list('enrollments', { field: 'classroom_id', op: '==', value: a.classroom_id })).filter(
    (e) => e.status === 'active',
  );
}
async function scoreData(s: Store, a: Doc) {
  const categories = await s.list('score_categories', {
    field: 'teacher_assignment_id',
    op: '==',
    value: a.id,
  });
  const items: Doc[] = [];
  for (const c of categories)
    items.push(
      ...(await s.list('score_items', { field: 'score_category_id', op: '==', value: c.id })).filter(
        (i) => i.active,
      ),
    );
  const scores: Doc[] = [];
  for (const i of items)
    scores.push(...(await s.list('student_scores', { field: 'score_item_id', op: '==', value: i.id })));
  return { categories, items, scores };
}
async function calculate(s: Store, p: Permissions, a: Doc) {
  await p.assertAssignment(a.id, true);
  const { categories, items, scores } = await scoreData(s, a);
  if (Math.abs(categories.reduce((n, c) => n + Number(c.weight), 0) - 100) > 0.00001)
    fail('น้ำหนักหมวดคะแนนรวมต้องเท่ากับ 100');
  const scales = await s.list('grading_scales', { field: 'school_id', op: '==', value: a.school_id });
  for (const e of await roster(s, a)) {
    const total =
      Math.round(
        categories.reduce(
          (sum, c) =>
            sum +
            (Number(c.weight) *
              scores
                .filter(
                  (v) =>
                    v.enrollment_id === e.id &&
                    items.some((i) => i.id === v.score_item_id && i.score_category_id === c.id),
                )
                .reduce((n, v) => n + Number(v.score), 0)) /
              Number(c.max_score),
          0,
        ) * 100,
      ) / 100;
    const matches = scales.filter((g) => total >= Number(g.min_score) && total <= Number(g.max_score));
    if (matches.length !== 1) fail('ไม่พบเกณฑ์เกรดที่ตรงกับคะแนน หรือมีเกณฑ์ซ้อนกัน');
    await upsert(
      s,
      p,
      'final_results',
      { teacher_assignment_id: a.id, enrollment_id: e.id },
      { total_score: total, grade: matches[0].display_grade, calculated_by: p.actor, calculated_at: now() },
    );
  }
}
async function bulkScores(s: Store, p: Permissions, a: Doc, itemId: string, input: unknown) {
  const item = await s.require('score_items', id.parse(itemId));
  const c = await s.require('score_categories', refId(item, 'score_category_id'));
  if (c.teacher_assignment_id !== a.id || !item.active) fail('ไม่พบงานในรายวิชานี้');
  for (const r of rows.parse(input)) {
    const e = await s.require('enrollments', r.enrollment_id);
    if (e.classroom_id !== a.classroom_id) fail('นักเรียนไม่อยู่ในห้องนี้');
    if (r.score === undefined) fail('กรุณาระบุคะแนน');
    if (r.score === null) {
      const prev = (await s.list('student_scores', { field: 'score_item_id', op: '==', value: itemId })).find(
        (d) => d.enrollment_id === r.enrollment_id,
      );
      if (prev) {
        s.remove('student_scores', prev.id);
        await audit(s, refId(a, 'school_id'), p.actor, 'student_scores', prev, null, 'clear_score');
      }
    } else
      await upsert(
        s,
        p,
        'student_scores',
        { score_item_id: itemId, enrollment_id: r.enrollment_id },
        { score: r.score, note: r.note || null, entered_by: p.actor },
      );
  }
}
export async function operation(
  s: Store,
  actor: string,
  name: string,
  input: Record<string, unknown>,
): Promise<Json | undefined> {
  const p = new Permissions(s, actor);
  if (!(await s.get('profiles', actor))?.active) fail();
  if (name === 'manage_member') {
    const school = id.parse(input.p_school),
      uid = id.parse(input.p_user),
      role = z.enum(['admin', 'teacher']).parse(input.p_role),
      active = z.boolean().parse(input.p_active);
    await p.assertAdmin(school);
    await s.lock(school);
    const profile = await s.require('profiles', uid),
      rs = await s.list('user_roles', { field: 'user_id', op: '==', value: uid });
    if (profile.requested_school_id !== school && !rs.some((r) => r.school_id === school)) fail();
    if (uid === actor && (!active || role !== 'admin')) fail('ไม่สามารถลดสิทธิ์หรือปิดบัญชีตนเอง');
    if (!active && rs.some((r) => r.school_id !== school))
      fail('บัญชีนี้ใช้งานหลายโรงเรียน กรุณาจัดการสิทธิ์แยกโรงเรียน');
    for (const r of rs)
      if (r.school_id === school && r.role !== role) {
        s.remove('user_roles', r.id);
        await audit(s, school, actor, 'user_roles', r, null, 'remove_role');
      }
    await persist(s, p, 'profiles', { ...profile, active }, profile, true);
    await upsert(s, p, 'user_roles', { user_id: uid, school_id: school, role }, {});
    await audit(s, school, actor, 'profiles', profile, { ...profile, active }, 'manage_member', { role });
    return;
  }
  if (name === 'import_students' || name === 'move_student') {
    const c = await s.require('classrooms', id.parse(input.p_classroom));
    await p.assertAdmin(refId(c, 'school_id'));
    await s.lock(refId(c, 'school_id'));
    if (name === 'import_students') {
      const batch = z.array(studentImportSchema).min(1).max(500).parse(input.p_rows);
      let n = 0;
      for (const r of batch) {
        n++;
        try {
          const student = await persist(
            s,
            p,
            'students',
            {
              school_id: c.school_id,
              student_code: r.student_code,
              prefix: r.prefix,
              first_name: r.first_name,
              last_name: r.last_name,
              nickname: r.nickname,
            },
            null,
            true,
          );
          await persist(
            s,
            p,
            'enrollments',
            {
              student_id: student.id,
              classroom_id: c.id,
              academic_year_id: c.academic_year_id,
              student_number: r.student_number,
            },
            null,
            true,
          );
        } catch (e) {
          fail(`แถว ${n}: ${e instanceof Error ? e.message : 'ข้อมูลไม่ถูกต้อง'}`, 'P0001');
        }
      }
      return n;
    }
    const old = await s.require('enrollments', id.parse(input.p_enrollment)),
      oldScope = await p.scope('enrollments', old);
    if (
      oldScope.school !== c.school_id ||
      old.classroom_id === c.id ||
      old.academic_year_id !== c.academic_year_id
    )
      fail('ห้องเรียนปลายทางหรือปีการศึกษาไม่ถูกต้อง');
    await persist(s, p, 'enrollments', { ...old, status: 'moved' }, old, true);
    await persist(
      s,
      p,
      'enrollments',
      {
        student_id: old.student_id,
        classroom_id: c.id,
        academic_year_id: c.academic_year_id,
        student_number: z.number().int().positive().parse(input.p_number),
      },
      null,
      true,
    );
    return;
  }
  if (name === 'update_student_basics') {
    const d = await s.require('students', id.parse(input.p_student));
    const school = refId(d, 'school_id');
    if (!(await p.admin(school))) {
      if (
        !(await p.canRead('students', d)) ||
        (await s.list('school_settings', { field: 'school_id', op: '==', value: school })).find(
          (v) => v.key === 'teacher_edit_students',
        )?.value !== true
      )
        fail();
    }
    await persist(
      s,
      p,
      'students',
      {
        ...d,
        prefix: input.p_prefix,
        first_name: input.p_first,
        last_name: input.p_last,
        nickname: input.p_nickname,
      },
      d,
      true,
    );
    return;
  }
  if (name === 'log_export' && input.p_assignment == null) {
    const school = id.parse(input.p_school);
    await p.assertAdmin(school);
    await s.lock(school);
    const schoolData = await s.require('schools', school);
    await audit(s, school, actor, 'schools', null, schoolData, 'export', {
      kind: z.string().max(100).parse(input.p_kind),
    });
    return;
  }
  const assignmentId = id.parse(input.p_assignment);
  const a = await p.assertAssignment(
    assignmentId,
    !['assignment_statistics', 'log_export', 'transition_results'].includes(name),
  );
  const school = refId(a, 'school_id');
  if (name === 'assignment_statistics') {
    const enrolled = await roster(s, a),
      { items, scores } = await scoreData(s, a),
      sessions = await s.list('attendance_sessions', {
        field: 'teacher_assignment_id',
        op: '==',
        value: a.id,
      });
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return {
      student_ids: enrolled.map((e) => String(e.student_id)),
      student_count: enrolled.length,
      hours: sessions.reduce((n, v) => n + Number(v.hours), 0),
      today: sessions.some((v) => v.attendance_date === today),
      expected: enrolled.length * items.length,
      scored: scores.filter((v) => enrolled.some((e) => e.id === v.enrollment_id)).length,
    };
  }
  await s.lock(school);
  if (name === 'log_export') {
    if (input.p_school !== school) fail();
    await audit(s, school, actor, 'teacher_assignments', null, a, 'export', {
      kind: z.string().max(100).parse(input.p_kind),
    });
    return;
  }
  if (name === 'bulk_save_scores') {
    await bulkScores(s, p, a, id.parse(input.p_item), input.p_rows);
    return;
  }
  if (name === 'bulk_score_matrix') {
    for (const item of z
      .array(z.object({ item_id: id, rows: z.unknown() }))
      .max(200)
      .parse(input.p_items))
      await bulkScores(s, p, a, item.item_id, item.rows);
    return;
  }
  if (name === 'bulk_attendance') {
    const session = await upsert(
      s,
      p,
      'attendance_sessions',
      {
        teacher_assignment_id: a.id,
        attendance_date: z.iso.date().parse(input.p_date),
        period_number: z.number().int().positive().parse(input.p_period),
      },
      {
        hours: z.number().positive().max(12).parse(input.p_hours),
        topic: z.string().max(2000).parse(input.p_topic),
        created_by: actor,
      },
    );
    for (const r of rows.parse(input.p_rows))
      await upsert(
        s,
        p,
        'attendance_records',
        { attendance_session_id: session.id, enrollment_id: r.enrollment_id },
        { status: r.status, note: r.note || null, updated_by: actor },
      );
    return session.id;
  }
  if (name === 'bulk_assessments') {
    const kind = z.enum(['indicators', 'reading', 'characteristics']).parse(input.p_kind),
      category = id.parse(input.p_category);
    const table: TableName =
      kind === 'indicators'
        ? 'indicator_results'
        : kind === 'reading'
          ? 'reading_assessment_results'
          : 'characteristic_results';
    const field =
      kind === 'indicators'
        ? 'learning_indicator_id'
        : kind === 'reading'
          ? 'category_id'
          : 'characteristic_id';
    const cat = await s.require(
      kind === 'indicators'
        ? 'learning_indicators'
        : kind === 'reading'
          ? 'reading_assessment_categories'
          : 'desirable_characteristics',
      category,
    );
    if (kind === 'indicators' ? cat.teacher_assignment_id !== a.id : cat.school_id !== school)
      fail('หัวข้อประเมินไม่อยู่ในรายวิชาหรือโรงเรียนนี้');
    for (const r of rows.parse(input.p_rows))
      await upsert(
        s,
        p,
        table,
        {
          ...(kind === 'indicators' ? {} : { teacher_assignment_id: a.id }),
          [field]: category,
          enrollment_id: r.enrollment_id,
        },
        { ...(kind === 'indicators' ? { result: r.result } : { level: r.level }), note: r.note || null },
      );
    return;
  }
  if (name === 'default_score_categories') {
    if ((await s.list('score_categories', { field: 'teacher_assignment_id', op: '==', value: a.id })).length)
      fail('มีหมวดคะแนนแล้ว');
    for (const [n, type, max, index] of [
      ['ก่อนกลางภาค', 'before_midterm', 30, 1],
      ['กลางภาค', 'midterm', 20, 2],
      ['หลังกลางภาค', 'after_midterm', 30, 3],
      ['ปลายภาค', 'final', 20, 4],
    ])
      await persist(
        s,
        p,
        'score_categories',
        {
          teacher_assignment_id: a.id,
          name: n,
          category_type: type,
          max_score: max,
          weight: max,
          sort_order: index,
        },
        null,
        true,
      );
    return;
  }
  if (name === 'calculate_final_results') {
    await calculate(s, p, a);
    return;
  }
  if (name === 'set_result_status') {
    const status = z.enum(['normal', 'ร', 'มส', 'ผ', 'มผ']).parse(input.p_status),
      note = z.string().max(2000).parse(input.p_note),
      enrollment = id.parse(input.p_enrollment);
    if (status !== 'normal' && note.trim().length < 3) fail('กรุณาระบุเหตุผลของผลการเรียนพิเศษ');
    const prev = (
      await s.list('final_results', { field: 'teacher_assignment_id', op: '==', value: a.id })
    ).find((v) => v.enrollment_id === enrollment);
    if (!prev) fail('กรุณาคำนวณผลการเรียนก่อน');
    await persist(s, p, 'final_results', { ...prev, result_status: status, teacher_note: note }, prev, true);
    return;
  }
  if (name === 'transition_results') {
    const state = z.enum(['draft', 'submitted', 'approved', 'locked']).parse(input.p_state),
      reason = z
        .string()
        .max(2000)
        .parse(input.p_reason || '');
    if (state === 'submitted' && a.workflow === 'draft') {
      const enrolled = await roster(s, a),
        { categories, items, scores } = await scoreData(s, a),
        finals = await s.list('final_results', { field: 'teacher_assignment_id', op: '==', value: a.id });
      if (!enrolled.length) fail('ยังไม่มีนักเรียน');
      if (
        categories.some(
          (c) =>
            Math.abs(
              items.filter((i) => i.score_category_id === c.id).reduce((n, i) => n + Number(i.max_score), 0) -
                Number(c.max_score),
            ) > 0.00001,
        )
      )
        fail('คะแนนเต็มงานย่อยต้องครบตามคะแนนเต็มหมวด');
      for (const e of enrolled) {
        const f = finals.find((v) => v.enrollment_id === e.id);
        if (
          !f ||
          !['ร', 'มส'].includes(String(f.result_status)) ||
          String(f.teacher_note || '').trim().length < 3
        ) {
          if (items.some((i) => !scores.some((v) => v.enrollment_id === e.id && v.score_item_id === i.id)))
            fail('ยังมีคะแนนที่ไม่ได้บันทึก');
        }
      }
      for (const [catTable, resultTable, field, assignmentScoped] of [
        ['learning_indicators', 'indicator_results', 'learning_indicator_id', true],
        ['desirable_characteristics', 'characteristic_results', 'characteristic_id', false],
        ['reading_assessment_categories', 'reading_assessment_results', 'category_id', false],
      ] as const) {
        const cats = await s.list(catTable, {
          field: assignmentScoped ? 'teacher_assignment_id' : 'school_id',
          op: '==',
          value: assignmentScoped ? a.id : school,
        });
        for (const c of cats) {
          const assessments = await s.list(resultTable, { field, op: '==', value: c.id });
          if (
            enrolled.some(
              (e) =>
                !assessments.some(
                  (r) => r.enrollment_id === e.id && (assignmentScoped || r.teacher_assignment_id === a.id),
                ),
            )
          )
            fail('กรุณาประเมินตัวชี้วัด คุณลักษณะ และอ่านคิดวิเคราะห์เขียนให้ครบ');
        }
      }
      await calculate(s, p, a);
    } else if (
      (state === 'approved' && a.workflow === 'submitted') ||
      (state === 'locked' && a.workflow === 'approved')
    ) {
      await p.assertAdmin(school);
    } else if (state === 'draft' && a.workflow !== 'draft' && reason.trim().length >= 5) {
      await p.assertAdmin(school);
    } else fail('ลำดับสถานะไม่ถูกต้อง หรือปลดล็อกต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร');
    await persist(s, p, 'teacher_assignments', { ...a, workflow: state, workflow_note: reason }, a, true);
    return;
  }
  fail('ไม่รองรับการดำเนินการนี้');
}
