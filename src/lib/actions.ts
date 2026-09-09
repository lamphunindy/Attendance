'use server';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin, requireAssignment, requireMember } from '@/lib/auth/session';
import { modules, formSchema, schoolFields, studentCreateFields } from '@/lib/admin/config';
import { mutateAdmin } from '@/lib/admin/repository';
import { uuid, email, scoreSchema, studentImportSchema } from '@/lib/validations';
import type { Database, Json } from '@/types/database.types';
import type { ActionResult } from '@/components/ui/action-button';
type DbError = { code?: string; message?: string };
function userError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map((i) => i.message).join(', ');
  const e = error as DbError;
  if (e.code === 'P0001' && e.message && /[ก-๙]/.test(e.message)) return e.message;
  if (e.code === '23505') return 'ข้อมูลซ้ำ กรุณาตรวจสอบรหัส เลขที่ หรือปีที่เปิดใช้งาน';
  if (e.code === '23503') return 'ข้อมูลอ้างอิงไม่ถูกต้อง';
  if (e.code === '42501') return 'คุณไม่มีสิทธิ์ดำเนินการนี้';
  if (e.code === '23514') return 'ข้อมูลไม่ผ่านเกณฑ์ กรุณาตรวจสอบคะแนน วันที่ หรือสถานะ';
  return 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง';
}
async function run(fn: () => Promise<void>, success = 'บันทึกเรียบร้อยแล้ว'): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath('/', 'layout');
    return { success };
  } catch (e) {
    unstable_rethrow(e);
    if (process.env.NODE_ENV === 'development') console.error('Action failed', e);
    return { error: userError(e) };
  }
}
export async function saveAdmin(module: string, id: string | null, input: Record<string, unknown>) {
  return run(async () => {
    const s = await requireAdmin();
    const c = modules[module];
    if (!c) throw new Error('module');
    const value = formSchema(c.fields).parse(input);
    const payload: Record<string, unknown> = {};
    for (const f of c.fields) {
      let v = value[f.key];
      if (v === '' && f.source) v = null;
      payload[f.key] = v ?? null;
    }
    if (c.school) payload.school_id = s.role.school_id;
    if (c.table === 'classrooms' && !id) {
      payload.room_number = String(value.name).split('/').at(-1)!.trim();
    }
    if (id) {
      uuid.parse(id);
      delete payload.school_id;
    }
    const { error } = await mutateAdmin(s.db, c.table, id, payload);
    if (error) throw error;
  });
}
export async function archiveYear(id: string) {
  return run(async () => {
    const s = await requireAdmin();
    uuid.parse(id);
    const { error } = await s.db
      .from('academic_years')
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq('id', id)
      .eq('school_id', s.role.school_id);
    if (error) throw error;
  });
}
export async function manageMember(user: string, role: 'admin' | 'teacher', active: boolean) {
  return run(async () => {
    const s = await requireAdmin();
    const { error } = await s.db.rpc('manage_member', {
      p_school: s.role.school_id,
      p_user: uuid.parse(user),
      p_role: z.enum(['admin', 'teacher']).parse(role),
      p_active: z.boolean().parse(active),
    });
    if (error) throw error;
  });
}
export async function inviteTeacher(input: Record<string, unknown>) {
  return run(async () => {
    const s = await requireAdmin();
    const values = z.object({ email, role: z.enum(['admin', 'teacher']) }).parse(input);
    const { error } = await s.db
      .from('teacher_invitations')
      .insert({ school_id: s.role.school_id, email: values.email, role: values.role, invited_by: s.user.id });
    if (error) throw error;
  }, 'เพิ่มคำเชิญแล้ว ครูสามารถเข้าสู่ระบบด้วยอีเมลนี้');
}
export async function cancelInvitation(id: string) {
  return run(async () => {
    const s = await requireAdmin();
    const { error } = await s.db
      .from('teacher_invitations')
      .update({ status: 'cancelled', invited_by: s.user.id })
      .eq('id', uuid.parse(id))
      .eq('school_id', s.role.school_id)
      .eq('status', 'pending');
    if (error) throw error;
  });
}
export async function saveSchool(input: Record<string, unknown>) {
  return run(async () => {
    const s = await requireAdmin();
    const values = formSchema(schoolFields).parse(input);
    const { error } = await s.db
      .from('schools')
      .update(values as Database['public']['Tables']['schools']['Update'])
      .eq('id', s.role.school_id);
    if (error) throw error;
  });
}
export async function saveSettings(input: Record<string, unknown>) {
  return run(async () => {
    const s = await requireAdmin();
    const v = z
      .object({
        minimum_attendance_percentage: z.number().min(0).max(100),
        score_decimal_places: z.number().int().min(0).max(2),
        teacher_edit_students: z.boolean(),
      })
      .parse(input);
    const { error } = await s.db.from('school_settings').upsert(
      Object.entries(v).map(([key, value]) => ({ school_id: s.role.school_id, key, value })),
      { onConflict: 'school_id,key' },
    );
    if (error) throw error;
  });
}
export async function saveScores(
  id: string,
  item: string,
  rows: { enrollment_id: string; score: number | null; note?: string }[],
) {
  return run(async () => {
    const s = await requireAssignment(id);
    const { data, error } = await s.db
      .from('score_items')
      .select('max_score')
      .eq('id', uuid.parse(item))
      .single();
    if (error) throw error;
    const parsed = z
      .array(
        z.object({
          enrollment_id: uuid,
          score: scoreSchema(data.max_score),
          note: z.string().max(1000).optional(),
        }),
      )
      .max(500)
      .parse(rows);
    const r = await s.db.rpc('bulk_save_scores', { p_assignment: id, p_item: item, p_rows: parsed });
    if (r.error) throw r.error;
  }, 'บันทึกคะแนนเรียบร้อยแล้ว');
}
export async function saveScoreMatrix(id: string, input: unknown) {
  return run(async () => {
    const s = await requireAssignment(id);
    const v = z
      .array(
        z.object({
          item_id: uuid,
          rows: z
            .array(z.object({ enrollment_id: uuid, score: z.number().finite().min(0).nullable() }))
            .max(500),
        }),
      )
      .max(200)
      .parse(input);
    const r = await s.db.rpc('bulk_score_matrix', { p_assignment: id, p_items: v });
    if (r.error) throw r.error;
  }, 'บันทึกคะแนนเรียบร้อยแล้ว');
}
export async function saveAttendance(id: string, input: unknown) {
  return run(async () => {
    const s = await requireAssignment(id);
    const v = z
      .object({
        date: z.iso.date(),
        period: z.number().int().positive(),
        hours: z.number().positive().max(12),
        topic: z.string().max(2000),
        rows: z
          .array(
            z.object({
              enrollment_id: uuid,
              status: z.enum(['present', 'late', 'leave', 'sick', 'absent']),
              note: z.string().max(1000).optional(),
            }),
          )
          .max(500),
      })
      .parse(input);
    const r = await s.db.rpc('bulk_attendance', {
      p_assignment: id,
      p_date: v.date,
      p_period: v.period,
      p_hours: v.hours,
      p_topic: v.topic,
      p_rows: v.rows,
    });
    if (r.error) throw r.error;
  }, 'บันทึกการเข้าเรียนเรียบร้อยแล้ว');
}
export async function saveAssessment(id: string, kind: string, category: string, rows: unknown) {
  return run(async () => {
    const s = await requireAssignment(id);
    z.enum(['indicators', 'reading', 'characteristics']).parse(kind);
    uuid.parse(category);
    const parsed = z
      .array(
        z.object({
          enrollment_id: uuid,
          result: z.enum(['excellent', 'good', 'pass', 'improve']).optional(),
          level: z.number().int().min(0).max(3).optional(),
          note: z.string().max(1000).optional(),
        }),
      )
      .max(500)
      .parse(rows);
    const r = await s.db.rpc('bulk_assessments', {
      p_assignment: id,
      p_kind: kind,
      p_category: category,
      p_rows: parsed,
    });
    if (r.error) throw r.error;
  });
}
export async function saveAssignmentConfig(
  id: string,
  kind: 'category' | 'item' | 'indicator',
  recordId: string | null,
  input: Record<string, unknown>,
) {
  return run(async () => {
    const s = await requireAssignment(id);
    if (recordId) uuid.parse(recordId);
    if (kind === 'category') {
      const v = z
        .object({
          name: z.string().min(1).max(200),
          max_score: z.number().positive().max(100),
          weight: z.number().positive().max(100),
          sort_order: z.number().int().min(0),
          category_type: z.enum(['before_midterm', 'midterm', 'after_midterm', 'final', 'custom']),
        })
        .parse(input);
      const r = recordId
        ? await s.db.from('score_categories').update(v).eq('id', recordId).eq('teacher_assignment_id', id)
        : await s.db.from('score_categories').insert({ ...v, teacher_assignment_id: id });
      if (r.error) throw r.error;
    }
    if (kind === 'item') {
      const v = z
        .object({
          score_category_id: uuid,
          title: z.string().min(1).max(200),
          max_score: z.number().positive().max(100),
          sort_order: z.number().int().min(0),
          description: z.string().max(4000).optional(),
          due_date: z.union([z.iso.date(), z.literal('')]).optional(),
          active: z.boolean(),
        })
        .parse(input);
      const payload = { ...v, due_date: v.due_date || null };
      const r = recordId
        ? await s.db.from('score_items').update(payload).eq('id', recordId)
        : await s.db.from('score_items').insert(payload);
      if (r.error) throw r.error;
    }
    if (kind === 'indicator') {
      const v = z
        .object({
          code: z.string().min(1).max(100),
          description: z.string().min(1).max(4000),
          sort_order: z.number().int().min(0),
        })
        .parse(input);
      const r = recordId
        ? await s.db.from('learning_indicators').update(v).eq('id', recordId).eq('teacher_assignment_id', id)
        : await s.db.from('learning_indicators').insert({ ...v, teacher_assignment_id: id });
      if (r.error) throw r.error;
    }
  });
}
export async function defaultCategories(id: string) {
  return run(async () => {
    const s = await requireAssignment(id);
    const r = await s.db.rpc('default_score_categories', { p_assignment: id });
    if (r.error) throw r.error;
  });
}
export async function calculateResults(id: string) {
  return run(async () => {
    const s = await requireAssignment(id);
    const r = await s.db.rpc('calculate_final_results', { p_assignment: id });
    if (r.error) throw r.error;
  });
}
export async function transitionResults(
  id: string,
  state: 'draft' | 'submitted' | 'approved' | 'locked',
  reason: string,
) {
  return run(async () => {
    const s = await requireAssignment(id);
    const r = await s.db.rpc('transition_results', {
      p_assignment: id,
      p_state: z.enum(['draft', 'submitted', 'approved', 'locked']).parse(state),
      p_reason: z.string().max(2000).parse(reason),
    });
    if (r.error) throw r.error;
  });
}
export async function setResultStatus(id: string, input: Record<string, unknown>) {
  return run(async () => {
    const s = await requireAssignment(id);
    const v = z
      .object({
        enrollment_id: uuid,
        status: z.enum(['normal', 'ร', 'มส', 'ผ', 'มผ']),
        note: z.string().max(2000),
      })
      .parse(input);
    const r = await s.db.rpc('set_result_status', {
      p_assignment: id,
      p_enrollment: v.enrollment_id,
      p_status: v.status,
      p_note: v.note,
    });
    if (r.error) throw r.error;
  });
}
export async function importStudents(classroom: string, rows: unknown) {
  return run(async () => {
    const s = await requireAdmin();
    const parsed = z.array(studentImportSchema).min(1).max(500).parse(rows);
    const r = await s.db.rpc('import_students', { p_classroom: uuid.parse(classroom), p_rows: parsed });
    if (r.error) throw r.error;
  }, 'นำเข้านักเรียนครบทุกแถวเรียบร้อยแล้ว');
}
export async function createStudent(input: Record<string, unknown>) {
  return run(async () => {
    const s = await requireAdmin();
    const values = formSchema(studentCreateFields).parse(input);
    const row = studentImportSchema.parse(values);
    const result = await s.db.rpc('import_students', {
      p_classroom: uuid.parse(values.classroom_id),
      p_rows: [row],
    });
    if (result.error) throw result.error;
  }, 'เพิ่มนักเรียนและจัดเข้าห้องเรียนเรียบร้อยแล้ว');
}
export async function moveStudent(input: Record<string, unknown>) {
  return run(async () => {
    const s = await requireAdmin();
    const v = z
      .object({ enrollment_id: uuid, classroom_id: uuid, student_number: z.number().int().positive() })
      .parse(input);
    const r = await s.db.rpc('move_student', {
      p_enrollment: v.enrollment_id,
      p_classroom: v.classroom_id,
      p_number: v.student_number,
    });
    if (r.error) throw r.error;
  });
}
export async function editStudentBasics(student: string, input: Record<string, unknown>) {
  return run(async () => {
    const s = await requireMember();
    const v = z
      .object({
        prefix: z.string().max(30),
        first_name: z.string().min(1).max(100),
        last_name: z.string().min(1).max(100),
        nickname: z.string().max(100),
      })
      .parse(input);
    const r = await s.db.rpc('update_student_basics', {
      p_student: uuid.parse(student),
      p_prefix: v.prefix,
      p_first: v.first_name,
      p_last: v.last_name,
      p_nickname: v.nickname,
    });
    if (r.error) throw r.error;
  });
}
export async function auditPrint(id: string) {
  return run(async () => {
    const s = await requireAssignment(id);
    const r = await s.db.rpc('log_export', {
      p_school: s.assignment.school_id,
      p_assignment: id,
      p_kind: 'print_pp5',
    });
    if (r.error) throw r.error;
  });
}
export async function skipSetup() {
  return run(async () => {
    const s = await requireAdmin();
    const r = await s.db
      .from('school_settings')
      .upsert(
        { school_id: s.role.school_id, key: 'setup_completed', value: true as Json },
        { onConflict: 'school_id,key' },
      );
    if (r.error) throw r.error;
  });
}
