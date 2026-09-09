import { z } from 'zod';
export const uuid = z.uuid('รหัสอ้างอิงไม่ถูกต้อง');
export const email = z.email('กรุณาระบุอีเมลที่ถูกต้อง').transform((s) => s.trim().toLowerCase());
export const scoreSchema = (max: number) =>
  z
    .number('กรุณากรอกตัวเลข')
    .finite()
    .min(0, 'คะแนนต้องไม่น้อยกว่า 0')
    .max(max, `คะแนนต้องไม่เกิน ${max} คะแนน`)
    .nullable();
export const studentImportSchema = z.object({
  student_code: z.string().trim().min(1, 'กรุณาระบุรหัสนักเรียน').max(30),
  student_number: z.coerce.number().int('เลขที่ต้องเป็นจำนวนเต็ม').positive('เลขที่ต้องมากกว่า 0'),
  prefix: z.string().trim().max(30).default(''),
  first_name: z.string().trim().min(1, 'กรุณาระบุชื่อ').max(100),
  last_name: z.string().trim().min(1, 'กรุณาระบุนามสกุล').max(100),
  nickname: z.string().trim().max(100).default(''),
});
export type ImportedStudent = z.infer<typeof studentImportSchema>;
export function validateImport(rows: unknown[], codes: string[] = [], numbers: number[] = []) {
  const seenCodes = new Set(codes),
    seenNumbers = new Set(numbers),
    valid: ImportedStudent[] = [],
    errors: { row: number; message: string }[] = [];
  if (rows.length === 0 || rows.length > 500) errors.push({ row: 0, message: 'รองรับครั้งละ 1–500 คน' });
  rows.forEach((row, i) => {
    const parsed = studentImportSchema.safeParse(row);
    if (!parsed.success) {
      errors.push({ row: i + 2, message: parsed.error.issues.map((x) => x.message).join(', ') });
      return;
    }
    const s = parsed.data;
    if (seenCodes.has(s.student_code)) errors.push({ row: i + 2, message: 'รหัสนักเรียนซ้ำ' });
    if (seenNumbers.has(s.student_number)) errors.push({ row: i + 2, message: 'เลขที่ซ้ำ' });
    seenCodes.add(s.student_code);
    seenNumbers.add(s.student_number);
    valid.push(s);
  });
  return { rows: valid, errors };
}
