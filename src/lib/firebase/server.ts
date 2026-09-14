import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { adminAuth, firestore, isConfigured } from './admin';
import { profileId } from './identity';
import { Repository } from './repository';
import { measureServer } from '@/lib/server-timing';
export { isConfigured } from './admin';
export const authenticatedUser = cache(async () => {
  if (!isConfigured()) return null;
  const session = (await cookies()).get('pp5_session')?.value;
  if (!session) return null;
  try {
    const [t, migration] = await Promise.all([
      measureServer('auth.verify-session', () => adminAuth().verifySessionCookie(session, true)),
      measureServer('auth.migration', () => firestore().collection('_system').doc('migration').get()),
    ]);
    if (t.firebase.sign_in_provider !== 'google.com' || !t.email_verified) return null;
    if (migration.exists && migration.data()?.status !== 'complete') return null;
    return { id: profileId(t.uid), firebaseUid: t.uid, email: t.email };
  } catch {
    return null;
  }
});
export async function createClient() {
  const user = await authenticatedUser();
  if (!user) throw new Error('Authentication required');
  return new Repository(firestore(), user.id);
}
