import type { AssignmentData } from '@/lib/data';
import { fullName, thaiDate } from '@/lib/utils';
import { attendanceSummary } from '@/lib/attendance';
import { calculateResults, transitionResults, setResultStatus } from '@/lib/actions';
import { ActionButton } from '@/components/ui/action-button';
import { RecordForm } from '@/components/admin/record-form';
export const workflowLabels = {
  draft: 'ฉบับร่าง',
  submitted: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  locked: 'ล็อกผลการเรียน',
} as const;
export function Summary({ data: d }: { data: AssignmentData }) {
  const workflow = d.assignment.workflow,
    editable = workflow === 'draft' && !d.year.archived_at;
  const min = Number(d.settings.find((s) => s.key === 'minimum_attendance_percentage')?.value ?? 80);
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h2>สรุปผลการเรียน</h2>
          <p className="muted">คำนวณจากข้อมูลที่บันทึกในฐานข้อมูล และตรวจสอบก่อนยืนยัน</p>
        </div>
        <span className="badge">{workflowLabels[workflow]}</span>
      </div>
      <div className="card stack">
        <div className="actions">
          {editable && (
            <>
              <ActionButton action={calculateResults.bind(null, d.assignment.id)}>
                คำนวณ / บันทึกฉบับร่าง
              </ActionButton>
              <ActionButton
                action={transitionResults.bind(null, d.assignment.id, 'submitted')}
                confirm="ยืนยันส่งผลการเรียนให้ผู้ดูแลตรวจสอบ? หลังส่งครูจะไม่สามารถแก้ไขได้จนกว่าผู้ดูแลจะเปิดแก้ไข"
              >
                ยืนยันผลการเรียน
              </ActionButton>
            </>
          )}
          {d.isAdmin && workflow === 'submitted' && (
            <ActionButton
              action={transitionResults.bind(null, d.assignment.id, 'approved')}
              confirm="ตรวจสอบคะแนนและผลประเมินครบแล้ว และต้องการอนุมัติผลการเรียน?"
            >
              อนุมัติผลการเรียน
            </ActionButton>
          )}
          {d.isAdmin && workflow === 'approved' && (
            <ActionButton
              action={transitionResults.bind(null, d.assignment.id, 'locked')}
              confirm="ล็อกผลการเรียนรายวิชานี้? การแก้ไขภายหลังต้องปลดล็อกและระบุเหตุผล"
            >
              ล็อกผลการเรียน
            </ActionButton>
          )}
          {d.isAdmin && workflow !== 'draft' && (
            <ActionButton
              variant="outline"
              action={transitionResults.bind(null, d.assignment.id, 'draft')}
              reason
              confirm="เปิดแก้ไขผลการเรียนอีกครั้ง กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร เหตุผลจะถูกบันทึกใน Audit Log"
            >
              ปลดล็อก / ส่งกลับแก้ไข
            </ActionButton>
          )}
        </div>
        {d.assignment.workflow_note && <p className="notice">หมายเหตุ: {d.assignment.workflow_note}</p>}
        <p className="small muted">ระบบไม่กำหนด ร หรือ มส อัตโนมัติ ครูต้องเลือกและยืนยันพร้อมเหตุผลเอง</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>ชื่อ–นามสกุล</th>
              <th>คะแนนรวม</th>
              <th>เกรด</th>
              <th>เวลาเรียน</th>
              <th>สถานะผล</th>
              <th>คำนวณล่าสุด</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {d.enrollments.map((e) => {
              const result = d.finals.find((r) => r.enrollment_id === e.id),
                student = d.students.find((s) => s.id === e.student_id);
              const attendance = attendanceSummary(
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
                  <td>{result?.total_score ?? 'ยังไม่คำนวณ'}</td>
                  <td>
                    <span className="badge">{result?.grade ?? '—'}</span>
                  </td>
                  <td>
                    <span
                      className={`badge ${attendance.total && attendance.percentage < min ? 'amber' : 'green'}`}
                    >
                      {attendance.percentage}%
                    </span>
                  </td>
                  <td>
                    {result?.result_status === 'normal' ? 'ปกติ' : result?.result_status || '—'}
                    {result?.teacher_note && <p className="small muted">{result.teacher_note}</p>}
                  </td>
                  <td>{result ? thaiDate(result.calculated_at) : '—'}</td>
                  <td>
                    {editable && result && (
                      <RecordForm
                        title="กำหนดสถานะผลการเรียน"
                        confirm
                        fields={[
                          {
                            key: 'enrollment_id',
                            label: 'นักเรียน',
                            type: 'select',
                            required: true,
                            options: [
                              { value: e.id, label: student ? fullName(student) : String(e.student_number) },
                            ],
                          },
                          {
                            key: 'status',
                            label: 'สถานะ',
                            type: 'select',
                            required: true,
                            options: ['normal', 'ร', 'มส', 'ผ', 'มผ'].map((s) => ({
                              value: s,
                              label: s === 'normal' ? 'ปกติ' : s,
                            })),
                          },
                          { key: 'note', label: 'เหตุผล / หมายเหตุ', type: 'textarea', required: false },
                        ]}
                        initial={{
                          enrollment_id: e.id,
                          status: result.result_status,
                          note: result.teacher_note || '',
                        }}
                        action={setResultStatus.bind(null, d.assignment.id)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
