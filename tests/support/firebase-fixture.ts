import type { Firestore } from 'firebase-admin/firestore';
import { atomic, newDoc } from '../../src/lib/firebase/store';
import { persist } from '../../src/lib/firebase/validation';
import { Permissions } from '../../src/lib/firebase/permissions';
import { seedSchool } from '../../src/lib/firebase/identity';

export const fixtureIds = {
  admin: '11111111-1111-4111-a111-111111111111',
  teacher: '22222222-2222-4222-a222-222222222222',
  teacherB: '33333333-3333-4333-a333-333333333333',
  pending: '44444444-4444-4444-a444-444444444444',
  adminB: '55555555-5555-4555-a555-555555555555',
};
export async function seedFixture(db: Firestore) {
  return atomic(db, async (s) => {
    const school = newDoc({
      name: 'โรงเรียนตัวอย่าง',
      code: 'DEMO-A',
      logo_url: null,
      address: null,
      phone: null,
      director_name: null,
      education_area: null,
    });
    school._school_id = school.id;
    s.put('schools', school);
    const schoolB = newDoc({
      ...school,
      id: crypto.randomUUID(),
      name: 'โรงเรียนตัวอย่าง B',
      code: 'DEMO-B',
      created_at: new Date(Date.parse(String(school.created_at)) + 1000).toISOString(),
    });
    schoolB._school_id = schoolB.id;
    s.put('schools', schoolB);
    for (const [key, uid] of Object.entries(fixtureIds))
      s.put(
        'profiles',
        newDoc({
          id: uid,
          full_name: key === 'teacher' ? 'ครูทดสอบ' : key,
          email: `${key}@example.test`,
          avatar_url: null,
          phone: null,
          active: true,
          requested_school_id: key === 'adminB' ? schoolB.id : school.id,
          last_login_at: null,
        }),
      );
    const p = new Permissions(s, fixtureIds.admin);
    for (const [uid, role, sid] of [
      [fixtureIds.admin, 'admin', school.id],
      [fixtureIds.teacher, 'teacher', school.id],
      [fixtureIds.teacherB, 'teacher', school.id],
      [fixtureIds.adminB, 'admin', schoolB.id],
    ])
      await persist(s, p, 'user_roles', { user_id: uid, role, school_id: sid }, null, true);
    await seedSchool(s, fixtureIds.admin, school.id);
    const year = await persist(
      s,
      p,
      'academic_years',
      { school_id: school.id, year: 2569, is_active: true },
      null,
      true,
    );
    const grade = (await s.list('grade_levels', { field: 'school_id', op: '==', value: school.id })).find(
      (d) => d.code === 'ป.6',
    )!;
    const term = await persist(
      s,
      p,
      'terms',
      {
        academic_year_id: year.id,
        term_number: 1,
        name: 'ภาคเรียนที่ 1',
        start_date: '2026-05-01',
        end_date: '2026-10-01',
        is_active: true,
      },
      null,
      true,
    );
    const classroom = await persist(
      s,
      p,
      'classrooms',
      {
        school_id: school.id,
        academic_year_id: year.id,
        grade_level_id: grade.id,
        name: 'ป.6/1',
        room_number: '1',
      },
      null,
      true,
    );
    const classroomB = await persist(
      s,
      p,
      'classrooms',
      {
        school_id: school.id,
        academic_year_id: year.id,
        grade_level_id: grade.id,
        name: 'ป.6/2',
        room_number: '2',
      },
      null,
      true,
    );
    const subject = await persist(
      s,
      p,
      'subjects',
      { school_id: school.id, subject_code: 'ว16101', name: 'วิทยาการคำนวณ', hours_per_term: 40, credits: 1 },
      null,
      true,
    );
    const assignment = await persist(
      s,
      p,
      'teacher_assignments',
      {
        school_id: school.id,
        teacher_id: fixtureIds.teacher,
        classroom_id: classroom.id,
        subject_id: subject.id,
        term_id: term.id,
      },
      null,
      true,
    );
    const assignmentB = await persist(
      s,
      p,
      'teacher_assignments',
      {
        school_id: school.id,
        teacher_id: fixtureIds.teacherB,
        classroom_id: classroomB.id,
        subject_id: subject.id,
        term_id: term.id,
      },
      null,
      true,
    );
    const enrollments = [];
    for (let n = 1; n <= 10; n++) {
      const student = await persist(
        s,
        p,
        'students',
        {
          school_id: school.id,
          student_code: `DEMO${n.toString().padStart(3, '0')}`,
          prefix: 'ด.ช.',
          first_name: `นักเรียนตัวอย่าง ${n}`,
          last_name: 'สำหรับทดสอบ',
        },
        null,
        true,
      );
      enrollments.push(
        await persist(
          s,
          p,
          'enrollments',
          {
            student_id: student.id,
            classroom_id: classroom.id,
            academic_year_id: year.id,
            student_number: n,
          },
          null,
          true,
        ),
      );
    }
    return {
      school: school.id,
      schoolB: schoolB.id,
      year: year.id,
      term: term.id,
      classroom: classroom.id,
      classroomB: classroomB.id,
      subject: subject.id,
      assignment: assignment.id,
      assignmentB: assignmentB.id,
      enrollments,
    };
  });
}
