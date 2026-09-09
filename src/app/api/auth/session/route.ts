import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth, firestore } from '@/lib/firebase/admin';
import { registerIdentity } from '@/lib/firebase/identity';
import { safeRedirect } from '@/lib/auth/redirect';
export async function POST(request: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (
    !origin ||
    request.headers.get('origin') !== new URL(origin).origin ||
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return NextResponse.json({ error: 'คำขอไม่ถูกต้อง' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 16000)
    return NextResponse.json({ error: 'คำขอมีขนาดใหญ่เกินไป' }, { status: 413 });
  try {
    const { idToken, next } = z
      .object({ idToken: z.string().min(1).max(12000), next: z.string().max(2000).optional() })
      .parse(await request.json());
    const token = await adminAuth().verifyIdToken(idToken, true);
    if (
      Date.now() / 1000 - token.auth_time > 300 ||
      token.auth_time > Date.now() / 1000 + 30 ||
      !token.email_verified ||
      token.firebase.sign_in_provider !== 'google.com'
    )
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบด้วย Google ใหม่อีกครั้ง' }, { status: 401 });
    const actor = await registerIdentity(
      firestore(),
      token,
      (process.env.BOOTSTRAP_ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    const maxAge = 5 * 24 * 60 * 60;
    const session = await adminAuth().createSessionCookie(idToken, { expiresIn: maxAge * 1000 });
    const [profile, roles] = await Promise.all([
      firestore().collection('profiles').doc(actor).get(),
      firestore().collection('user_roles').where('user_id', '==', actor).limit(1).get(),
    ]);
    const response = NextResponse.json({
      next: profile.data()?.active && !roles.empty ? safeRedirect(next) : '/pending',
    });
    response.cookies.set('pp5_session', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json(
      { error: 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจการตั้งค่า Firebase และลองอีกครั้ง' },
      { status: 401 },
    );
  }
}
