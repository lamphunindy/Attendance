import type { AssignmentData } from '@/lib/data';
import { fullName } from '@/lib/utils';
import { RecordForm } from '@/components/admin/record-form';
import { editStudentBasics } from '@/lib/actions';
import { Empty } from '@/components/ui/states';
export function StudentRoster({ data: d, query }: { data: AssignmentData; query: string }) {
  const editable = d.isAdmin || d.settings.some((s) => s.key === 'teacher_edit_students' && s.value === true);
  const roster = d.enrollments.filter((e) => {
    const s = d.students.find((s) => s.id === e.student_id);
    return s && `${s.student_code} ${fullName(s)}`.includes(query);
  });
  return (
    <div className="stack">
      <div className="page-heading">
        <h2>รายชื่อนักเรียน</h2>
        <a className="button button-outline" href={`/api/export?assignment=${d.assignment.id}&kind=students`}>
          Export รายชื่อ Excel
        </a>
      </div>
      <form className="filter-bar">
        <label className="search">
          <span className="sr-only">ค้นหานักเรียน</span>
          <input name="q" defaultValue={query} placeholder="ค้นหารหัส ชื่อ หรือนามสกุล" />
        </label>
        <button className="button button-outline">ค้นหา</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>เลขที่</th>
              <th>รหัสนักเรียน</th>
              <th>ชื่อ–นามสกุล</th>
              <th>ชื่อเล่น</th>
              <th>สถานะ</th>
              {editable && <th>จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {roster.map((e) => {
              const s = d.students.find((s) => s.id === e.student_id)!;
              return (
                <tr key={e.id}>
                  <td>{e.student_number}</td>
                  <td>{s.student_code}</td>
                  <td>{fullName(s)}</td>
                  <td>{s.nickname || '—'}</td>
                  <td>
                    {
                      { active: 'กำลังเรียน', moved: 'ย้ายห้อง', withdrawn: 'ออก', graduated: 'จบการศึกษา' }[
                        e.status
                      ]
                    }
                  </td>
                  {editable && (
                    <td>
                      <RecordForm
                        title="แก้ไขข้อมูลพื้นฐาน"
                        edit
                        fields={[
                          { key: 'prefix', label: 'คำนำหน้า' },
                          { key: 'first_name', label: 'ชื่อ', required: true },
                          { key: 'last_name', label: 'นามสกุล', required: true },
                          { key: 'nickname', label: 'ชื่อเล่น' },
                        ]}
                        initial={s}
                        action={editStudentBasics.bind(null, s.id)}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!roster.length && <Empty text="ยังไม่มีนักเรียนในห้องนี้ หรือไม่พบคำค้น" />}
      </div>
    </div>
  );
}
