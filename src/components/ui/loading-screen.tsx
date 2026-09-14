import { BookOpen } from 'lucide-react';
import { Skeleton } from './states';

export function AppLoading() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-hidden="true">
        <div className="brand">
          <div className="brand-icon">
            <BookOpen size={25} />
          </div>
          <div>
            <strong>ปพ.5 ออนไลน์</strong>
            <small>ระบบจัดการผลการเรียน</small>
          </div>
        </div>
        <div className="grid gap-4 mt-10">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="skeleton h-11 w-full" />
          ))}
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar" aria-hidden="true">
          <div className="skeleton h-6 w-48 max-w-[65%]" />
          <div className="skeleton size-10 rounded-full" />
        </div>
        <main className="main-content">
          <Skeleton />
        </main>
      </div>
    </div>
  );
}

export function LoginLoading() {
  return (
    <main className="login-page" aria-busy="true">
      <section className="login-story" aria-hidden="true">
        <div className="brand">
          <div className="brand-icon">
            <BookOpen />
          </div>
          <strong>ระบบ ปพ.5 ออนไลน์</strong>
        </div>
        <div className="skeleton h-12 w-3/4" />
        <div className="skeleton h-6 w-full" />
        <div className="skeleton h-64 w-full" />
      </section>
      <section className="login-form">
        <div className="login-box">
          <div className="brand">
            <div className="brand-icon">
              <BookOpen />
            </div>
            <strong>ระบบ ปพ.5 ออนไลน์</strong>
          </div>
          <p className="loading-status justify-center" role="status">
            กำลังเตรียมหน้าเข้าสู่ระบบ…
          </p>
          <div className="grid gap-5" aria-hidden="true">
            <div className="skeleton h-9 w-3/4 mx-auto" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-12 w-full" />
            <div className="skeleton h-12 w-full" />
          </div>
        </div>
      </section>
    </main>
  );
}
