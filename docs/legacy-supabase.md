# ระบบ ปพ.5 ออนไลน์

ระบบบริหารจัดการผลการเรียนและเวลาเรียนสำหรับโรงเรียน ใช้ Next.js และฐานข้อมูล PostgreSQL บน Supabase ทุกหน้าที่แสดงข้อมูลโรงเรียนใช้ฐานข้อมูลจริง ไม่มี localStorage สำหรับคะแนนหรือสิทธิ์ และไม่มีข้อมูลจำลองแทรกในหน้า Production

## 1. ระบบนี้คืออะไร

- ผู้ดูแล: ข้อมูลโรงเรียน ปี/ภาคเรียน ระดับชั้น ห้อง วิชา ครู คำเชิญ นักเรียน การลงทะเบียน/ย้ายห้อง เกณฑ์เกรด ตั้งค่า และ Audit Log
- ครู: ห้องที่ได้รับมอบหมาย เช็กชื่อ คะแนนรายงานย่อย หมวดคะแนน ตัวชี้วัด คุณลักษณะ อ่านคิดวิเคราะห์เขียน และรายงาน ปพ.5
- คะแนน: แยกช่องว่างกับศูนย์ บันทึกทั้งหมดแบบ transaction เดียว คำนวณเกรดในฐานข้อมูล
- ผลการเรียน: ฉบับร่าง → ยืนยัน → ผู้ดูแลอนุมัติ → ล็อก; ผู้ดูแลเปิดแก้ไขพร้อมเหตุผลที่เก็บใน Audit
- Excel: Template, Preview, ตรวจซ้ำ, นำเข้าแบบทั้งหมดหรือยกเลิกทั้งหมด และ Export 5 ประเภทรายงาน
- พิมพ์: ภาษาไทย A4 แนวตั้ง/แนวนอน ใช้ Browser Print → Save as PDF
- มือถือ: Bottom Navigation, การ์ดเช็กชื่อ, คะแนนทีละงาน, ตารางเลื่อนภายใน และปุ่มอย่างน้อย 44px

ระบบเริ่มด้วยโรงเรียนเดียว แต่ทุกสิทธิ์แยกตาม `school_id` และ RLS รองรับหลายโรงเรียน บัญชีที่มีหลายโรงเรียนเปลี่ยนโรงเรียนได้ในเมนูบัญชี

## 2. Technology

Next.js 16 App Router / Proxy, React, TypeScript strict, Tailwind CSS 4, shadcn/ui components (Radix Dialog/Slot), Lucide, Noto Sans Thai แบบ self-hosted, Supabase JS/SSR, Supabase Auth + Google OAuth, PostgreSQL/RLS, Zod, React Hook Form, Sonner, date-fns, ExcelJS, Vitest, Playwright

โครงสร้างสำคัญ:

```text
src/app/(workspace)/          หน้าที่ต้องมีบัญชีและสิทธิ์
src/app/auth/                Google OAuth, callback, logout
src/app/api/                 Preview Excel และ Export ที่ตรวจสิทธิ์
src/components/              หน้าจอและ UI ที่ใช้ซ้ำ
src/lib/auth/                การตรวจบัญชีและสิทธิ์ฝั่งเซิร์ฟเวอร์
src/lib/admin/               แบบฟอร์มและ repository ผู้ดูแล
src/lib/supabase/            Browser/Server clients ใช้ cookies
src/lib/grading/             คำนวณ preview; ผลจริงใช้ PostgreSQL
src/types/database.types.ts  Types ที่สร้างจาก schema ที่รันจริง
supabase/migrations/         Schema, RLS, triggers, RPC
supabase/tests/              SQL/TAP tests
supabase/seed.sql            ข้อมูลตัวอย่างเฉพาะ Development
tests/e2e/                   Browser tests
tests/support/               PostgreSQL test adapter; ไม่อยู่ใน Production
```

## 3. Requirements

- Node.js 22 ขึ้นไป (แนะนำรุ่น LTS ที่ยังได้รับการสนับสนุน) และ npm
- Supabase Project หรือ Docker Desktop สำหรับ Supabase Local
- Google Cloud / Google Auth Platform สำหรับ OAuth
- บัญชี Vercel สำหรับนำขึ้นระบบจริง
- Google Chrome หรือ Chromium ของ Playwright สำหรับ browser tests

