'use client';
import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, inMemoryPersistence, setPersistence } from 'firebase/auth';
export async function browserAuth() {
  const app =
    getApps()[0] ||
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  const auth = getAuth(app);
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL &&
    !auth.emulatorConfig
  )
    connectAuthEmulator(auth, process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL, { disableWarnings: true });
  await setPersistence(auth, inMemoryPersistence);
  return auth;
}
