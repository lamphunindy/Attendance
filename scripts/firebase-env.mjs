import nextEnv from '@next/env';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
export function services() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Set NEXT_PUBLIC_FIREBASE_PROJECT_ID in .env.local first');
  const credential =
    process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
      ? cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      : applicationDefault();
  const app = initializeApp({ projectId, credential });
  return { db: getFirestore(app), auth: getAuth(app), projectId };
}