มี Supabase CLI เป็น devDependency แล้ว ใช้ `npx supabase` ได้หลัง `npm install` โดยไม่ต้องติดตั้ง CLI แบบ global หากยังไม่มี config ในโปรเจกต์อื่น ใช้ `npx supabase init`; โปรเจกต์นี้มี `supabase/config.toml` แล้ว

บน Windows ถ้า PowerShell ห้ามรัน `npm.ps1` ใช้ `npm.cmd` และ `npx.cmd` แทน โดยไม่ต้องเปลี่ยน execution policy ทั้งเครื่อง

## 4. วิธีติดตั้ง

```bash
npm install
cp .env.example .env.local
```

PowerShell:

```powershell
npm.cmd install
Copy-Item .env.example .env.local
```

ไม่ต้องมี credential เพื่อรัน lint, typecheck, unit test, database test แบบ embedded หรือ build ถ้ายังไม่มี Supabase หน้า Login จะแจ้งว่าต้องเชื่อมต่อระบบก่อน

## 5. วิธีสร้าง Supabase Project

1. สร้าง Project ที่ Supabase และเลือกรายภูมิภาคที่เหมาะกับโรงเรียน
2. บันทึกรหัสผ่านฐานข้อมูลในที่ปลอดภัย
3. คัดลอก Project URL และ Publishable Key จาก Project Settings / API Keys
4. คัดลอก Service Role Key ไปฝั่งเซิร์ฟเวอร์เฉพาะตอน bootstrap ผู้ดูแลคนแรก
5. ใช้ migration ของ repository นี้สร้าง schema อย่าสร้างตารางแยกด้วยมือ

ไม่จำเป็นต้องให้บัญชีผู้ใช้จริงเข้าถึง Supabase Dashboard

## 6. Environment Variables

| Variable | การใช้งาน |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL โครงการ เช่น `https://<PROJECT_REF>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable Key; ปลอดภัยที่จะส่งให้ browser เพราะ RLS ตรวจสิทธิ์ |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` ใน Development; URL HTTPS ของเว็บจริงใน Production |
| `BOOTSTRAP_ADMIN_EMAILS` | อีเมล Google ของผู้ดูแลคนแรก คั่นหลายบัญชีด้วย comma |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only; bootstrap ครั้งแรกและอ่านชื่อ/โลโก้สาธารณะบน Login ห้ามเติม `NEXT_PUBLIC_` |

`.env.local` ถูก ignore และห้าม commit secret จริง ไม่เก็บ access token เองใน localStorage

หลังตั้งค่าผู้ดูแลคนแรก สามารถลบ `BOOTSTRAP_ADMIN_EMAILS` ได้ หากคง service role key ไว้ เซิร์ฟเวอร์ใช้สำหรับอ่านเฉพาะชื่อ/โลโก้สาธารณะมาแสดงหน้า Login ด้วย หากลบ key หน้า Login ใช้ชื่อระบบ/โลโก้เริ่มต้น การทำงานข้อมูลโรงเรียนปกติใช้ authenticated client + RLS

## 7. วิธีรัน Migration

### Local ที่มี Docker Desktop

```bash
npm run db:start
npm run db:reset
```

`db:start` ใช้เวลาครั้งแรกเพื่อดาวน์โหลด containers; `db:reset` **ล้างเฉพาะ Local Database แล้วรัน migration และ seed ใหม่** ห้ามใช้กับข้อมูลที่ต้องเก็บโดยไม่สำรอง

ดู URL/Key จาก:

```bash
npx supabase status
```

### Remote Supabase

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

ใช้เฉพาะ `db push` เพื่อสร้าง Production schema โดยไม่เพิ่มนักเรียนตัวอย่าง อย่าใช้ `--include-seed` ใน Production

ระบบมี migration เรียงลำดับใน `supabase/migrations/` ทุกไฟล์ต้องรันตามลำดับ ไม่ต้องปิด RLS เพื่อให้แอปทำงาน

### Type generation

```bash
npm run db:types
```

คำสั่งนี้รัน migration บน PostgreSQL แบบ embedded แล้ว introspect คอลัมน์และ RPC เพื่อสร้าง types โดยไม่ใช้ credentials ส่วนระบบ Local จริงใช้:

