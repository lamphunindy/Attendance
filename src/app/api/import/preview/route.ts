import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAdmin } from '@/lib/auth/session';
import { uuid, validateImport } from '@/lib/validations';
import { importColumns } from '@/lib/excel/workbook';
import { fetchPages } from '@/lib/data';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const s = await requireAdmin();
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin)
    return NextResponse.json({ error: 'คำขอไม่ถูกต้อง' }, { status: 403 });
  const form = await request.formData(),
    file = form.get('file'),
    classroom = uuid.safeParse(form.get('classroom'));
  if (
    !(file instanceof File) ||
    !classroom.success ||
    file.size > 3 * 1024 * 1024 ||
    !file.name.endsWith('.xlsx')
  )
    return NextResponse.json({ error: 'กรุณาเลือกห้องเรียนและไฟล์ .xlsx ขนาดไม่เกิน 3 MB' }, { status: 400 });
  const c = await s.db
    .from('classrooms')
    .select('id')
    .eq('id', classroom.data)
    .eq('school_id', s.role.school_id)
    .single();
  if (c.error) return NextResponse.json({ error: 'ไม่พบห้องเรียน' }, { status: 403 });
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws || ws.rowCount > 501)
      return NextResponse.json({ error: 'ไฟล์ต้องมีนักเรียนไม่เกิน 500 แถว' }, { status: 400 });
    const headers = importColumns.map((_, i) => ws.getCell(1, i + 1).text.trim());
    if (headers.join(',') !== importColumns.join(','))
      return NextResponse.json(
        { error: 'คอลัมน์ไม่ตรงกับ Template กรุณาดาวน์โหลด Template ใหม่' },
        { status: 400 },
      );
    const rows: Record<string, unknown>[] = [];
    for (let n = 2; n <= ws.rowCount; n++) {
      const row: Record<string, unknown> = {};
      importColumns.forEach((col, i) => {
        const cell = ws.getCell(n, i + 1);
        if (cell.type === ExcelJS.ValueType.Formula) throw new Error('formula');
        row[col] = cell.text;
      });
      rows.push(row);
    }
    const codes = await fetchPages((from, to) =>
      s.db
        .from('students')
        .select('student_code')
        .eq('school_id', s.role.school_id)
        .order('id')
        .range(from, to),
    );
    const numbers = await s.db
      .from('enrollments')
      .select('student_number')
      .eq('classroom_id', classroom.data);
    if (numbers.error) throw numbers.error;
    return NextResponse.json(
      validateImport(
        rows,
        codes.map((s) => s.student_code),
        numbers.data.map((e) => e.student_number),
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'อ่านไฟล์ไม่ได้ กรุณาใช้ Template และใส่ค่าโดยไม่มีสูตร Excel' },
      { status: 400 },
    );
  }
}
