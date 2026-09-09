'use server';
import { redirect } from 'next/navigation';
import { authenticatedUser } from '@/lib/firebase/server';
import { adminAuth } from '@/lib/firebase/admin';
import { requireMember } from '@/lib/auth/session';
import { cookies } from 'next/headers';
export async function logout() {
  const user = await authenticatedUser();
  if (user) await adminAuth().revokeRefreshTokens(user.firebaseUid);
  (await cookies()).delete('pp5_session');
  (await cookies()).delete('pp5_school');
  redirect('/login');
}
export async function changeSchool(form: FormData) {
  const s = await requireMember();
  const id = String(form.get('school'));
  if (s.roles.some((r) => r.school_id === id))
    (await cookies()).set('pp5_school', id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  redirect('/dashboard');
}
