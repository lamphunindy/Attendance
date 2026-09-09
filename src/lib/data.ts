import 'server-only';
import { requireAssignment, requireMember } from '@/lib/auth/session';
import { cache } from 'react';
import { z } from 'zod';
export const loadAssignment = cache(async (id: string) => {
  const s = await requireAssignment(id),
    a = s.assignment,
    db = s.db;
  const results = await Promise.all([
    db
      .from('schools')
      .select('id,name,code,logo_url,address,phone,director_name,education_area,created_at,updated_at')
      .eq('id', a.school_id)
      .single(),
    db
      .from('classrooms')
      .select('id,name,academic_year_id,grade_level_id,room_number')
      .eq('id', a.classroom_id)
      .single(),
    db
      .from('subjects')
      .select('id,subject_code,name,subject_group,hours_per_term,credits,description')
      .eq('id', a.subject_id)
      .single(),
    db
      .from('terms')
      .select('id,name,term_number,start_date,end_date,academic_year_id,is_active')
      .eq('id', a.term_id)
      .single(),
    db.from('profiles').select('id,full_name').eq('id', a.teacher_id).single(),
    allRows((from, to) =>
      db
        .from('enrollments')
        .select('id,student_id,student_number,status')
        .eq('classroom_id', a.classroom_id)
        .order('student_number')
        .range(from, to),
    ),
    db
      .from('score_categories')
      .select('id,teacher_assignment_id,name,max_score,weight,category_type,sort_order,created_at,updated_at')
      .eq('teacher_assignment_id', id)
      .order('sort_order'),
    allRows((from, to) =>
      db
        .from('attendance_sessions')
        .select(
          'id,teacher_assignment_id,attendance_date,period_number,topic,hours,created_by,created_at,updated_at',
        )
        .eq('teacher_assignment_id', id)
        .order('attendance_date')
        .range(from, to),
    ),
    db
      .from('learning_indicators')
      .select('id,code,description,sort_order')
      .eq('teacher_assignment_id', id)
      .order('sort_order'),
    db
      .from('desirable_characteristics')
      .select('id,code,name,sort_order')
      .eq('school_id', a.school_id)
      .order('sort_order'),
    db
      .from('reading_assessment_categories')
      .select('id,name,sort_order')
      .eq('school_id', a.school_id)
      .order('sort_order'),
    db
      .from('final_results')
      .select('id,enrollment_id,total_score,grade,result_status,teacher_note,calculated_at')
      .eq('teacher_assignment_id', id),
    db.from('school_settings').select('key,value').eq('school_id', a.school_id),
    db.from('grading_scales').select('min_score,max_score,display_grade').eq('school_id', a.school_id),
    allRows((from, to) =>
      db
        .from('characteristic_results')
        .select('characteristic_id,enrollment_id,level,note')
        .eq('teacher_assignment_id', id)
        .order('id')
        .range(from, to),
    ),
    allRows((from, to) =>
      db
        .from('reading_assessment_results')
        .select('category_id,enrollment_id,level,note')
        .eq('teacher_assignment_id', id)
        .order('id')
        .range(from, to),
    ),
  ]);
  for (const r of results) if (r.error) throw r.error;
  const [
    school,
    classroom,
    subject,
    term,
    teacher,
    enrollments,
    categories,
    sessions,
    indicators,
    characteristics,
    reading,
    finals,
    settings,
    scales,
    characteristicResults,
    readingResults,
  ] = results;
  const studentIds = enrollments.data!.map((e) => e.student_id),
    catIds = categories.data!.map((c) => c.id),
    sessionIds = sessions.data!.map((c) => c.id),
    indicatorIds = indicators.data!.map((c) => c.id);
  const second = await Promise.all([
    db
      .from('students')
      .select('id,student_code,prefix,first_name,last_name,nickname,active')
      .in('id', studentIds.length ? studentIds : ['00000000-0000-0000-0000-000000000000']),
    db
      .from('score_items')
      .select(
        'id,score_category_id,title,description,max_score,due_date,sort_order,active,created_at,updated_at',
      )
      .in('score_category_id', catIds.length ? catIds : ['00000000-0000-0000-0000-000000000000'])
      .order('sort_order'),
    db
      .from('academic_years')
      .select('id,year,is_active,archived_at')
      .eq('id', term.data!.academic_year_id)
      .single(),
  ]);
  for (const r of second) if (r.error) throw r.error;
  const [students, items, year] = second;
  // Batch matrix queries so large classes do not produce oversized query filters.
  const scores = await fetchBatches(
    items.data!.map((i) => i.id),
    (ids, from, to) =>
      db
        .from('student_scores')
        .select('score_item_id,enrollment_id,score,note')
        .in('score_item_id', ids)
        .order('id')
        .range(from, to),
  );
  const records = await fetchBatches(sessionIds, (ids, from, to) =>
    db
      .from('attendance_records')
      .select('attendance_session_id,enrollment_id,status,note')
      .in('attendance_session_id', ids)
      .order('id')
      .range(from, to),
  );
  const indicatorResults = await fetchBatches(indicatorIds, (ids, from, to) =>
    db
      .from('indicator_results')
      .select('learning_indicator_id,enrollment_id,result,note')
      .in('learning_indicator_id', ids)
      .order('id')
      .range(from, to),
  );
  return {
    assignment: a,
    school: school.data!,
    classroom: classroom.data!,
    subject: subject.data!,
    term: term.data!,
    teacher: teacher.data!,
    year: year.data!,
    students: students.data!,
    enrollments: enrollments.data!,
    categories: categories.data!,
    items: items.data!,
    sessions: sessions.data!,
    indicators: indicators.data!,
    characteristics: characteristics.data!,
    reading: reading.data!,
    finals: finals.data!,
    settings: settings.data!,
    scales: scales.data!,
    scores,
    records,
    indicatorResults,
    characteristicResults: characteristicResults.data!,
    readingResults: readingResults.data!,
    isAdmin: s.role.role === 'admin',
  };
});
export type AssignmentData = Awaited<ReturnType<typeof loadAssignment>>;
export async function fetchPages<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await query(from, from + 999);
    if (r.error) throw new Error(r.error.message);
    all.push(...(r.data || []));
    if ((r.data?.length || 0) < 1000) break;
  }
  return all;
}
export async function allRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  return { data: await fetchPages(query), error: null };
}
async function fetchBatches<T>(
  ids: string[],
  query: (
    ids: string[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += 100)
    rows.push(...(await fetchPages((from, to) => query(ids.slice(i, i + 100), from, to))));
  return rows;
}
export async function loadDashboard(filters: Record<string, string | undefined> = {}) {
  const s = await requireMember(),
    db = s.db,
    sid = s.role.school_id;
  const [years, terms, classes, subjects, teachers, grades] = await Promise.all([
    db
      .from('academic_years')
      .select('id,year,is_active')
      .eq('school_id', sid)
      .order('year', { ascending: false }),
    db.from('terms').select('id,name,academic_year_id,is_active'),
    db.from('classrooms').select('id,name,academic_year_id,grade_level_id').eq('school_id', sid),
    db.from('subjects').select('id,name,subject_code,hours_per_term').eq('school_id', sid),
    db.from('profiles').select('id,full_name'),
    db.from('grade_levels').select('id,name').eq('school_id', sid).order('sort_order'),
  ]);
  for (const r of [years, terms, classes, subjects, teachers, grades]) if (r.error) throw r.error;
  const selectedYear = filters.year || years.data?.find((y) => y.is_active)?.id || years.data?.[0]?.id;
  const yearTerms = terms.data!.filter((t) => t.academic_year_id === selectedYear),
    termId = filters.term || yearTerms.find((t) => t.is_active)?.id || yearTerms[0]?.id;
  let query = db
    .from('teacher_assignments')
    .select('id,school_id,classroom_id,subject_id,teacher_id,term_id,workflow,active')
    .eq('school_id', sid)
    .order('created_at', { ascending: false });
  if (termId) query = query.eq('term_id', termId);
  if (filters.classroom) query = query.eq('classroom_id', filters.classroom);
  if (filters.subject) query = query.eq('subject_id', filters.subject);
  if (filters.teacher) query = query.eq('teacher_id', filters.teacher);
  const assignments = await fetchPages((from, to) => query.range(from, to));
  const cards = await Promise.all(
    (assignments || []).map(async (a) => {
      const classroom = classes.data!.find((c) => c.id === a.classroom_id),
        subject = subjects.data!.find((c) => c.id === a.subject_id),
        teacher = teachers.data!.find((c) => c.id === a.teacher_id);
      const { data: stats, error } = await db.rpc('assignment_statistics', { p_assignment: a.id });
      if (error) throw error;
      const v = z
        .object({
          student_ids: z.array(z.string()),
          student_count: z.number(),
          hours: z.number(),
          today: z.boolean(),
          expected: z.number(),
          scored: z.number(),
        })
        .parse(stats);
      const expected = v.expected,
        scored = v.scored;
      return {
        ...a,
        classroom,
        subject,
        teacher,
        studentIds: v.student_ids,
        studentCount: v.student_count,
        hours: v.hours,
        today: v.today,
        completion: expected ? Math.round(((scored || 0) / expected) * 100) : 0,
        missing: Math.max(0, expected - (scored || 0)),
      };
    }),
  );
  const q = filters.q?.toLowerCase();
  return {
    s,
    years: years.data!,
    terms: yearTerms,
    classes: classes.data!,
    subjects: subjects.data!,
    teachers: teachers.data!,
    grades: grades.data!,
    selectedYear,
    termId,
    cards: cards.filter(
      (c) =>
        (!filters.grade || c.classroom?.grade_level_id === filters.grade) &&
        (!q ||
          `${c.classroom?.name} ${c.subject?.name} ${c.subject?.subject_code} ${c.teacher?.full_name}`
            .toLowerCase()
            .includes(q)),
    ),
  };
}
