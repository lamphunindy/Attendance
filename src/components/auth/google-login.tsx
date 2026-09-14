'use client';
import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { browserAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
class SessionError extends Error {}

export function GoogleLogin({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState<'login' | 'signup' | null>(null);
  const [loginError, setLoginError] = useState('');
  async function login(mode: 'login' | 'signup') {
    setBusy(mode);
    setLoginError('');
    try {
      const auth = await browserAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      try {
        const response = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: await result.user.getIdToken() }),
        });
        const data: unknown = await response.json().catch(() => null);
        if (
          !response.ok ||
          !data ||
          typeof data !== 'object' ||
          !('next' in data) ||
          typeof data.next !== 'string'
        ) {
          const message =
            data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
              ? data.error
              : 'ระบบตอบกลับไม่สมบูรณ์ กรุณาลองใหม่อีกครั้ง';
          const reference =
            data &&
            typeof data === 'object' &&
            'reference' in data &&
            typeof data.reference === 'string' &&
            /^LOGIN-[A-Z-]+$/.test(data.reference)
              ? data.reference
              : 'LOGIN-RESPONSE';
          throw new SessionError(`${message} (รหัส ${reference})`);
        }
        window.location.assign(data.next);
      } finally {
        // Cleanup must not replace the server's error or interrupt a successful
        // session redirect. Firebase client persistence is in-memory only.
        await signOut(auth).catch(() => undefined);
      }
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
      setLoginError(
        e instanceof SessionError
          ? e.message
          : code === 'auth/unauthorized-domain'
            ? 'กรุณาเพิ่มโดเมนนี้ใน Firebase Authorized domains'
            : code === 'auth/popup-blocked'
              ? 'กรุณาอนุญาตหน้าต่างป๊อปอัปเพื่อเข้าสู่ระบบ'
              : code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
                ? 'หน้าต่างเข้าสู่ระบบถูกปิด กรุณากดเข้าสู่ระบบแล้วเลือกบัญชี Google อีกครั้ง'
                : code === 'auth/network-request-failed'
                  ? 'เชื่อมต่อ Google ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่ (รหัส LOGIN-NETWORK)'
                  : 'เข้าสู่ระบบกับ Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง (รหัส LOGIN-GOOGLE)',
      );
      setBusy(null);
    }
  }
  return (
    <div className="grid gap-5" aria-busy={busy !== null}>
      {loginError && (
        <div role="alert" className="notice warning">
          {loginError}
        </div>
      )}
      <Button variant="outline" disabled={!configured || busy !== null} onClick={() => login('login')}>
        <span aria-hidden="true" className="font-bold text-blue-600">
          G
        </span>
        {busy === 'login' ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย Google'}
      </Button>
      <div className="grid gap-3 border-t border-slate-200 pt-5">
        <p className="font-medium">คุณครูที่ยังไม่มีบัญชี</p>
        <Button
          disabled={!configured || busy !== null}
          onClick={() => login('signup')}
          aria-describedby="teacher-signup-help"
        >
          <span aria-hidden="true" className="font-bold">
            G
          </span>
          {busy === 'signup' ? 'กำลังสร้างบัญชีครู…' : 'สร้างบัญชีครูด้วย Google'}
        </Button>
        <p id="teacher-signup-help" className="muted small">
          เลือกอีเมล Google ของคุณเพื่อสมัคร แล้วรอผู้ดูแลอนุมัติ หากได้รับคำเชิญแล้ว
          ให้เลือกอีเมลเดียวกับที่โรงเรียนเชิญ
        </p>
      </div>
    </div>
  );
}
