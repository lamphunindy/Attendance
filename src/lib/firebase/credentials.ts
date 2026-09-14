import 'server-only';

// Dashboard values are sometimes pasted as a quoted .env assignment. Accept
// that formatting without changing the key material or supplying credentials.
export function credentialValue(value: string, name: string) {
  let result = value.trim();
  if (result.startsWith(`${name}=`)) result = result.slice(name.length + 1).trim();
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'")))
    result = result.slice(1, -1);
  return result.trim();
}

export function firebasePrivateKey(value: string) {
  return credentialValue(value, 'FIREBASE_PRIVATE_KEY')
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\r\n/g, '\n');
}
