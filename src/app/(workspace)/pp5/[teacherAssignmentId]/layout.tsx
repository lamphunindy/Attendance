import Link from 'next/link';
import { loadAssignment } from '@/lib/data';
import { PP5Tabs } from '@/components/pp5/tabs';
import { workflowLabels } from '@/components/pp5/summary';
export default async function PP5Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teacherAssignmentId: string }>;
}) {
  const d = await loadAssignment((await params).teacherAssignmentId);
  return (
    <div className="stack">
      <div className="no-print stack">
        <div className="small muted">
          <Link href="/classrooms">ห้องเรียน</Link> / {d.classroom.name} / ปพ.5
        </div>
        <div className="page-heading">
          <div>
            <div className="eyebrow">บันทึกผลการเรียนรายวิชา</div>
            <h1>
              {d.subject.name} <span className="text-blue-600">{d.classroom.name}</span>
            </h1>
            <p className="muted">
              {d.subject.subject_code} · ปีการศึกษา {d.year.year} · {d.term.name} · {d.teacher.full_name}
            </p>
          </div>
          <span className="badge">{workflowLabels[d.assignment.workflow]}</span>
        </div>
        {(d.assignment.workflow !== 'draft' || d.year.archived_at) && (
          <div className="notice warning">
            {d.year.archived_at ? 'ปีการศึกษานี้เก็บเข้าคลังแล้ว' : 'ผลการเรียนผ่านการยืนยันแล้ว'}{' '}
            สามารถดูและพิมพ์ได้ การแก้ไขต้องให้ผู้ดูแลเปิดสิทธิ์ตามขั้นตอน
          </div>
        )}
        <PP5Tabs id={d.assignment.id} />
      </div>
      {children}
    </div>
  );
}
