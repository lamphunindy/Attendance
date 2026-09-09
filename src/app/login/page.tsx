import { BookOpen, GraduationCap, ShieldCheck } from 'lucide-react';
import { GoogleLogin } from '@/components/auth/google-login';
import { isConfigured } from '@/lib/firebase/server';
import Image from 'next/image';
import { loginBranding } from '@/lib/firebase/admin';
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = isConfigured();
  const branding = await loginBranding();
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <div className="brand-icon">
            <BookOpen />
          </div>
          <strong>{branding?.name || 'ระบบ ปพ.5 ออนไลน์'}</strong>
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
          <div className="brand">
            <div className="brand-icon">
              {branding?.logo_url ? (
                <Image
                  unoptimized
                  src={branding.logo_url}
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
          {branding?.name && <p className="muted">{branding.name}</p>}
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
