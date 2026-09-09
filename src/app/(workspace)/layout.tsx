import Image from 'next/image';
export const dynamic = 'force-dynamic';
import { BookOpen, School, ChevronDown, LogOut } from 'lucide-react';
import { requireMember } from '@/lib/auth/session';
import { Navigation } from '@/components/layout/navigation';
import { logout, changeSchool } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const s = await requireMember();
  const { data: school, error } = await s.db
    .from('schools')
    .select('id,name,logo_url')
    .eq('id', s.role.school_id)
    .single();
  if (error) throw error;
  return (
    <div className="app-shell">
      <a href="#content" className="skip-link">
        ข้ามไปเนื้อหาหลัก
      </a>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <BookOpen size={25} />
          </div>
          <div>
            <strong>ปพ.5 ออนไลน์</strong>
            <small>ระบบจัดการผลการเรียน</small>
          </div>
        </div>
        <div className="nav-caption">พื้นที่การสอน</div>
        <Navigation />
        {s.role.role === 'admin' && (
          <>
            <div className="nav-caption">บริหารโรงเรียน</div>
            <Navigation admin />
          </>
        )}
        <div className="sidebar-foot">
          <div className="badge green">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            เชื่อมต่อระบบแล้ว
          </div>
          <p className="small muted mt-3">
            ระบบบริหารจัดการผลการเรียน
            <br />
            และเวลาเรียน
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-school">
            {school.logo_url ? (
              <Image
                unoptimized
                src={school.logo_url}
                alt="โลโก้โรงเรียน"
                width={32}
                height={32}
                className="rounded-lg object-contain"
              />
            ) : (
              <School size={23} className="shrink-0 text-blue-500" />
            )}
            <span>{school.name}</span>
          </div>
          <div className="profile">
            <details>
              <summary>
                <span className="avatar">
                  {s.profile.avatar_url ? (
                    <Image
                      unoptimized
                      className="avatar"
                      src={s.profile.avatar_url}
                      width={40}
                      height={40}
                      alt=""
                    />
                  ) : (
                    s.profile.full_name.slice(0, 1)
                  )}
                </span>
                <div>
                  <div className="profile-name">{s.profile.full_name}</div>
                  <div className="profile-role small muted">
                    {s.role.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ครูผู้สอน'}
                  </div>
                </div>
                <ChevronDown size={15} />
              </summary>
              <div className="profile-menu">
                <strong>บัญชีของฉัน</strong>
                <p className="small break-all muted">{s.profile.email}</p>
                {s.roles.length > 1 && (
                  <form action={changeSchool}>
                    <label>
                      โรงเรียน
                      <select name="school" defaultValue={s.role.school_id}>
                        {Array.from(new Set(s.roles.map((r) => r.school_id))).map((id, i) => (
                          <option key={id} value={id}>
                            โรงเรียน {i + 1} ({s.roles.find((r) => r.school_id === id)?.role})
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button variant="outline" className="mt-2">
                      เปลี่ยนโรงเรียน
                    </Button>
                  </form>
                )}
                <form action={logout}>
                  <Button variant="outline">
                    <LogOut size={16} />
                    ออกจากระบบ
                  </Button>
                </form>
              </div>
            </details>
          </div>
        </header>
        <main id="content" className="main-content">
          {children}
        </main>
        <Navigation bottom />
      </div>
    </div>
  );
}
