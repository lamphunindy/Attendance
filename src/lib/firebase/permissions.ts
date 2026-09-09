import { type Doc, Store, fail, refId } from './store';

export class Permissions {
  constructor(
    public store: Store,
    public actor: string,
  ) {}
  async roles() {
    const p = await this.store.get('profiles', this.actor);
    return p?.active ? this.store.list('user_roles', { field: 'user_id', op: '==', value: this.actor }) : [];
  }
  async admin(school: string) {
    return (await this.roles()).some((r) => r.school_id === school && r.role === 'admin');
  }
  async member(school: string) {
    return (await this.roles()).some((r) => r.school_id === school);
  }
  async assignment(id: string, write = false) {
    const a = await this.store.get('teacher_assignments', id);
    if (!a) return false;
    const allowed =
      (await this.admin(refId(a, 'school_id'))) ||
      ((await this.member(refId(a, 'school_id'))) && a.teacher_id === this.actor);
    if (!allowed) return false;
    if (write) {
      const c = await this.store.require('classrooms', refId(a, 'classroom_id'));
      const y = await this.store.require('academic_years', refId(c, 'academic_year_id'));
      return a.active === true && a.workflow === 'draft' && !y.archived_at;
    }
    return true;
  }
  async classroom(id: string) {
    const c = await this.store.get('classrooms', id);
    if (!c) return false;
    if (await this.admin(refId(c, 'school_id'))) return true;
    if (!(await this.member(refId(c, 'school_id')))) return false;
    if (c.homeroom_teacher_id === this.actor) return true;
    return (
      await this.store.list('teacher_assignments', { field: 'classroom_id', op: '==', value: id })
    ).some((a) => a.teacher_id === this.actor);
  }
  async scope(table: string, d: Doc): Promise<{ school: string; assignment?: string; classroom?: string }> {
    if (table === 'schools') return { school: d.id };
    if (table === 'teacher_assignments')
      return { school: refId(d, 'school_id'), assignment: d.id, classroom: refId(d, 'classroom_id') };
    if (table === 'classrooms') return { school: refId(d, 'school_id'), classroom: d.id };
    const parent: Record<string, [string, string]> = {
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
    if (parent[table]) {
      const [t, f] = parent[table];
      return this.scope(t, await this.store.require(t, refId(d, f)));
    }
    return { school: refId(d, 'school_id') };
  }
  async canRead(table: string, d: Doc): Promise<boolean> {
    if (table === 'profiles') {
      if (d.id === this.actor) return true;
      const theirs = await this.store.list('user_roles', { field: 'user_id', op: '==', value: d.id });
      for (const r of theirs) if (await this.admin(refId(r, 'school_id'))) return true;
      if (d.requested_school_id && (await this.admin(refId(d, 'requested_school_id')))) return true;
      // Teachers only need the name of teachers attached to an accessible assignment.
      for (const a of await this.store.list('teacher_assignments', {
        field: 'teacher_id',
        op: '==',
        value: d.id,
      }))
        if (await this.assignment(a.id)) return true;
      return false;
    }
    if (table === 'user_roles' && d.user_id === this.actor)
      return !!(await this.store.get('profiles', this.actor))?.active;
    const scope = await this.scope(table, d);
    if (await this.admin(scope.school)) return true;
    if (!(await this.member(scope.school))) return false;
    if (['audit_logs', 'teacher_invitations', 'user_roles'].includes(table)) return false;
    if (scope.assignment) return this.assignment(scope.assignment);
    if (scope.classroom) return this.classroom(scope.classroom);
    if (table === 'students') {
      for (const e of await this.store.list('enrollments', { field: 'student_id', op: '==', value: d.id }))
        if (await this.classroom(refId(e, 'classroom_id'))) return true;
      return false;
    }
    if (table === 'subjects') {
      for (const a of await this.store.list('teacher_assignments', {
        field: 'subject_id',
        op: '==',
        value: d.id,
      }))
        if (await this.assignment(a.id)) return true;
      return false;
    }
    return [
      'schools',
      'school_settings',
      'academic_years',
      'terms',
      'grade_levels',
      'grading_scales',
      'desirable_characteristics',
      'reading_assessment_categories',
    ].includes(table);
  }
  async assertAdmin(school: string) {
    if (!(await this.admin(school))) fail();
  }
  async assertAssignment(id: string, write = false) {
    if (!(await this.assignment(id, write)))
      fail(write ? 'ผลการเรียนถูกล็อก ส่งแล้ว หรือคุณไม่มีสิทธิ์แก้ไข' : 'คุณไม่มีสิทธิ์เข้าถึงห้องเรียนนี้');
    return this.store.require('teacher_assignments', id);
  }
  async candidates(table: string): Promise<Doc[]> {
    const roles = await this.roles();
    if (table === 'profiles') {
      const result = new Map<string, Doc>();
      const own = await this.store.get(table, this.actor);
      if (own) result.set(own.id, own);
      for (const r of roles) {
        if (r.role === 'admin') {
          for (const member of await this.store.list('user_roles', {
            field: 'school_id',
            op: '==',
            value: r.school_id,
          })) {
            const p = await this.store.get('profiles', refId(member, 'user_id'));
            if (p) result.set(p.id, p);
          }
          for (const p of await this.store.list('profiles', {
            field: 'requested_school_id',
            op: '==',
            value: r.school_id,
          }))
            result.set(p.id, p);
        }
      }
      return [...result.values()];
    }
    if (!roles.length) return [];
    const result = new Map<string, Doc>();
    for (const school of new Set(roles.map((r) => refId(r, 'school_id')))) {
      if (table === 'schools') {
        const d = await this.store.get(table, school);
        if (d) result.set(d.id, d);
        continue;
      }
      for (const d of await this.store.list(table, { field: '_school_id', op: '==', value: school }))
        result.set(d.id, d);
    }
    return [...result.values()];
  }
}
