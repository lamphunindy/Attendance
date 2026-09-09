import 'server-only';
import ExcelJS from 'exceljs';
import type { AssignmentData } from '@/lib/data';
import { fullName } from '@/lib/utils';
import { attendanceSummary } from '@/lib/attendance';
export const importColumns = [
  'student_code',
  'student_number',
  'prefix',
  'first_name',
  'last_name',
  'nickname',
] as const;
export function workbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ระบบ ปพ.5 ออนไลน์';
  wb.created = new Date();
  return wb;
}
export function sheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: (string | number | null)[][],
) {
  const ws = wb.addWorksheet(name);
  ws.addRow(headers);
  rows.forEach((row) => ws.addRow(row));
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Noto Sans Thai' };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  ws.getRow(1).height = 28;
  ws.columns.forEach((c, i) => {
    c.width = i === 2 ? 32 : Math.max(14, Math.min(28, (headers[i]?.length || 10) + 4));
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return ws;
}
export function studentTemplateWorkbook() {
  const wb = workbook();
  const entry = sheet(wb, 'นักเรียน', [...importColumns], []);
  entry.getColumn(1).numFmt = '@';
  const labels = [
    'รหัสนักเรียน (เก็บเลขศูนย์นำหน้า)',
    'เลขที่ในห้อง (จำนวนเต็มมากกว่า 0)',
    'คำนำหน้า เช่น ด.ช. ด.ญ. นาย นางสาว',
    'ชื่อ',
    'นามสกุล',
    'ชื่อเล่น (ไม่บังคับ)',
  ];
  labels.forEach((label, i) => {
    entry.getCell(1, i + 1).note = label;
  });
  sheet(
    wb,
    'ตัวอย่าง',
    [...importColumns],
    [
      ['00001', 1, 'ด.ช.', 'นักเรียนตัวอย่าง', 'คนที่หนึ่ง', 'หนึ่ง'],
      ['00002', 2, 'ด.ญ.', 'นักเรียนตัวอย่าง', 'คนที่สอง', 'สอง'],
    ],
  );
  sheet(
    wb,
    'วิธีกรอก',
    ['รายการ', 'คำแนะนำ'],
    [
      ['กรอกข้อมูล', 'กรอกในชีตนักเรียนเท่านั้น ห้ามเปลี่ยนชื่อหรือเรียงคอลัมน์ใหม่'],
      ['ชั้น / ห้องเรียน', 'เลือกห้องปลายทางในหน้าอัปโหลด ใช้ห้องเดียวกันทั้งไฟล์'],
      ['เลขที่', 'กรอก student_number เป็นจำนวนเต็มบวก ห้ามซ้ำในห้อง'],
      ['รหัสนักเรียน', 'กรอกเป็นข้อความเพื่อเก็บเลขศูนย์นำหน้า ห้ามซ้ำในโรงเรียน'],
      ['ชีตตัวอย่าง', 'ข้อมูลสมมุติสำหรับดูวิธีกรอก ระบบไม่นำเข้าชีตนี้'],
      ['จำนวนรายการ', 'รองรับสูงสุด 500 คนต่อไฟล์ ไฟล์ .xlsx ไม่เกิน 3 MB'],
      ['ก่อนบันทึก', 'ตรวจ Preview และแก้ข้อผิดพลาดทุกแถวก่อนยืนยันนำเข้า'],
    ],
  );
  return wb;
}
export function assignmentWorkbook(d: AssignmentData, kind: string) {
  const wb = workbook(),
    items = d.items.filter((i) => i.active);
  const roster = d.enrollments.map((e) => ({ e, s: d.students.find((s) => s.id === e.student_id)! }));
  sheet(
    wb,
    'ข้อมูลรายวิชา',
    ['รายการ', 'ข้อมูล'],
    [
      ['โรงเรียน', d.school.name],
      ['ปีการศึกษา', d.year.year],
      ['ภาคเรียน', d.term.term_number],
      ['ห้อง', d.classroom.name],
      ['รหัสวิชา', d.subject.subject_code],
      ['รายวิชา', d.subject.name],
      ['ครู', d.teacher.full_name],
      ['สถานะ', d.assignment.workflow],
    ],
  );
  if (kind === 'students' || kind === 'pp5')
    sheet(
      wb,
      'รายชื่อนักเรียน',
      ['เลขที่', 'รหัสนักเรียน', 'ชื่อ–นามสกุล', 'ชื่อเล่น', 'สถานะ'],
      roster.map(({ e, s }) => [e.student_number, s.student_code, fullName(s), s.nickname, e.status]),
    );
  if (kind === 'scores' || kind === 'pp5')
    sheet(
      wb,
      'คะแนน',
      [
        'เลขที่',
        'รหัสนักเรียน',
        'ชื่อ–นามสกุล',
        ...items.map((i) => `${i.title} (${i.max_score})`),
        'รวมที่คำนวณแล้ว',
        'เกรด',
      ],
      roster.map(({ e, s }) => {
        const f = d.finals.find((r) => r.enrollment_id === e.id);
        return [
          e.student_number,
          s.student_code,
          fullName(s),
          ...items.map(
            (i) => d.scores.find((r) => r.enrollment_id === e.id && r.score_item_id === i.id)?.score ?? null,
          ),
          f?.total_score ?? null,
          f?.grade ?? null,
        ];
      }),
    );
  if (kind === 'attendance' || kind === 'pp5')
    sheet(
      wb,
      'เวลาเรียน',
      [
        'เลขที่',
        'รหัสนักเรียน',
        'ชื่อ–นามสกุล',
        'ทั้งหมด',
        'มา',
        'สาย',
        'ลา',
        'ป่วย',
        'ขาด',
        'ยังไม่บันทึก',
        'เข้าเรียน',
        'ร้อยละ',
      ],
      roster.map(({ e, s }) => {
        const a = attendanceSummary(
          d.sessions.map((t) => ({
            hours: t.hours,
            status:
              d.records.find((r) => r.enrollment_id === e.id && r.attendance_session_id === t.id)?.status ||
              null,
          })),
        );
        return [
          e.student_number,
          s.student_code,
          fullName(s),
          a.total,
          a.present,
          a.late,
          a.leave,
          a.sick,
          a.absent,
          a.unrecorded,
          a.attended,
          a.percentage,
        ];
      }),
    );
  if (kind === 'results' || kind === 'pp5')
    sheet(
      wb,
      'ผลการเรียน',
      ['เลขที่', 'รหัสนักเรียน', 'ชื่อ–นามสกุล', 'คะแนนรวม', 'เกรด', 'สถานะผล', 'หมายเหตุ'],
      roster.map(({ e, s }) => {
        const f = d.finals.find((r) => r.enrollment_id === e.id);
        return [
          e.student_number,
          s.student_code,
          fullName(s),
          f?.total_score ?? null,
          f?.grade ?? null,
          f?.result_status ?? null,
          f?.teacher_note ?? null,
        ];
      }),
    );
  if (kind === 'pp5') {
    sheet(
      wb,
      'ตัวชี้วัด',
      ['เลขที่', 'รหัสนักเรียน', 'ชื่อ–นามสกุล', ...d.indicators.map((i) => i.code)],
      roster.map(({ e, s }) => [
        e.student_number,
        s.student_code,
        fullName(s),
        ...d.indicators.map(
          (i) =>
            d.indicatorResults.find((r) => r.enrollment_id === e.id && r.learning_indicator_id === i.id)
              ?.result ?? null,
        ),
      ]),
    );
    sheet(
      wb,
      'คุณลักษณะ',
      ['เลขที่', 'รหัสนักเรียน', 'ชื่อ–นามสกุล', ...d.characteristics.map((i) => i.name)],
      roster.map(({ e, s }) => [
        e.student_number,
        s.student_code,
        fullName(s),
        ...d.characteristics.map(
          (i) =>
            d.characteristicResults.find((r) => r.enrollment_id === e.id && r.characteristic_id === i.id)
              ?.level ?? null,
        ),
      ]),
    );
    sheet(
      wb,
      'อ่านคิดวิเคราะห์เขียน',
      ['เลขที่', 'รหัสนักเรียน', 'ชื่อ–นามสกุล', ...d.reading.map((i) => i.name)],
      roster.map(({ e, s }) => [
        e.student_number,
        s.student_code,
        fullName(s),
        ...d.reading.map(
          (i) =>
            d.readingResults.find((r) => r.enrollment_id === e.id && r.category_id === i.id)?.level ?? null,
        ),
      ]),
    );
  }
  return wb;
}
export function safeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 160);
}