```bash
npx supabase gen types typescript --local > supabase.generated.ts
```

หรือจาก Remote:

```bash
npx supabase gen types typescript --project-id <PROJECT_REF> > supabase.generated.ts
```

เมื่อนำ output มาแทน `src/types/database.types.ts` ให้คง aliases `TableName` และ `Row` ท้ายไฟล์ไว้ หรือใช้ `npm run db:types:local` ซึ่งเติม aliases ให้อัตโนมัติ จากนั้นรัน typecheck อีกครั้ง Types ใน repository สร้างจาก schema จริง ไม่ใช้ `any`

## 8. วิธี Seed / ทดลอง Dashboard

`supabase/seed.sql` มีโรงเรียนตัวอย่าง ปี 2569 ภาคเรียน 1 ระดับ ป.1–ป.6/ม.1–ม.3 ห้อง ป.6/1 วิชา ว16101 และนักเรียนสมมุติ 10 คน

```bash
npm run db:reset
```

ไม่มีการสร้าง Google auth user ปลอมใน Production หรือ seed ให้:

1. ตั้ง Google Provider และ bootstrap email
2. Login ด้วย Google จริง
3. ในหน้า “มอบหมายการสอน” เลือกตนเองหรือครูที่อนุมัติแล้ว ห้อง ป.6/1 วิทยาการคำนวณ ภาคเรียน 1
4. Dashboard จะมีการ์ดที่ใช้ฐานข้อมูลตัวอย่างจริง

ถ้าต้องการทดลองใน Remote ให้ใช้โครงการ Development แยกจาก Production เท่านั้น แล้วรัน seed ผ่าน SQL Editor ในโครงการทดลองหลัง migration

## 9. วิธีตั้ง Google Login

### Google Cloud / Google Auth Platform

1. สร้างหรือเลือก Google Cloud Project
2. ตั้ง Branding / Consent Screen และ Audience ให้เหมาะกับบัญชีโรงเรียน
3. สร้าง OAuth Client ประเภท **Web Application**
4. Development Authorized JavaScript Origin: `http://localhost:3000`
5. Authorized Redirect URI ต้องเป็น callback ของ **Supabase** ที่แสดงใน Google Provider configuration:

```text
https://<PROJECT_REF>.supabase.co/auth/v1/callback
```

Supabase Local:

```text
http://127.0.0.1:54321/auth/v1/callback
```

6. ถ้า Google App ยังอยู่ใน Testing ให้เพิ่มอีเมลผู้ทดสอบใน Test Users
7. เก็บ Google Client ID/Secret ใน Supabase Provider settings ไม่ต้องใส่ใน browser code

### Supabase

Authentication → Providers → Google:

- ใส่ Google Client ID และ Google Client Secret
- เปิด Google Provider
- ปิด Email/password และ Provider อื่น ถ้าต้องการบังคับ Google เท่านั้น

Authentication → URL Configuration:

```text
Site URL: http://localhost:3000
Redirect URLs: http://localhost:3000/auth/callback
```

Production:

```text
Site URL: https://<DOMAIN>
Redirect URLs: https://<DOMAIN>/auth/callback
```

หลีกเลี่ยง wildcard ของ Production domain ที่ไม่จำเป็น

