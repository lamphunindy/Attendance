import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/session';
import { skipSetup } from '@/lib/actions';
import { ActionButton } from '@/components/ui/action-button';
export default async function Setup() {
  const s = await requireAdmin();
  const sid = s.role.school_id;
  const r = await Promise.all([
    s.db.from('schools').select('name,address').eq('id', sid).single(),
    s.db.from('academic_years').select('id', { count: 'exact', head: true }).eq('school_id', sid),
    s.db.from('terms').select('id', { count: 'exact', head: true }),
    s.db.from('classrooms').select('id', { count: 'exact', head: true }).eq('school_id', sid),
    s.db.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', sid),
    s.db.from('teacher_invitations').select('id', { count: 'exact', head: true }).eq('school_id', sid),
    s.db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', sid),
  ]);
  for (const v of r) if (v.error) throw v.error;
  const steps = [
    ['ข้อมูลโรงเรียน', 'settings', Boolean(r[0].data?.address)],
    ['ปีการศึกษา', 'academic-years', Boolean(r[1].count)],
    ['ภาคเรียน', 'terms', Boolean(r[2].count)],
    ['ห้องเรียน', 'classrooms', Boolean(r[3].count)],
    ['รายวิชา', 'subjects', Boolean(r[4].count)],
    ['เชิญครู', 'teachers', Boolean(r[5].count)],
    ['เพิ่มนักเรียน / Import Excel', 'import', Boolean(r[6].count)],
  ] as const;
  return (
    <div className="stack max-w-3xl">
      <h1>เริ่มต้นตั้งค่าโรงเรียน</h1>
      <p className="muted">ทำตามลำดับด้านล่างแล้วกลับมาดูความคืบหน้าได้ทุกเมื่อ</p>
      <div className="card setup-steps">
        {steps.map(([title, path, done], i) => (
          <Link className="setup-step" key={path} href={`/admin/${path}`}>
            <span className="number-dot">{done ? <Check size={19} /> : i + 1}</span>
            <span className="flex-1">{title}</span>
            {done && <span className="badge green">มีข้อมูลแล้ว</span>}
            <ArrowRight size={18} />
          </Link>
        ))}
      </div>
      <div className="notice">
        เมื่อครูรับคำเชิญแล้ว ไปที่{' '}
        <Link className="underline" href="/admin/assignments">
          มอบหมายการสอน
        </Link>{' '}
        เพื่อเชื่อมครู ห้อง วิชา และภาคเรียน
      </div>
      <div className="actions">
        <ActionButton action={skipSetup}>เสร็จสิ้น / ข้ามการตั้งค่า</ActionButton>
        <Link className="button button-outline" href="/dashboard">
          ไปหน้าหลัก
        </Link>
      </div>
    </div>
  );
}
