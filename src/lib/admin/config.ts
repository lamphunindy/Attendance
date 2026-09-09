import type { TableName } from '@/types/database.types';
import { z } from 'zod';
export type Field = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'checkbox' | 'textarea' | 'select' | 'email' | 'url';
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  options?: { value: string; label: string }[];
  source?: string;
  default?: string | number | boolean;
};
export type ModuleConfig = {
  title: string;
  singular: string;
  table: TableName;
  fields: Field[];
  columns: string[];
  search: string[];
  school?: boolean;
  archive?: boolean;
};
const f = (key: string, label: string, extra: Partial<Field> = {}): Field => ({
  key,
  label,
  required: true,
  ...extra,
});
const ref = (key: string, label: string, source: string, required = true) =>
  f(key, label, { type: 'select', source, required });
export const modules: Record<string, ModuleConfig> = {
  'academic-years': {
    title: 'ปีการศึกษา',
    singular: 'ปีการศึกษา',
    table: 'academic_years',
    school: true,
    archive: true,
    columns: ['year', 'is_active', 'archived_at'],
    search: ['year'],
    fields: [
      f('year', 'ปีการศึกษา (พ.ศ.)', { type: 'number', min: 2400, max: 3000, default: 2569 }),
      f('is_active', 'ปีการศึกษาปัจจุบัน', { type: 'checkbox', default: false }),
    ],
  },
  terms: {
    title: 'ภาคเรียน',
    singular: 'ภาคเรียน',
    table: 'terms',
    columns: ['name', 'academic_year_id', 'start_date', 'end_date', 'is_active'],
    search: ['name'],
    fields: [
      ref('academic_year_id', 'ปีการศึกษา', 'academic_years'),
      f('term_number', 'ภาคเรียนที่', { type: 'number', min: 1, default: 1 }),
      f('name', 'ชื่อภาคเรียน'),
      f('start_date', 'วันเปิดภาคเรียน', { type: 'date' }),
      f('end_date', 'วันปิดภาคเรียน', { type: 'date' }),
      f('is_active', 'ภาคเรียนปัจจุบัน', { type: 'checkbox', default: false }),
    ],
  },
  'grade-levels': {
    title: 'ระดับชั้น',
    singular: 'ระดับชั้น',
    table: 'grade_levels',
    school: true,
    columns: ['code', 'name', 'sort_order'],
    search: ['code', 'name'],
    fields: [
      f('code', 'รหัสชั้น'),
      f('name', 'ชื่อระดับชั้น'),
      f('sort_order', 'ลำดับ', { type: 'number', min: 0, default: 0 }),
    ],
  },
  classrooms: {
    title: 'ห้องเรียน',
    singular: 'ห้องเรียน',
    table: 'classrooms',
    school: true,
    columns: ['name', 'academic_year_id', 'grade_level_id', 'homeroom_teacher_id', 'active'],
    search: ['name', 'room_number'],
    fields: [
      ref('academic_year_id', 'ปีการศึกษา', 'academic_years'),
      ref('grade_level_id', 'ระดับชั้น', 'grade_levels'),
      f('name', 'ชื่อห้อง เช่น ป.6/1'),
      ref('homeroom_teacher_id', 'ครูประจำชั้น', 'profiles', false),
      f('active', 'เปิดใช้งาน', { type: 'checkbox', default: true }),
    ],
  },
  subjects: {
    title: 'รายวิชา',
    singular: 'รายวิชา',
    table: 'subjects',
    school: true,
    columns: ['subject_code', 'name', 'subject_group', 'hours_per_term', 'credits', 'active'],
    search: ['subject_code', 'name', 'subject_group'],
    fields: [
      f('subject_code', 'รหัสวิชา'),
      f('name', 'ชื่อวิชา'),
      f('subject_group', 'กลุ่มสาระ', { required: false }),
      f('hours_per_term', 'ชั่วโมงต่อภาคเรียน', { type: 'number', min: 1, default: 40 }),
      f('credits', 'หน่วยกิต', { type: 'number', min: 0, step: '0.5', default: 1 }),
      f('description', 'คำอธิบายรายวิชา', { type: 'textarea', required: false }),
      f('active', 'เปิดใช้งาน', { type: 'checkbox', default: true }),
    ],
  },
  assignments: {
    title: 'มอบหมายการสอน',
    singular: 'การมอบหมาย',
    table: 'teacher_assignments',
    school: true,
    columns: ['teacher_id', 'classroom_id', 'subject_id', 'term_id', 'workflow', 'active'],
    search: [],
    fields: [
      ref('teacher_id', 'ครูผู้สอน', 'profiles'),
      ref('classroom_id', 'ห้องเรียน', 'classrooms'),
      ref('subject_id', 'รายวิชา', 'subjects'),
      ref('term_id', 'ภาคเรียน', 'terms'),
      f('active', 'เปิดใช้งาน', { type: 'checkbox', default: true }),
    ],
  },
  students: {
    title: 'นักเรียน',
    singular: 'นักเรียน',
    table: 'students',
    school: true,
    columns: ['student_code', 'prefix', 'first_name', 'last_name', 'nickname', 'active'],
    search: ['student_code', 'first_name', 'last_name', 'nickname'],
    fields: [
      f('student_code', 'รหัสนักเรียน'),
      f('prefix', 'คำนำหน้า', {
        type: 'select',
        default: 'ด.ช.',
        options: ['ด.ช.', 'ด.ญ.', 'นาย', 'นางสาว', 'นาง'].map((value) => ({ value, label: value })),
      }),
      f('first_name', 'ชื่อ'),
      f('last_name', 'นามสกุล'),
      f('nickname', 'ชื่อเล่น', { required: false }),
      f('active', 'เปิดใช้งาน', { type: 'checkbox', default: true }),
    ],
  },
  enrollments: {
    title: 'นักเรียนประจำห้อง / ย้ายห้อง',
    singular: 'การลงทะเบียน',
    table: 'enrollments',
    columns: ['student_id', 'classroom_id', 'student_number', 'status'],
    search: [],
    fields: [
      ref('student_id', 'นักเรียน', 'students'),
      ref('classroom_id', 'ห้องเรียน', 'classrooms'),
      ref('academic_year_id', 'ปีการศึกษา', 'academic_years'),
      f('student_number', 'เลขที่', { type: 'number', min: 1 }),
      f('status', 'สถานะ', {
        type: 'select',
        default: 'active',
        options: [
          { value: 'active', label: 'กำลังเรียน' },
          { value: 'moved', label: 'ย้ายห้อง' },
          { value: 'withdrawn', label: 'ออกจากโรงเรียน' },
          { value: 'graduated', label: 'จบการศึกษา' },
        ],
      }),
    ],
  },
  grading: {
    title: 'เกณฑ์คะแนนและเกรด',
    singular: 'เกณฑ์เกรด',
    table: 'grading_scales',
    school: true,
    columns: ['name', 'min_score', 'max_score', 'display_grade'],
    search: ['name', 'display_grade'],
    fields: [
      f('name', 'ชื่อเกณฑ์', { default: 'เกณฑ์มาตรฐาน' }),
      f('min_score', 'คะแนนต่ำสุด', { type: 'number', min: 0, max: 100, step: '0.01' }),
      f('max_score', 'คะแนนสูงสุด', { type: 'number', min: 0, max: 100, step: '0.01' }),
      f('grade_value', 'ค่าเกรด', { type: 'number', min: 0, max: 4, step: '0.5' }),
      f('display_grade', 'เกรดที่แสดง'),
      f('sort_order', 'ลำดับ', { type: 'number', min: 0, default: 0 }),
    ],
  },
  characteristics: {
    title: 'เกณฑ์คุณลักษณะอันพึงประสงค์',
    singular: 'คุณลักษณะ',
    table: 'desirable_characteristics',
    school: true,
    columns: ['code', 'name', 'sort_order'],
    search: ['name', 'code'],
    fields: [
      f('code', 'รหัส'),
      f('name', 'ชื่อคุณลักษณะ'),
      f('sort_order', 'ลำดับ', { type: 'number', min: 0, default: 0 }),
    ],
  },
  reading: {
    title: 'เกณฑ์อ่านคิดวิเคราะห์เขียน',
    singular: 'หัวข้อประเมิน',
    table: 'reading_assessment_categories',
    school: true,
    columns: ['name', 'sort_order'],
    search: ['name'],
    fields: [f('name', 'หัวข้อประเมิน'), f('sort_order', 'ลำดับ', { type: 'number', min: 0, default: 0 })],
  },
};
export const studentCreateFields: Field[] = [
  ref('classroom_id', 'ชั้น / ห้องเรียน', 'open_classrooms'),
  f('student_number', 'เลขที่', { type: 'number', min: 1 }),
  ...modules.students.fields.filter((field) => field.key !== 'active'),
];
export function formSchema(fields: Field[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    let schema: z.ZodType;
    if (field.type === 'checkbox') schema = z.boolean();
    else if (field.type === 'number') {
      let num = z.number('กรุณากรอกตัวเลข').finite();
      if (field.min !== undefined) num = num.min(field.min);
      if (field.max !== undefined) num = num.max(field.max);
      schema = field.step ? num : num.int('กรุณากรอกจำนวนเต็ม');
    } else if (field.source) schema = z.uuid('กรุณาเลือกข้อมูล');
    else if (field.type === 'email') schema = z.email('อีเมลไม่ถูกต้อง');
    else if (field.type === 'date') schema = z.iso.date('วันที่ไม่ถูกต้อง');
    else if (field.type === 'url')
      schema = z.url('URL ไม่ถูกต้อง').refine((s) => s.startsWith('https://'), 'กรุณาใช้ HTTPS');
    else if (field.options) schema = z.enum(field.options.map((o) => o.value) as [string, ...string[]]);
    else
      schema = z
        .string()
        .trim()
        .min(field.required ? 1 : 0, `กรุณาระบุ${field.label}`)
        .max(field.type === 'textarea' ? 4000 : 250, 'ข้อความยาวเกินไป');
    shape[field.key] = field.required ? schema : z.union([schema, z.literal(''), z.null()]).optional();
  }
  return z.object(shape);
}
export const schoolFields: Field[] = [
  f('name', 'ชื่อโรงเรียน'),
  f('code', 'รหัสโรงเรียน', { required: false }),
  f('logo_url', 'URL โลโก้', { type: 'url', required: false }),
  f('address', 'ที่อยู่', { type: 'textarea', required: false }),
  f('phone', 'โทรศัพท์', { required: false }),
  f('director_name', 'ชื่อผู้อำนวยการ', { required: false }),
  f('education_area', 'เขตพื้นที่การศึกษา', { required: false }),
];
