import Link from 'next/link';
import { Users, School, BookOpen, GraduationCap } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/states';
import { thaiDate } from '@/lib/utils';
export default async function Admin() {
  const s = await requireAdmin(),
    db = s.db,
    sid = s.role.school_id;
  const r = await Promise.all([
    db.from('user_roles').select('user_id').eq('school_id', sid),
    db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', sid),
    db.from('classrooms').select('id', { count: 'exact', head: true }).eq('school_id', sid),
    db.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', sid),
    db
      .from('profiles')
      .select('id,full_name,email,last_login_at')
      .eq('requested_school_id', sid)
      .order('last_login_at', { ascending: false })
      .limit(100),
    db
      .from('audit_logs')
      .select('id,created_at,action,entity_type,actor_user_id')
      .eq('school_id', sid)
      .eq('entity_type', 'student_scores')
      .order('created_at', { ascending: false })
      .limit(8),
    db
      .from('school_settings')
      .select('value')
      .eq('school_id', sid)
      .eq('key', 'setup_completed')
      .maybeSingle(),
  ]);
  for (const q of r) if (q.error) throw q.error;
  const [roles, students, classes, subjects, profiles, audit, setup] = r;
  const ids = new Set(roles.data!.map((r) => r.user_id));
  const pending = profiles.data!.filter((p) => !ids.has(p.id));
  const stats = [
    ['ครูและผู้ดูแล', ids.size, Users],
    ['นักเรียน', students.count || 0, GraduationCap],
    ['ห้องเรียน', classes.count || 0, School],
    ['รายวิชา', subjects.count || 0, BookOpen],
  ] as const;
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ผู้ดูแลระบบ</div>
          <h1>ภาพรวมโรงเรียน</h1>
          <p className="muted">จัดการข้อมูลและติดตามการบันทึกผลการเรียน</p>
        </div>
        <Button asChild>
          <Link href="/admin/setup">ตั้งค่าโรงเรียน</Link>
        </Button>
      </div>
      {!setup.data && (
        <div className="welcome-banner">
          <div>
            <h2>เริ่มต้นใช้งานระบบ ปพ.5</h2>
            <p className="muted mt-2">ตั้งค่าข้อมูลโรงเรียน ปีการศึกษา ห้องเรียน และเชิญคุณครู</p>
          </div>
          <Button asChild>
            <Link href="/admin/setup">เริ่มตั้งค่า 7 ขั้นตอน</Link>
          </Button>
        </div>
      )}
      <div className="stats-grid">
        {stats.map(([label, value, Icon]) => (
          <div key={label} className="card stat">
            <div className="stat-top">
              {label}
              <span className="stat-icon">
                <Icon size={21} />
              </span>
            </div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>
      <div className="notice warning actions">
        <span>บัญชีรออนุมัติ {pending.length} คน</span>
        <Link href="/admin/teachers" className="underline">
          ตรวจสอบบัญชี
        </Link>
      </div>
      <div className="info-grid">
        <section className="card stack">
          <h2>เข้าสู่ระบบล่าสุด</h2>
          {profiles.data!.slice(0, 8).map((p) => (
            <div className="page-heading" key={p.id}>
              <div>
                <strong>{p.full_name}</strong>
                <p className="muted small break-all">{p.email}</p>
              </div>
              <span className="small muted">{p.last_login_at ? thaiDate(p.last_login_at) : '—'}</span>
            </div>
          ))}
        </section>
        <section className="card stack">
          <div className="page-heading">
            <h2>การแก้คะแนนล่าสุด</h2>
            <Link href="/admin/audit" className="text-blue-600">
              ดูทั้งหมด
            </Link>
          </div>
          {audit.data!.length ? (
            audit.data!.map((a) => (
              <div key={a.id} className="page-heading">
                <span>บันทึกคะแนน</span>
                <span className="small muted">
                  {thaiDate(a.created_at)}{' '}
                  {new Date(a.created_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })}
                </span>
              </div>
            ))
          ) : (
            <Empty text="ยังไม่มีประวัติการแก้คะแนน" />
          )}
        </section>
      </div>
    </div>
  );
}
