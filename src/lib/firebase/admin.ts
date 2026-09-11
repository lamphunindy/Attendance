import 'server-only';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function isConfigured() {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}
export function firebaseApp() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Firebase project is not configured');
  if (
    process.env.NODE_ENV === 'production' &&
    (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
  )
    throw new Error('Emulators are forbidden in production');
  const existing = getApps().find((a) => a.name === 'pp5');
  if (existing) return existing;
  const credential =
    process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
      ? cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      : applicationDefault();
  return initializeApp({ projectId, credential }, 'pp5');
}
export const adminAuth = () => getAuth(firebaseApp());
export const firestore = () => getFirestore(firebaseApp());
export async function loginBranding() {
  if (!isConfigured()) return null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Branding is optional: an unavailable database must not hold up the login page.
    // This bounds the render wait; it does not cancel the underlying Firestore read.
    const r = await Promise.race([
      firestore().collection('schools').orderBy('created_at').limit(1).get(),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), 2000);
      }),
    ]);
    if (!r) {
      console.warn('[firebase/login-branding] timeout');
      return null;
    }
    const d = r.docs[0]?.data();
    return d
      ? { name: String(d.name || ''), logo_url: typeof d.logo_url === 'string' ? d.logo_url : null }
      : null;
  } catch (error) {
    // Log only the SDK code, never credentials or database contents.
    const code =
      error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
    console.warn('[firebase/login-branding] unavailable', code);
    return null;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
