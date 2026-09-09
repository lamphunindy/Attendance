'use client';
import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { browserAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
export function GoogleLogin({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState<'login' | 'signup' | null>(null);
  async function login(mode: 'login' | 'signup') {
    setBusy(mode);
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
        const data: unknown = await response.json();
        if (
          !response.ok ||
          !data ||
          typeof data !== 'object' ||
          !('next' in data) ||
          typeof data.next !== 'string'
        )
          throw new Error('session');
        window.location.assign(data.next);
      } finally {
        await signOut(auth);
      }
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
      toast.error(
        code === 'auth/unauthorized-domain'
          ? 'กรุณาเพิ่มโดเมนนี้ใน Firebase Authorized domains'
          : code === 'auth/popup-blocked'
            ? 'กรุณาอนุญาตหน้าต่างป๊อปอัปเพื่อเข้าสู่ระบบ'
            : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      );
      setBusy(null);
    }
  }
  return (
    <div className="grid gap-5" aria-busy={busy !== null}>
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
