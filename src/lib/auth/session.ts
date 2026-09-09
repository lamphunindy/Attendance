import 'server-only';
import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient, isConfigured, authenticatedUser } from '@/lib/firebase/server';
import { uuid } from '@/lib/validations';
export const getSession = cache(async () => {
  if (!isConfigured()) redirect('/login');
  const user = await authenticatedUser();
  if (!user) redirect('/login');
  const db = await createClient();
  const [profile, roles] = await Promise.all([
    db
      .from('profiles')
      .select('id,full_name,email,avatar_url,active,requested_school_id')
      .eq('id', user.id)
      .single(),
    db.from('user_roles').select('id,school_id,role').eq('user_id', user.id),
  ]);
  if (profile.error || roles.error) throw new Error('ไม่สามารถตรวจสอบบัญชีได้');
  const selected = (await cookies()).get('pp5_school')?.value;
  const role =
    roles.data.find((r) => r.school_id === selected) ||
    roles.data.find((r) => r.role === 'admin') ||
    roles.data[0];
  return { db, user, profile: profile.data, roles: roles.data, role };
});
export const requireMember = cache(async () => {
  const s = await getSession();
  if (!s.profile.active || !s.role) redirect('/pending');
  return { ...s, role: s.role };
});
export async function requireAdmin() {
  const s = await requireMember();
  if (s.role.role !== 'admin') notFound();
  return s;
}
export async function requireAssignment(id: string) {
  if (!uuid.safeParse(id).success) notFound();
  const s = await requireMember();
  const { data, error } = await s.db
    .from('teacher_assignments')
    .select(
      'id,school_id,teacher_id,classroom_id,subject_id,term_id,active,workflow,workflow_note,score_total,created_at,updated_at',
    )
    .eq('id', id)
    .single();
  if (error || !data) notFound();
  return { ...s, assignment: data };
}
