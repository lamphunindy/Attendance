import { test, expect, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mkdir } from 'node:fs/promises';
async function login(page: Page, role: 'admin' | 'teacher') {
  const claims = Buffer.from(
    JSON.stringify({
      sub: 'test-' + role,
      email: role + '@example.test',
      email_verified: true,
      name: role === 'teacher' ? '\u0e04\u0e23\u0e39\u0e17\u0e14\u0e2a\u0e2d\u0e1a' : role,
    }),
  ).toString('base64url');
  const response = await page.request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key',
    {
      data: {
        requestUri: 'http://localhost:3001',
        postBody: 'providerId=google.com&id_token=eyJhbGciOiJub25lIn0.' + claims + '.',
        returnSecureToken: true,
      },
    },
  );
  expect(response.ok()).toBe(true);
  const auth = await response.json();
  const session = await page.request.post('/api/auth/session', {
    headers: { Origin: 'http://localhost:3001' },
    data: { idToken: auth.idToken },
  });
  expect(session.ok()).toBe(true);
  const fixture = JSON.parse(
    await (await import('node:fs/promises')).readFile('.firebase/test-fixture.json', 'utf8'),
  );
  return fixture.assignment as string;
}
async function fillDialog(page: Page, title: string, values: Record<string, string>) {
  await page.getByRole('button', { name: title, exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const [label, value] of Object.entries(values))
    await dialog.getByLabel(label, { exact: false }).fill(value);
  await dialog.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test('admin database pages and mobile layout', async ({ page }) => {
  await login(page, 'admin');
  for (const path of [
    '/admin',
    '/admin/students',
    '/admin/classrooms',
    '/admin/subjects',
    '/admin/teachers',
    '/admin/settings',
    '/admin/setup',
    '/admin/audit',
  ]) {
    await page.goto(path);
    await expect(page.locator('h1')).not.toContainText('ไม่สามารถโหลดข้อมูล');
    await expect(page).not.toHaveURL(/\/login/);
    for (const width of [375, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.screenshot({ path: 'test-results/admin-1440.png', fullPage: true, caret: 'initial' });
});
test('admin adds a student with classroom, number and prefix and rejects a duplicate number', async ({
  page,
}) => {
  await login(page, 'admin');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/students');
  await page.getByRole('button', { name: 'เพิ่มนักเรียน', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('ชั้น / ห้องเรียน').selectOption({ label: 'ป.6/2 (2569)' });
  await dialog.getByLabel('เลขที่').fill('1');
  await dialog.getByLabel('รหัสนักเรียน').fill('FORM012');
  await dialog.getByLabel('คำนำหน้า').selectOption('ด.ญ.');
  await dialog.locator('input[name="first_name"]').fill('เพิ่มจากฟอร์ม');
  await dialog.getByLabel('นามสกุล').fill('ทดสอบ');
  await page.screenshot({ path: 'test-results/student-form-390.png', fullPage: true });
  await dialog.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const student = page.getByRole('row').filter({ hasText: 'FORM012' });
  await expect(student).toContainText('ป.6/2 (2569)');
  await expect(student.getByRole('cell', { name: '1', exact: true })).toBeVisible();
  await expect(student).toContainText('ด.ญ.');
  await page.getByRole('button', { name: 'เพิ่มนักเรียน', exact: true }).click();
  await dialog.getByLabel('ชั้น / ห้องเรียน').selectOption({ label: 'ป.6/2 (2569)' });
  await dialog.getByLabel('เลขที่').fill('1');
  await dialog.getByLabel('รหัสนักเรียน').fill('FORM013');
  await dialog.locator('input[name="first_name"]').fill('เลขที่ซ้ำ');
  await dialog.getByLabel('นามสกุล').fill('ทดสอบ');
  await dialog.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: /ซ้ำ/ })).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'ยกเลิก' }).click();
  await page.goto('/admin/students?q=FORM013');
  await expect(page.getByRole('row').filter({ hasText: 'FORM013' })).toHaveCount(0);
});

test('admin creates a classroom without a separate room number', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/classrooms');
  await page.getByRole('button', { name: 'เพิ่มห้องเรียน', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(/เลขห้อง/)).toHaveCount(0);
  await dialog.getByLabel('ปีการศึกษา').selectOption({ label: '2569' });
  await dialog.getByLabel('ระดับชั้น').selectOption({ label: 'ป.6' });
  await dialog.getByLabel('ชื่อห้อง').fill('ป.6/3');
  await dialog.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('cell', { name: 'ป.6/3', exact: true })).toBeVisible();
});

test('admin creates academic year and imports students atomically', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/academic-years');
  await fillDialog(page, 'เพิ่มปีการศึกษา', { 'ปีการศึกษา (พ.ศ.)': '2570' });
  await expect(page.getByRole('cell', { name: '2570', exact: true })).toBeVisible();
  await page.goto('/admin/import');
  await page.getByLabel('ห้องเรียนปลายทาง').selectOption({ label: 'ป.6/1 (2569)' });
  const template = await page.request.get('/api/export?kind=template');
  expect(template.ok()).toBe(true);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(await template.body()).buffer);
  expect(wb.worksheets.map((sheet) => sheet.name)).toEqual(['นักเรียน', 'ตัวอย่าง', 'วิธีกรอก']);
  const ws = wb.getWorksheet('นักเรียน')!;
  expect(ws.rowCount).toBe(1);
  expect(wb.getWorksheet('ตัวอย่าง')!.getCell('A2').text).toBe('00001');
  ws.addRow(['E2E011', 11, 'ด.ญ.', 'นักเรียนทดสอบ', 'นำเข้า', 'ทดสอบ']);
  await mkdir('test-results', { recursive: true });
  await wb.xlsx.writeFile('test-results/import.xlsx');
  await page.getByLabel('ไฟล์รายชื่อนักเรียน').setInputFiles('test-results/import.xlsx');
  await page.getByRole('button', { name: 'ตรวจสอบและแสดงตัวอย่าง' }).click();
  await expect(page.getByText('อ่านได้ 1 คน · พบข้อผิดพลาด 0 รายการ')).toBeVisible();
  await page.getByRole('button', { name: 'ยืนยันนำเข้าทั้งหมด' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ยืนยัน', exact: true }).click();
  await expect(page.getByText('นำเข้านักเรียนครบทุกแถวเรียบร้อยแล้ว')).toBeVisible();
  await page.goto('/admin/students?q=E2E011');
  await expect(page.getByRole('cell', { name: 'E2E011', exact: true })).toBeVisible();
});
test('teacher attendance, score, assessment, submit, admin lock and export', async ({ page }) => {
  test.setTimeout(300000);
  const id = await login(page, 'teacher');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'ป.6/1', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard-1440.png', fullPage: true, caret: 'initial' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/pp5/${id}/attendance`);
  await page.getByLabel('วันที่', { exact: true }).fill('2026-09-08');
  await page.getByRole('button', { name: 'บันทึกทั้งหมด', exact: true }).click();
  await expect(page.getByText('บันทึกการเข้าเรียนเรียบร้อยแล้ว')).toBeVisible();
  await page.screenshot({ path: 'test-results/attendance-390.png', fullPage: true, caret: 'initial' });
  await page.goto(`/pp5/${id}/scores`);
  await page.getByRole('button', { name: 'ใช้หมวดมาตรฐาน 30/20/30/20' }).click();
  await expect(page.getByText('น้ำหนักรวม 100 / 100', { exact: false })).toBeVisible();
  for (const [category, title, score] of [
    ['ก่อนกลางภาค', 'ใบงาน', 30],
    ['กลางภาค', 'สอบกลางภาค', 20],
    ['หลังกลางภาค', 'โครงงาน', 30],
    ['ปลายภาค', 'สอบปลายภาค', 20],
  ] as const) {
    await page.getByRole('button', { name: 'เพิ่มงาน / ข้อสอบ', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('หมวดคะแนน').selectOption({ label: category });
    await dialog.getByLabel('ชื่องาน / ข้อสอบ').fill(title);
    await dialog.getByLabel('คะแนนเต็ม', { exact: false }).fill(String(score));
    await dialog.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByLabel('เลือกงาน', { exact: true })
      .selectOption({ label: `${category} · ${title} (${score} คะแนน)` });
    await page.getByRole('button', { name: 'กรอกเต็มทุกคน', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ยืนยัน', exact: true }).click();
    await page.getByRole('button', { name: 'บันทึกคะแนนทั้งหมด', exact: true }).click();
    await expect(page.getByText('บันทึกข้อมูลล่าสุดแล้ว', { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: 'test-results/scores-390.png', fullPage: true, caret: 'initial' });
  for (const width of [375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/scores-1440.png', fullPage: true, caret: 'initial' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/pp5/${id}/indicators`);
  await fillDialog(page, 'เพิ่มตัวชี้วัด', {
    รหัสตัวชี้วัด: 'ว 4.2 ป.6/1',
    รายละเอียด: 'ใช้เหตุผลเชิงตรรกะในการแก้ปัญหา',
  });
  for (const section of ['indicators', 'reading', 'characteristics']) {
    await page.goto(`/pp5/${id}/${section}`);
    const categories = page.getByLabel('เลือกหัวข้อประเมิน');
    await expect(categories).toBeVisible();
    await expect(categories.locator('option').first()).toBeAttached();
    const values = await categories
      .locator('option')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
    for (const category of values) {
      await categories.selectOption(category);
      const results = page.getByRole('combobox', { name: /ผลประเมิน เลขที่/ });
      await expect(results.first()).toBeVisible();
      expect(await results.count()).toBeGreaterThan(0);
      for (let i = 0; i < (await results.count()); i++)
        await results.nth(i).selectOption(section === 'indicators' ? 'excellent' : '3');
      await page.getByRole('button', { name: 'บันทึกผลประเมินทั้งหมด' }).click();
      await expect(page.getByText('ข้อมูลล่าสุด', { exact: true })).toBeVisible();
    }
  }
  await page.goto(`/pp5/${id}/summary`);
  await page.getByRole('button', { name: 'คำนวณ / บันทึกฉบับร่าง' }).click();
  await expect(page.getByRole('cell', { name: '100', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'ยืนยันผลการเรียน', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ยืนยัน', exact: true }).click();
  await expect(page.getByText('รออนุมัติ', { exact: true }).first()).toBeVisible();
  await login(page, 'admin');
  await page.goto(`/pp5/${id}/summary`);
  for (const action of ['อนุมัติผลการเรียน', 'ล็อกผลการเรียน']) {
    await page.getByRole('button', { name: action, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ยืนยัน', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await expect(page.getByText('ล็อกผลการเรียน', { exact: true }).first()).toBeVisible();
  await page.goto(`/pp5/${id}/print`);
  await expect(
    page.getByRole('heading', { name: 'แบบบันทึกผลการพัฒนาคุณภาพผู้เรียน (ปพ.5)' }).first(),
  ).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.bottom-nav')).not.toBeVisible();
  await expect(page.locator('.topbar')).not.toBeVisible();
  await page.pdf({ path: 'test-results/PP5.pdf', preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export ปพ.5 Excel' }).click();
  const file = await download;
  const path = await file.path();
  expect(path).toBeTruthy();
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.readFile(path!);
  expect(exported.worksheets).toHaveLength(8);
  expect(exported.getWorksheet('ผลการเรียน')?.getCell('D2').value).toBe(100);
  await login(page, 'teacher');
  await page.goto(`/pp5/${id}/scores`);
  await expect(page.getByRole('button', { name: 'บันทึกคะแนนทั้งหมด' })).not.toBeVisible();
});