สำหรับ Supabase Local เปลี่ยน `[auth.external.google].enabled = true` ใน `supabase/config.toml` และตั้ง `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ใน environment ของ CLI ก่อน `db:start`

Flow ของแอป: Server Action `signInWithOAuth({provider:'google'})` → PKCE → `/auth/callback` → `exchangeCodeForSession` → ตรวจ verified identity จากเซิร์ฟเวอร์ → profile/invitation → role → `/dashboard` หรือ `/pending` ใช้ cookies และ Proxy สำหรับ refresh session URL `next` รับเฉพาะ internal relative path

## 10. วิธีสร้าง Admin คนแรก

ตั้งใน `.env.local` หรือ Vercel:

```dotenv
BOOTSTRAP_ADMIN_EMAILS=admin@example.com
SUPABASE_SERVICE_ROLE_KEY=<SERVER_ONLY_SERVICE_ROLE_KEY>
```

Login ด้วยบัญชี Google ของอีเมลที่กำหนด เซิร์ฟเวอร์ใช้ `auth.getUser()` และ Google identity ที่ยืนยันแล้ว ไม่รับ email จากฟอร์มมาให้สิทธิ์

`bootstrap_first_admin` ใช้ advisory transaction lock และจะทำงานเฉพาะเมื่อยังไม่มี admin ในระบบเท่านั้น โดยสร้างโรงเรียนแรกหากยังไม่มี บันทึก Audit Log และให้สิทธิ์ admin แบบ atomic ฟังก์ชันนี้ถูก revoke จาก `anon`/`authenticated` และอนุญาตเฉพาะ service role

ถ้ามี Admin อยู่แล้ว ให้ Admin เชิญ/อนุมัติบัญชีใหม่จากหน้า “จัดการครู” การเพิ่มอีเมลใน env ภายหลังจะไม่ยกระดับสิทธิ์ผู้ใช้เอง

ผู้ใช้ใหม่ที่ไม่มี role จะเห็น Pending ทุกครั้งจนกว่าจะอนุมัติ คำเชิญอีเมลมีอายุ 14 วันและเป็นรายการอนุญาตล่วงหน้า **ระบบไม่ส่งอีเมลเชิญอัตโนมัติ** ผู้ดูแลแจ้ง URL ให้ครูทางช่องทางของโรงเรียนได้

## 11. วิธี Run Local

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000` แล้ว Login ใช้ Supabase Remote Development หรือ Local ก็ได้

ทดสอบ Production Server:

```bash
npm run build
npm start
```

เมื่อเปลี่ยน `NEXT_PUBLIC_*` ใน Production ต้อง build/deploy ใหม่

## 12. วิธี Test

```bash
npm run lint
npm run typecheck
npm test
npm run db:test
npm run build
npx playwright install chromium
npm run test:e2e
```

`db:test` ใช้ PGlite ซึ่งรัน PostgreSQL จริงแบบ embedded โดยมี auth schema แบบจำลองสำหรับทดสอบ RLS ใช้ SQL test เดียวกับ Local และไม่ต้องมี Docker ทดสอบการเข้าถึงข้ามครู/โรงเรียน, ไม่มี role, anon, ยกระดับสิทธิ์, คะแนนเกินเต็ม, transactions, final calculation, workflow และ unlock audit

ถ้ามี Docker และ Supabase Local:

```bash
npm run db:start
npm run db:test:local
# เทียบเท่ากับ npx supabase test db
```

Browser tests เปิด PostgreSQL adapter สำหรับการทดสอบที่ `127.0.0.1:54329` และ Next ที่ 3000 โดยใช้ **identity สมมุติเฉพาะ tests** ส่วนข้อมูลและ RLS รันบน PostgreSQL จริง ชุดนี้ตรวจหน้าผู้ดูแล/ครู การนำเข้า บันทึกคะแนน ผลประเมิน ยืนยัน อนุมัติ ล็อก และ Export โดยไม่ต้องใช้บัญชี Google จริง ตัว adapter อยู่ใน `tests/support/` ไม่ถูก import เข้า Production

Google OAuth จริง, Supabase GoTrue/PostgREST จริง และ Vercel ต้องทำ smoke test อีกครั้งบนโครงการที่ตั้ง credential แล้ว ชุดทดสอบ embedded ไม่ได้ยืนยัน configuration ของบริการเหล่านั้น

บน Windows ใช้ Chrome ที่มีอยู่แทนดาวน์โหลด Chromium:

```powershell
$env:PLAYWRIGHT_CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
npm.cmd run test:e2e
```

ปิด dev server เดิมที่ port 3000 ก่อน E2E เพื่อให้ใช้ test environment ถูกชุด Screenshots อยู่ใน `test-results/` และ trace สร้างเมื่อทดสอบล้มเหลว

## 13. วิธี Deploy Vercel

1. Push repository ที่ไม่มี `.env.local` ไป Git provider
2. Import ใน Vercel เลือก Framework Next.js และ Node.js ที่รองรับ
3. ใส่ environment variables ตามข้อ 6 ใน Production/Preview ให้ตรง environment
4. รัน migration ที่ Supabase Production ก่อนเปิดใช้งาน
5. Deploy โดยใช้ `npm run build`
6. ตั้ง `NEXT_PUBLIC_SITE_URL=https://<DOMAIN>` และ Supabase Redirect URL ให้ตรง domain
7. ตรวจ Google Login, pending approval, teacher isolation และ Export บน HTTPS จริง
8. แยก Supabase Project ของ Preview/Development ออกจาก Production

