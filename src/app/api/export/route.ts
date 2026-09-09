import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireAssignment } from '@/lib/auth/session';
import { loadAssignment, fetchPages } from '@/lib/data';
import {
  assignmentWorkbook,
  workbook,
  sheet,
  studentTemplateWorkbook,
  safeFilename,
} from '@/lib/excel/workbook';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const kind = z
    .enum(['template', 'students', 'scores', 'attendance', 'results', 'pp5'])
    .safeParse(request.nextUrl.searchParams.get('kind'));
  if (!kind.success) return NextResponse.json({ error: 'ประเภทรายงานไม่ถูกต้อง' }, { status: 400 });
  const assignment = request.nextUrl.searchParams.get('assignment');
  let wb = workbook(),
    filename = 'นักเรียน.xlsx';
  if (assignment) {
    const s = await requireAssignment(assignment),
      d = await loadAssignment(assignment);
    wb = assignmentWorkbook(d, kind.data);
    filename = `PP5_${d.classroom.name}_${d.subject.name}_${d.year.year}_${d.term.term_number}_${kind.data}.xlsx`;
    const audit = await s.db.rpc('log_export', {
      p_school: d.school.id,
      p_assignment: assignment,
      p_kind: kind.data,
    });
    if (audit.error)
      return NextResponse.json({ error: 'ไม่สามารถบันทึกประวัติ Export ได้' }, { status: 500 });
  } else {
    const s = await requireAdmin();
    if (kind.data === 'template') {
      wb = studentTemplateWorkbook();
      filename = 'PP5_Student_Template.xlsx';
    } else if (kind.data === 'students') {
      const students = await fetchPages((from, to) =>
        s.db
          .from('students')
          .select('student_code,prefix,first_name,last_name,nickname,active')
          .eq('school_id', s.role.school_id)
          .order('student_code')
          .range(from, to),
      );
      sheet(
        wb,
        'นักเรียน',
        ['รหัสนักเรียน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'ชื่อเล่น', 'สถานะ'],
        students.map((s) => [
          s.student_code,
          s.prefix,
          s.first_name,
          s.last_name,
          s.nickname,
          s.active ? 'ใช้งาน' : 'ปิดใช้งาน',
        ]),
      );
    } else return NextResponse.json({ error: 'กรุณาเลือกรายวิชา' }, { status: 400 });
    const audit = await s.db.rpc('log_export', {
      p_school: s.role.school_id,
      p_assignment: null,
      p_kind: kind.data,
    });
    if (audit.error)
      return NextResponse.json({ error: 'ไม่สามารถบันทึกประวัติ Export ได้' }, { status: 500 });
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="PP5.xlsx"; filename*=UTF-8''${encodeURIComponent(safeFilename(filename))}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
