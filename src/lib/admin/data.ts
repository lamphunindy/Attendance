import 'server-only';
import { requireAdmin } from '@/lib/auth/session';
import type { Options } from '@/components/admin/record-form';
import { allRows } from '@/lib/data';
export async function adminOptions(includeStudents = false) {
  const s = await requireAdmin(),
    db = s.db,
    sid = s.role.school_id;
  const queries = await Promise.all([
    db
      .from('academic_years')
      .select('id,year,archived_at')
      .eq('school_id', sid)
      .order('year', { ascending: false }),
    db.from('grade_levels').select('id,name').eq('school_id', sid).order('sort_order'),
    db.from('classrooms').select('id,name,academic_year_id,active').eq('school_id', sid),
    db.from('subjects').select('id,name,subject_code').eq('school_id', sid),
    db.from('profiles').select('id,full_name,active'),
    db.from('user_roles').select('user_id').eq('school_id', sid),
    includeStudents
      ? allRows((from, to) =>
          db
            .from('students')
            .select('id,student_code,first_name,last_name')
            .eq('school_id', sid)
            .order('student_code')
            .range(from, to),
        )
      : Promise.resolve({ data: [], error: null }),
    db.from('terms').select('id,name,academic_year_id'),
  ]);
  for (const r of queries) if (r.error) throw r.error;
  const [years, grades, classes, subjects, profiles, roles, students, terms] = queries;
  const schoolYears = new Set(years.data!.map((y) => y.id));
  const options: Options = {
    academic_years: years.data!.map((x) => ({ value: x.id, label: String(x.year) })),
    grade_levels: grades.data!.map((x) => ({ value: x.id, label: x.name })),
    classrooms: classes.data!.map((x) => ({
      value: x.id,
      label: `${x.name} (${years.data!.find((y) => y.id === x.academic_year_id)?.year})`,
    })),
    subjects: subjects.data!.map((x) => ({ value: x.id, label: `${x.subject_code} ${x.name}` })),
    profiles: profiles
      .data!.filter((p) => p.active && roles.data!.some((r) => r.user_id === p.id))
      .map((x) => ({ value: x.id, label: x.full_name })),
    students: students.data!.map((x) => ({
      value: x.id,
      label: `${x.student_code} ${x.first_name} ${x.last_name}`,
    })),
    terms: terms
      .data!.filter((t) => schoolYears.has(t.academic_year_id))
      .map((x) => ({
        value: x.id,
        label: `${x.name} (${years.data!.find((y) => y.id === x.academic_year_id)?.year})`,
      })),
  };
  const openClassIds = new Set(
    classes
      .data!.filter((c) => c.active && years.data!.some((y) => y.id === c.academic_year_id && !y.archived_at))
      .map((c) => c.id),
  );
  options.open_classrooms = options.classrooms.filter((c) => openClassIds.has(c.value));
  return { s, options };
}