ไม่ต้องตั้ง Service Worker หรือ offline sync ในรุ่นนี้ คะแนนใช้เซิร์ฟเวอร์เป็นข้อมูลหลัก แอปเตรียมโครงสร้างให้เพิ่ม PWA ภายหลังโดยไม่ cache ข้อมูลนักเรียนแบบ public

## 14. วิธี Backup Database

- เปิด backup/PITR ที่เหมาะกับแผน Supabase และนโยบายโรงเรียน
- ทดสอบ restore ในโครงการทดสอบตามรอบ ไม่ควรมีเพียงไฟล์ backup ที่ไม่เคยลองกู้คืน
- Export Excel เป็นรายงาน ไม่ใช่ backup ของ relational database และ auth
- สำรอง schema/data ตามวิธีใน Supabase documentation; เก็บไฟล์เข้ารหัสและจำกัดสิทธิ์

ตัวอย่าง CLI (รันกับโครงการที่ link ถูกต้อง):

```bash
npx supabase db dump -f backup-schema.sql
npx supabase db dump --data-only --use-copy -f backup-data.sql
```

คำสั่ง dump ปกติไม่ได้ครอบคลุมระบบภายนอกทั้งหมด ต้องแยกการสำรอง Auth/Storage และ secrets ตามเอกสาร Supabase และกระบวนการโรงเรียน ห้าม commit ไฟล์ backup ที่มีข้อมูลนักเรียน

## 15. Security Notes

- RLS เปิดทุกตาราง ไม่มี policy อ่านนักเรียน/คะแนนให้ anon
- `profiles.active` และ role ตรวจจากฐานข้อมูล ทุก Server Action ตรวจ authenticated user
- Teacher เขียนได้เฉพาะ assignment ตนเองในสถานะ draft และปีที่ไม่ archive
- Admin โรงเรียน A ไม่เห็นข้อมูลโรงเรียน B เว้นแต่มี role ใน B ด้วย
- FK integrity triggers ป้องกันแทรก enrollment/subject/year/category ข้ามโรงเรียนหรือข้าม assignment
- SECURITY DEFINER กำหนด `search_path=''`, อ้าง schema ชัดเจน, helper ภายในอยู่ schema `private` และ revoke สิทธิ์
- หมวดคะแนนปรับได้ น้ำหนักรวมต้องเท่ากับ 100 ก่อนคำนวณ/ส่งผล; คะแนนเต็มงานในแต่ละหมวดต้องครบก่อนส่งผล
- คะแนนรายคนต้องครบก่อนส่งผล ยกเว้นผู้ที่ครูเลือก ร/มส และยืนยันเหตุผลไว้ในผลฉบับร่าง ระบบจะคงสถานะที่ครูยืนยันไว้
- คะแนนจริงคำนวณใน PostgreSQL: `sum(category_score / category.max_score * category.weight)` ปัด 2 ตำแหน่งก่อนใช้ grading scale; จำนวนทศนิยมที่ตั้งค่าเป็นการแสดงผล
- เวลาเรียน: มา+สาย = เข้าเรียน; ลา/ป่วย/ขาดและรายการยังไม่บันทึกไม่นับเป็นเข้าเรียน เกณฑ์ต่ำกว่า 80% แสดงเตือน ไม่เปลี่ยนเป็น มส
- ข้อมูลสำคัญใช้ active/status/archived_at; ไม่ให้ client hard delete ตารางสำคัญ และ FK ไม่ cascade ลบคะแนน
- ล้างช่องคะแนนผ่าน RPC เท่านั้น และเก็บ before/after ใน audit
- ข้อมูล National Student ID ไม่แสดงและไม่ให้ authenticated client select คอลัมน์นั้นโดยตรง
- Export/Print ต้องตรวจสิทธิ์และมี audit; ห้ามแชร์ Excel/PDF กับผู้ไม่มีสิทธิ์
- ใช้ secure cookies บน Production HTTPS; SSR cookie ไม่ใช่ access token ที่จัดเก็บเองใน localStorage
- หน้า Login เปิดเผยเฉพาะชื่อ/โลโก้โรงเรียนที่ใช้แสดงต่อสาธารณะ ชื่อระบบ ปุ่ม Google และสถานะการเชื่อมต่อ เซิร์ฟเวอร์เลือกเพียงสองคอลัมน์สำหรับ branding ไม่มีการให้ anon SELECT ตาราง schools ข้อมูลโรงเรียนส่วนอื่นและนักเรียนอยู่หลังการอนุมัติ
- ชุดทดสอบและ demo แยกจาก Production; ห้ามเปิด test adapter ให้เครือข่ายสาธารณะ

