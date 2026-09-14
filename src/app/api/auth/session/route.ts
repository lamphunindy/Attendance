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
  ) {
    console.warn('[auth/session] rejected', { stage: 'request', code: 'invalid-origin-or-content-type' });
    return NextResponse.json(
      { error: 'กรุณาเปิดเว็บไซต์จากที่อยู่หลักแล้วลองใหม่', reference: 'LOGIN-REQUEST' },
      { status: 403 },
    );
  }
  if (Number(request.headers.get('content-length') || 0) > 16000)
    return NextResponse.json({ error: 'คำขอมีขนาดใหญ่เกินไป' }, { status: 413 });
  let stage = 'parse-request';
  try {
    const { idToken, next } = z
      .object({ idToken: z.string().min(1).max(12000), next: z.string().max(2000).optional() })
      .parse(await request.json());
    stage = 'initialize-firebase';
    const auth = adminAuth();
    stage = 'verify-token';
    const token = await auth.verifyIdToken(idToken, true);
    if (
      Date.now() / 1000 - token.auth_time > 300 ||
      token.auth_time > Date.now() / 1000 + 30 ||
      !token.email_verified ||
      token.firebase.sign_in_provider !== 'google.com'
    ) {
      console.warn('[auth/session] rejected', { stage: 'verify-token', code: 'fresh-google-login-required' });
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบด้วย Google ใหม่อีกครั้ง' }, { status: 401 });
    }
    stage = 'register-profile';
    const actor = await registerIdentity(
      firestore(),
      token,
      (process.env.BOOTSTRAP_ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    const maxAge = 5 * 24 * 60 * 60;
    stage = 'create-session';
    const session = await auth.createSessionCookie(idToken, { expiresIn: maxAge * 1000 });
    stage = 'read-permissions';
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
  } catch (error) {
    // SDK errors can contain tokens, credentials, and personal data. Log only
    // a bounded SDK code and a fixed classification, never the error object.
    const rawCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const code = /^[a-z0-9_/-]{1,80}$/i.test(rawCode) ? rawCode : 'unknown';
    const message = error instanceof Error ? error.message : '';
    const reason =
      code !== 'app/invalid-credential'
        ? 'operation-failed'
        : /Failed to parse private key/i.test(message)
          ? 'invalid-private-key-format'
          : /client_email/i.test(message)
            ? 'invalid-client-email'
            : /invalid_grant|Invalid JWT Signature/i.test(message)
              ? 'service-account-rejected'
              : 'credential-unavailable';
    console.error('[auth/session] failed', { stage, code, reason });
    const reference =
      reason === 'invalid-private-key-format'
        ? 'LOGIN-KEY'
        : code === 'app/invalid-credential'
          ? 'LOGIN-CREDENTIAL'
          : stage === 'initialize-firebase'
            ? 'LOGIN-CONFIG'
            : stage === 'register-profile'
              ? 'LOGIN-PROFILE'
              : stage === 'create-session'
                ? 'LOGIN-SESSION'
                : stage === 'read-permissions'
                  ? 'LOGIN-PERMISSIONS'
                  : 'LOGIN-TOKEN';
    return NextResponse.json(
      {
        error:
          reference === 'LOGIN-TOKEN'
            ? 'กรุณาเข้าสู่ระบบด้วย Google ใหม่อีกครั้ง'
            : 'ระบบเข้าสู่ระบบยังไม่พร้อม กรุณาแจ้งผู้ดูแลระบบพร้อมรหัสด้านล่าง',
        reference,
      },
      { status: 401 },
    );
  }
}
