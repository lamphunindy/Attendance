'use client';
import { useState, useTransition } from 'react';
import { Save, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { AssignmentData } from '@/lib/data';
import { bangkokToday, fullName } from '@/lib/utils';
import { attendanceLabels, type AttendanceStatus, attendanceSummary } from '@/lib/attendance';
import { saveAttendance } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { useUnsaved } from '@/components/scores/unsaved';
import { Empty } from '@/components/ui/states';
export function AttendanceEditor({ data: d }: { data: AssignmentData }) {
  const initialDate = bangkokToday(),
    [date, setDate] = useState(initialDate),
    [period, setPeriod] = useState(1),
    [hours, setHours] = useState(
      d.sessions.find((s) => s.attendance_date === initialDate && s.period_number === 1)?.hours || 1,
    ),
    [topic, setTopic] = useState(
      d.sessions.find((s) => s.attendance_date === initialDate && s.period_number === 1)?.topic || '',
    ),
    [changes, setChanges] = useState<Record<string, AttendanceStatus>>({}),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [dirty, setDirty] = useState(false),
    [pending, start] = useTransition();
  useUnsaved(dirty);
  const editable = d.assignment.workflow === 'draft' && !d.year.archived_at;
  const session = d.sessions.find((s) => s.attendance_date === date && s.period_number === period);
  const enrollments = d.enrollments.filter(
    (e) =>
      e.status === 'active' ||
      d.records.some((r) => r.attendance_session_id === session?.id && r.enrollment_id === e.id),
  );
  const status = (id: string) =>
    (changes[id] ||
      d.records.find((r) => r.attendance_session_id === session?.id && r.enrollment_id === id)?.status ||
      'present') as AttendanceStatus;
  const note = (id: string) =>
    notes[id] ??
    d.records.find((r) => r.attendance_session_id === session?.id && r.enrollment_id === id)?.note ??
    '';
  function switchSession(nextDate: string, nextPeriod: number) {
    if (dirty && !window.confirm('มีข้อมูลยังไม่บันทึก เปลี่ยนวัน/คาบเรียนหรือไม่?')) return;
    const next = d.sessions.find((s) => s.attendance_date === nextDate && s.period_number === nextPeriod);
    setDate(nextDate);
    setPeriod(nextPeriod);
    setHours(next?.hours || 1);
    setTopic(next?.topic || '');
    setChanges({});
    setNotes({});
    setDirty(false);
  }
  function save() {
    start(async () => {
      const r = await saveAttendance(d.assignment.id, {
        date,
        period,
        hours,
        topic,
        rows: enrollments.map((e) => ({ enrollment_id: e.id, status: status(e.id), note: note(e.id) })),
      });
      if (r.error) toast.error(r.error);
      else {
        toast.success(r.success);
        setDirty(false);
      }
    });
  }
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h2>เช็กชื่อเข้าเรียน</h2>
          <p className="muted">เลือกสถานะของนักเรียน แล้วบันทึกทั้งหมด</p>
        </div>
        <span className={`badge ${session ? 'green' : 'amber'}`}>
          {session ? 'มีบันทึกแล้ว' : 'ยังไม่ได้บันทึก'}
        </span>
      </div>
      <div className="card filter-bar">
        <label>
          วันที่
          <input
            type="date"
            min={d.term.start_date}
            max={d.term.end_date}
            value={date}
            onChange={(e) => switchSession(e.target.value, period)}
          />
        </label>
        <label>
          คาบที่
          <input
            type="number"
            min={1}
            value={period}
            onChange={(e) => switchSession(date, Number(e.target.value))}
          />
        </label>
        <label>
          จำนวนชั่วโมง
          <input
            type="number"
            min={0.25}
            max={12}
            step={0.25}
            value={hours}
            disabled={!editable}
            onChange={(e) => {
              setHours(Number(e.target.value));
              setDirty(true);
            }}
          />
        </label>
        <label className="search">
          หัวข้อที่สอน
          <input
            value={topic}
            disabled={!editable}
            onChange={(e) => {
              setTopic(e.target.value);
              setDirty(true);
            }}
          />
        </label>
      </div>
      <div className="page-heading">
        <span className="muted">
          นักเรียน {enrollments.length} คน · มา {enrollments.filter((e) => status(e.id) === 'present').length}{' '}
          คน
        </span>
        <Button
          variant="outline"
          disabled={!editable}
          onClick={() => {
            setChanges(Object.fromEntries(enrollments.map((e) => [e.id, 'present'])));
            setDirty(true);
          }}
        >
          <CheckCheck size={18} />
          ทุกคนมาเรียน
        </Button>
      </div>
      <div className="card !p-0">
        {enrollments.length ? (
          enrollments.map((e) => {
            const student = d.students.find((s) => s.id === e.student_id);
            if (!student) return null;
            return (
              <div key={e.id} className="student-card">
                <div className="student-identity">
                  <span className="number-dot">{e.student_number}</span>
                  <div>
                    <strong>{fullName(student)}</strong>
                    <p className="small muted">{student.student_code}</p>
                  </div>
                </div>
                <div className="attendance-options" role="group" aria-label={`สถานะ ${fullName(student)}`}>
                  {Object.entries(attendanceLabels).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      data-status={value}
                      className={status(e.id) === value ? 'selected' : ''}
                      aria-pressed={status(e.id) === value}
                      disabled={!editable}
                      onClick={() => {
                        setChanges((c) => ({ ...c, [e.id]: value as AttendanceStatus }));
                        setDirty(true);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="w-full small muted">
                  หมายเหตุ
                  <input
                    value={note(e.id)}
                    disabled={!editable}
                    maxLength={1000}
                    onChange={(v) => {
                      setNotes((n) => ({ ...n, [e.id]: v.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
              </div>
            );
          })
        ) : (
          <Empty text="ยังไม่มีนักเรียนในห้องนี้" />
        )}
      </div>
      {editable && enrollments.length > 0 && (
        <div className="save-bar">
          <span className={dirty ? 'text-amber-700' : 'muted'}>
            {dirty ? 'มีข้อมูลที่ยังไม่บันทึก' : 'ตรวจสอบข้อมูลก่อนบันทึก'}
          </span>
          <Button onClick={save} disabled={pending}>
            <Save size={18} />
            {pending ? 'กำลังบันทึก…' : 'บันทึกทั้งหมด'}
          </Button>
        </div>
      )}
      <h2>สรุปเวลาเรียน (ชั่วโมง)</h2>
      <AttendanceTable data={d} />
    </div>
  );
}
export function AttendanceTable({ data: d }: { data: AssignmentData }) {
  const min = Number(d.settings.find((s) => s.key === 'minimum_attendance_percentage')?.value ?? 80);
  return (
    <>
      <p className="small muted">
        นับ “มา” และ “สาย” เป็นชั่วโมงเข้าเรียน · เกณฑ์ขั้นต่ำ {min}% · ไม่กำหนด มส อัตโนมัติ
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>ชื่อ–นามสกุล</th>
              <th>ทั้งหมด</th>
              {Object.values(attendanceLabels).map((l) => (
                <th key={l}>{l}</th>
              ))}
              <th>ยังไม่บันทึก</th>
              <th>เข้าเรียน</th>
              <th>ร้อยละ</th>
            </tr>
          </thead>
          <tbody>
            {d.enrollments.map((e) => {
              const student = d.students.find((s) => s.id === e.student_id);
              const summary = attendanceSummary(
                d.sessions.map((s) => ({
                  hours: s.hours,
                  status:
                    d.records.find((r) => r.attendance_session_id === s.id && r.enrollment_id === e.id)
                      ?.status || null,
                })),
              );
              return (
                <tr key={e.id}>
                  <td>{e.student_number}</td>
                  <td className="whitespace-nowrap">{student && fullName(student)}</td>
                  <td>{summary.total}</td>
                  {Object.keys(attendanceLabels).map((k) => (
                    <td key={k}>{summary[k as AttendanceStatus]}</td>
                  ))}
                  <td>{summary.unrecorded}</td>
                  <td>{summary.attended}</td>
                  <td>
                    <span
                      className={`badge ${summary.total && summary.percentage < min ? 'amber' : 'green'}`}
                    >
                      {summary.percentage}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
