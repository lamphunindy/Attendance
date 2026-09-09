import { Clock3 } from 'lucide-react';
export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { logout } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';
export default async function Pending() {
  const s = await getSession();
  if (s.role && s.profile.active) redirect('/dashboard');
  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="card stack max-w-lg text-center">
        <Clock3 size={48} className="mx-auto text-blue-600" />
        <h1>รอการอนุมัติบัญชี</h1>
        {s.profile.active && <p className="notice">ลงทะเบียนบัญชี Google เรียบร้อยแล้ว</p>}
        <p>บัญชีของคุณยังไม่ได้รับอนุญาตให้ใช้งานระบบ กรุณาติดต่อผู้ดูแลระบบ</p>
        <p className="muted break-all">{s.profile.email}</p>
        {!s.profile.active && <div className="notice warning">บัญชีถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ</div>}
        {s.profile.active && (
          <Button asChild>
            <a href="/pending">ตรวจสอบการอนุมัติ</a>
          </Button>
        )}
        <form action={logout}>
          <Button variant="outline">ออกจากระบบ</Button>
        </form>
      </div>
    </main>
  );
}
