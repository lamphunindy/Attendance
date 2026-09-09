import 'server-only';
import type { Repository } from '@/lib/firebase/repository';
import type { Database, TableName } from '@/types/database.types';
// Data is validated by the module's Zod schema before entering this typed table dispatcher.
export async function mutateAdmin(
  db: Repository,
  table: TableName,
  id: string | null,
  payload: Record<string, unknown>,
) {
  switch (table) {
    case 'academic_years':
      return id
        ? db
            .from('academic_years')
            .update(payload as Database['public']['Tables']['academic_years']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('academic_years')
            .insert(payload as Database['public']['Tables']['academic_years']['Insert'])
            .select('id')
            .single();
    case 'terms':
      return id
        ? db
            .from('terms')
            .update(payload as Database['public']['Tables']['terms']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('terms')
            .insert(payload as Database['public']['Tables']['terms']['Insert'])
            .select('id')
            .single();
    case 'grade_levels':
      return id
        ? db
            .from('grade_levels')
            .update(payload as Database['public']['Tables']['grade_levels']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('grade_levels')
            .insert(payload as Database['public']['Tables']['grade_levels']['Insert'])
            .select('id')
            .single();
    case 'classrooms':
      return id
        ? db
            .from('classrooms')
            .update(payload as Database['public']['Tables']['classrooms']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('classrooms')
            .insert(payload as Database['public']['Tables']['classrooms']['Insert'])
            .select('id')
            .single();
    case 'subjects':
      return id
        ? db
            .from('subjects')
            .update(payload as Database['public']['Tables']['subjects']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('subjects')
            .insert(payload as Database['public']['Tables']['subjects']['Insert'])
            .select('id')
            .single();
    case 'teacher_assignments':
      return id
        ? db
            .from('teacher_assignments')
            .update(payload as Database['public']['Tables']['teacher_assignments']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('teacher_assignments')
            .insert(payload as Database['public']['Tables']['teacher_assignments']['Insert'])
            .select('id')
            .single();
    case 'students':
      return id
        ? db
            .from('students')
            .update(payload as Database['public']['Tables']['students']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('students')
            .insert(payload as Database['public']['Tables']['students']['Insert'])
            .select('id')
            .single();
    case 'enrollments':
      return id
        ? db
            .from('enrollments')
            .update(payload as Database['public']['Tables']['enrollments']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('enrollments')
            .insert(payload as Database['public']['Tables']['enrollments']['Insert'])
            .select('id')
            .single();
    case 'grading_scales':
      return id
        ? db
            .from('grading_scales')
            .update(payload as Database['public']['Tables']['grading_scales']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('grading_scales')
            .insert(payload as Database['public']['Tables']['grading_scales']['Insert'])
            .select('id')
            .single();
    case 'desirable_characteristics':
      return id
        ? db
            .from('desirable_characteristics')
            .update(payload as Database['public']['Tables']['desirable_characteristics']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('desirable_characteristics')
            .insert(payload as Database['public']['Tables']['desirable_characteristics']['Insert'])
            .select('id')
            .single();
    case 'reading_assessment_categories':
      return id
        ? db
            .from('reading_assessment_categories')
            .update(payload as Database['public']['Tables']['reading_assessment_categories']['Update'])
            .eq('id', id)
            .select('id')
            .single()
        : db
            .from('reading_assessment_categories')
            .insert(payload as Database['public']['Tables']['reading_assessment_categories']['Insert'])
            .select('id')
            .single();
    default:
      throw new Error('Unsupported admin module');
  }
}
