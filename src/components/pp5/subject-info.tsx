import type { AssignmentData } from '@/lib/data';
export function SubjectInfo({ data: d }: { data: AssignmentData }) {
  const fields = [
    ['โรงเรียน', d.school.name],
    ['ปีการศึกษา', d.year.year],
    ['ภาคเรียน', d.term.name],
    ['ชั้น / ห้อง', d.classroom.name],
    ['รหัสวิชา', d.subject.subject_code],
    ['ชื่อรายวิชา', d.subject.name],
    ['ครูผู้สอน', d.teacher.full_name],
    ['กลุ่มสาระ', d.subject.subject_group || '—'],
    ['จำนวนชั่วโมง', `${d.subject.hours_per_term} ชั่วโมง`],
    ['หน่วยกิต', d.subject.credits],
  ];
  return (
    <section className="card stack">
      <h2>ข้อมูลรายวิชา</h2>
      <dl className="info-grid">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {d.subject.description && (
        <div>
          <h3>คำอธิบายรายวิชา</h3>
          <p className="muted mt-2 whitespace-pre-line">{d.subject.description}</p>
        </div>
      )}
    </section>
  );
}
