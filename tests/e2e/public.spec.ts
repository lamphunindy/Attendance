import { test, expect } from '@playwright/test';
test('Google login button uses Firebase popup and an HttpOnly session', async ({ page }) => {
  await page.goto('/login');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google', exact: true }).click();
  const popup = await popupPromise;
  await popup.getByText('admin@example.test', { exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const session = (await page.context().cookies()).find((c) => c.name === 'pp5_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  expect(
    await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('firebase:authUser'))),
  ).toBe(false);
});
test('teacher Google signup waits for admin approval before accessing the school', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const email = 'new-teacher-signup@example.test';
  // Create only a Google identity in the Auth Emulator; the application must create the profile.
  const claims = Buffer.from(
    JSON.stringify({
      sub: 'new-teacher-signup',
      email,
      email_verified: true,
      name: 'ครูสมัครใหม่',
    }),
  ).toString('base64url');
  const identity = await page.request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key',
    {
      data: {
        requestUri: 'http://localhost:3001',
        postBody: 'providerId=google.com&id_token=eyJhbGciOiJub25lIn0.' + claims + '.',
        returnSecureToken: true,
      },
    },
  );
  expect(identity.ok()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'สร้างบัญชีครูด้วย Google', exact: true }).click();
  const popup = await popupPromise;
  await popup.getByText(email, { exact: true }).click();
  await expect(page).toHaveURL(/\/pending/);
  await expect(page.getByText('ลงทะเบียนบัญชี Google เรียบร้อยแล้ว')).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.goto('/scores');
  await expect(page).toHaveURL(/\/pending/);
  await expect(page.getByRole('heading', { name: 'รอการอนุมัติบัญชี' })).toBeVisible();
  await page.screenshot({ path: 'test-results/teacher-signup-pending-390.png', fullPage: true });

  const admin = await browser.newPage();
  try {
    await admin.goto('/login');
    const adminPopupPromise = admin.waitForEvent('popup');
    await admin.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google', exact: true }).click();
    await (await adminPopupPromise).getByText('admin@example.test', { exact: true }).click();
    await expect(admin).toHaveURL(/\/dashboard/);
    await admin.goto('/admin/teachers');
    const row = admin.getByRole('row').filter({ hasText: email });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('รออนุมัติ');
    await row.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'ยืนยัน', exact: true }).click();
    await expect(row.getByRole('button', { name: 'อนุมัติ', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'ตรวจสอบการอนุมัติ' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /สวัสดี.*ครูสมัครใหม่/ })).toBeVisible();
  } finally {
    await admin.close();
  }
});

test('Firebase session endpoint rejects cross-origin login', async ({ request }) => {
  const r = await request.post('/api/auth/session', {
    headers: { Origin: 'https://attacker.example' },
    data: { idToken: 'forged' },
  });
  expect(r.status()).toBe(403);
});
test('Firebase session endpoint rejects forged tokens', async ({ request }) => {
  const r = await request.post('/api/auth/session', {
    headers: { Origin: 'http://localhost:3001' },
    data: { idToken: 'forged' },
  });
  expect(r.status()).toBe(401);
});
test('forged session cookie cannot access school data', async ({ page }) => {
  await page.context().addCookies([{ name: 'pp5_session', value: 'forged', domain: 'localhost', path: '/' }]);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
for (const width of [375, 390, 430, 768, 1024, 1440])
  test(`login responsive ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'สร้างบัญชีครูด้วย Google' })).toBeVisible();
    await expect(page.getByText('สำหรับครูและผู้ดูแลระบบ')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const target = await page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' }).boundingBox();
    expect(target?.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `test-results/login-${width}.png`, fullPage: true, caret: 'initial' });
  });
test('private pages require authentication', async ({ page }) => {
  for (const path of [
    '/dashboard',
    '/admin',
    '/admin/students',
    '/pp5/50000000-0000-4000-8000-000000000001',
    '/api/export?kind=students',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});
test('OAuth error does not expose technical details', async ({ page }) => {
  await page.goto('/login?error=oauth');
  await expect(page.getByRole('alert')).toContainText('เข้าสู่ระบบไม่สำเร็จ');
  await expect(page.locator('body')).not.toContainText('stack trace');
});