การลบ/แก้ Audit Log ไม่ให้ผ่าน application role การจัดการระยะเก็บข้อมูลควรเป็นกระบวนการผู้ดูแลฐานข้อมูลที่สำรองและตรวจสอบได้

## 16. วิธี Import นักเรียน

1. สร้างปี ระดับชั้น และห้องปลายทาง
2. Admin → นักเรียน → นำเข้านักเรียน Excel
3. ดาวน์โหลด Template คอลัมน์ตามลำดับ:

```text
student_code | student_number | prefix | first_name | last_name | nickname
```

4. รหัสนักเรียนที่มีศูนย์นำหน้าให้ตั้ง Format เซลล์เป็น Text ก่อนกรอก
5. กรอกข้อมูลไม่เกิน 500 คนต่อชุด ไฟล์ `.xlsx` ไม่เกิน 3 MB ไม่ใส่สูตร
6. เลือกห้องและ Preview ระบบตรวจรูปแบบ ชื่อหาย รหัสซ้ำ เลขที่ซ้ำ ทั้งในไฟล์และฐานข้อมูล
7. แก้ทุก error ก่อนยืนยันนำเข้า Database ตรวจซ้ำภายใน transaction อีกครั้ง จึงไม่เกิดการนำเข้าครึ่งชุดแบบเงียบ ๆ

นักเรียนเดิมขึ้นปีใหม่ไม่ต้องสร้างรหัสซ้ำ ให้ใช้ “จัดห้อง / ย้ายนักเรียน” เพิ่ม enrollment ในปีใหม่ การย้ายห้องกลางปีใช้ปุ่ม “ย้ายห้อง” ระบบคง enrollment เก่าและคะแนนเก่าไว้ หากห้องมีผลยืนยันแล้วต้องเปิดแก้ไขก่อนเปลี่ยนรายชื่อ

## 17. วิธีสร้างปีการศึกษาใหม่

1. ตรวจรายงานเดิมและ workflow ให้ครบ
2. Admin → ปีการศึกษา → เก็บเข้าคลังปีเดิม ยืนยัน dialog (ดู/พิมพ์ย้อนหลังได้)
3. สร้างปีใหม่ เช่น 2570 เปิดเป็นปีปัจจุบันได้ปีเดียวต่อโรงเรียน
4. สร้างภาคเรียนและช่วงวันที่ เปิดภาคเรียนปัจจุบันได้หนึ่งรายการต่อปี
5. สร้างห้องในปีใหม่ เลือกระดับชั้นและครูประจำชั้น
6. ลงทะเบียนนักเรียนเดิมหรือ Import นักเรียนใหม่
7. มอบหมายครู วิชา ห้อง และภาคเรียนใหม่
8. กำหนดหมวดคะแนน/งาน/ตัวชี้วัดใหม่ แล้วเริ่มเช็กชื่อและบันทึกคะแนน

คะแนนและรายงานในปีเก่าไม่ถูกลบ ใช้ filter ปีการศึกษาเพื่อเปิดย้อนหลัง

## เอกสารอ้างอิงที่ใช้ตรวจแนวทาง

- [Supabase SSR clients และ Proxy](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase Google Login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Supabase Database backups](https://supabase.com/docs/guides/platform/backups)

ระบบยังต้องตั้งค่า credentials และรัน migration ในโครงการจริงก่อนใช้งาน ไม่มีการอ้างว่าสร้าง Remote Database หรือเชื่อม Google/Vercel สำเร็จในเครื่องที่ไม่ได้ตั้งบัญชีเหล่านั้น

ดู [ผลตรวจและขอบเขตการทดสอบ](docs/verification.md) และ [จำนวน schema จริง](docs/database-inventory.json)
