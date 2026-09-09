import { loadAssignment } from '@/lib/data';
import { fullName } from '@/lib/utils';
import { attendanceSummary } from '@/lib/attendance';
import { PrintControls } from '@/components/pp5/print-controls';
import { workflowLabels } from '@/components/pp5/summary';
export default async function Print({ params }: { params: Promise<{ teacherAssignmentId: string }> }) {
  const d = await loadAssignment((await params).teacherAssignmentId);
  const header = (
    <>
      <h1>แบบบันทึกผลการพัฒนาคุณภาพผู้เรียน (ปพ.5)</h1>
      <p className="text-center font-semibold text-base mt-2">{d.school.name}</p>
      <p className="text-center">
        {d.subject.subject_code} {d.subject.name} · ชั้น {d.classroom.name} · ปีการศึกษา {d.year.year}{' '}
        ภาคเรียน {d.term.term_number}
      </p>
      <p className="text-center">
        ครูผู้สอน {d.teacher.full_name} · {d.subject.hours_per_term} ชั่วโมง · {d.subject.credits} หน่วยกิต ·{' '}
        {workflowLabels[d.assignment.workflow]}
      </p>
    </>
  );
  const roster = d.enrollments.map((e) => ({ e, s: d.students.find((s) => s.id === e.student_id)! }));
  return (
    <div className="stack">
      <PrintControls id={d.assignment.id} />
      <article className="print-report">
        {header}
        <h2 className="mt-6 mb-3">สรุปคะแนนและผลการเรียน</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>รหัสนักเรียน</th>
                <th>ชื่อ–นามสกุล</th>
                {d.categories.map((c) => (
                  <th key={c.id}>
                    {c.name}
                    <br />({c.weight})
                  </th>
                ))}
                <th>รวม</th>
                <th>เกรด</th>
                <th>ผล</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {roster.map(({ e, s }) => {
                const f = d.finals.find((f) => f.enrollment_id === e.id);
                return (
                  <tr key={e.id}>
                    <td>{e.student_number}</td>
                    <td>{s.student_code}</td>
                    <td className="whitespace-nowrap">{fullName(s)}</td>
                    {d.categories.map((c) => {
                      const ids = d.items
                        .filter((i) => i.score_category_id === c.id && i.active)
                        .map((i) => i.id);
                      const sum = d.scores
                        .filter((r) => r.enrollment_id === e.id && ids.includes(r.score_item_id))
                        .reduce((n, r) => n + r.score, 0);
                      return <td key={c.id}>{((sum / c.max_score) * c.weight).toFixed(2)}</td>;
                    })}
                    <td>{f?.total_score ?? '—'}</td>
                    <td>{f?.grade ?? '—'}</td>
                    <td>{f?.result_status === 'normal' ? 'ปกติ' : f?.result_status || '—'}</td>
                    <td>{f?.teacher_note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <section className="print-section">
          {header}
          <h2 className="mt-6 mb-3">สรุปเวลาเรียน (ชั่วโมง)</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ชื่อ–นามสกุล</th>
                  <th>ทั้งหมด</th>
                  <th>มา</th>
                  <th>สาย</th>
                  <th>ลา</th>
                  <th>ป่วย</th>
                  <th>ขาด</th>
                  <th>ยังไม่บันทึก</th>
                  <th>เข้าเรียน</th>
                  <th>ร้อยละ</th>
                </tr>
              </thead>
              <tbody>
                {roster.map(({ e, s }) => {
                  const a = attendanceSummary(
                    d.sessions.map((t) => ({
                      hours: t.hours,
                      status:
                        d.records.find((r) => r.enrollment_id === e.id && r.attendance_session_id === t.id)
                          ?.status || null,
                    })),
                  );
                  return (
                    <tr key={e.id}>
                      <td>{e.student_number}</td>
                      <td>{fullName(s)}</td>
                      {[
                        a.total,
                        a.present,
                        a.late,
                        a.leave,
                        a.sick,
                        a.absent,
                        a.unrecorded,
                        a.attended,
                        a.percentage,
                      ].map((v, i) => (
                        <td key={i}>{v}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        {(['indicators', 'reading', 'characteristics'] as const).map((kind) => {
          const categories =
            kind === 'indicators'
              ? d.indicators.map((i) => ({ id: i.id, name: i.code }))
              : kind === 'reading'
                ? d.reading
                : d.characteristics;
          return (
            <section className="print-section" key={kind}>
              {header}
              <h2 className="mt-6 mb-3">
                {kind === 'indicators'
                  ? 'ผลการประเมินตัวชี้วัด'
                  : kind === 'reading'
                    ? 'ผลการประเมินอ่านคิดวิเคราะห์เขียน'
                    : 'ผลการประเมินคุณลักษณะอันพึงประสงค์'}
              </h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>เลขที่</th>
                      <th>ชื่อ–นามสกุล</th>
                      {categories.map((c) => (
                        <th key={c.id} className="!whitespace-normal">
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map(({ e, s }) => (
                      <tr key={e.id}>
                        <td>{e.student_number}</td>
                        <td className="whitespace-nowrap">{fullName(s)}</td>
                        {categories.map((c) => {
                          const result =
                            kind === 'indicators'
                              ? d.indicatorResults.find(
                                  (r) => r.enrollment_id === e.id && r.learning_indicator_id === c.id,
                                )?.result
                              : kind === 'reading'
                                ? d.readingResults.find(
                                    (r) => r.enrollment_id === e.id && r.category_id === c.id,
                                  )?.level
                                : d.characteristicResults.find(
                                    (r) => r.enrollment_id === e.id && r.characteristic_id === c.id,
                                  )?.level;
                          return (
                            <td key={c.id}>
                              {typeof result === 'string'
                                ? { excellent: 'ดีเยี่ยม', good: 'ดี', pass: 'ผ่าน', improve: 'ปรับปรุง' }[
                                    result
                                  ]
                                : (result ?? '—')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small mt-3">ระดับ 3 = ดีเยี่ยม · 2 = ดี · 1 = ผ่าน · 0 = ไม่ผ่าน / ปรับปรุง</p>
              {kind === 'indicators' &&
                d.indicators.map((i) => (
                  <p className="small" key={i.id}>
                    {i.code}: {i.description}
                  </p>
                ))}
            </section>
          );
        })}
        <div className="info-grid mt-12 text-center">
          <div>
            ลงชื่อ ........................................ ครูผู้สอน<p>({d.teacher.full_name})</p>
            <p>วันที่ ........ / ........ / ........</p>
          </div>
          <div>
            ลงชื่อ ........................................ ผู้อนุมัติ
            <p>({d.school.director_name || '........................................'})</p>
            <p>ผู้อำนวยการโรงเรียน</p>
          </div>
        </div>
      </article>
    </div>
  );
}
