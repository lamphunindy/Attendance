import { BookOpen, GraduationCap, ShieldCheck } from 'lucide-react';
import { GoogleLogin } from '@/components/auth/google-login';
import { isConfigured } from '@/lib/firebase/server';
import Image from 'next/image';
import { loginBranding } from '@/lib/firebase/admin';
import { Suspense } from 'react';

async function SchoolTitle({ branding }: { branding: ReturnType<typeof loginBranding> }) {
  const school = await branding;
  return <strong>{school?.name || 'ระบบ ปพ.5 ออนไลน์'}</strong>;
}

async function SchoolBrand({ branding }: { branding: ReturnType<typeof loginBranding> }) {
  const school = await branding;
  return (
    <div className="grid gap-3">
      <div className="brand">
        <div className="brand-icon">
          {school?.logo_url ? (
            <Image
              unoptimized
              src={school.logo_url}
              width={44}
              height={44}
              alt="โลโก้โรงเรียน"
              className="rounded-lg bg-white object-contain"
            />
          ) : (
            <BookOpen />
          )}
        </div>
        <strong>ระบบ ปพ.5 ออนไลน์</strong>
      </div>
      {school?.name && <p className="muted">{school.name}</p>}
    </div>
  );
}
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = isConfigured();
  // Optional school branding streams separately so Google login is usable
  // while Firestore is still responding. Both regions share one request.
  const branding = loginBranding();
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <div className="brand-icon">
            <BookOpen />
          </div>
          <Suspense fallback={<strong>ระบบ ปพ.5 ออนไลน์</strong>}>
            <SchoolTitle branding={branding} />
          </Suspense>
        </div>
        <div>
          <div className="eyebrow">เพื่อครู เพื่อการเรียนรู้ที่ดีกว่า</div>
          <h1>
            ดูแลทุกการเรียนรู้
            <br />
            ในที่เดียว
          </h1>
          <p className="muted mt-5">
            บันทึกเวลาเรียน จัดการคะแนน และสรุปผลการเรียน
            <br />
            สะดวกทุกที่ พร้อมสำหรับทุกห้องเรียน
          </p>
        </div>
        <div className="login-story-art">
          <GraduationCap size={180} strokeWidth={1} />
        </div>
        <p className="muted small">ระบบบริหารจัดการผลการเรียนและเวลาเรียน</p>
      </section>
      <section className="login-form">
        <div className="login-box">
          <Suspense
            fallback={
              <div className="grid gap-3">
                <div className="brand">
                  <div className="brand-icon">
                    <BookOpen />
                  </div>
                  <strong>ระบบ ปพ.5 ออนไลน์</strong>
                </div>
                <div className="skeleton h-5 w-48 max-w-full mx-auto" aria-label="กำลังโหลดชื่อโรงเรียน" />
              </div>
            }
          >
            <SchoolBrand branding={branding} />
          </Suspense>
          <div>
            <h2>ยินดีต้อนรับคุณครู</h2>
            <p className="muted mt-2">เข้าสู่ระบบเพื่อเริ่มดูแลห้องเรียนของคุณ</p>
          </div>
          {(!configured || error === 'config') && (
            <div className="notice warning">
              ระบบยังไม่ได้เชื่อมต่อ Firebase กรุณาตั้งค่าตามคู่มือก่อนเปิดใช้งาน
            </div>
          )}
          {error === 'oauth' && (
            <div role="alert" className="notice warning">
              เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
            </div>
          )}
          <GoogleLogin configured={configured} />
          <p className="muted">สำหรับครูและผู้ดูแลระบบ</p>
          <div className="login-security">
            <ShieldCheck size={16} />
            บัญชีต้องได้รับอนุมัติจากผู้ดูแลระบบ
          </div>
        </div>
      </section>
    </main>
  );
}
