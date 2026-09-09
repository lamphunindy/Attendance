# ตั้งค่า Firebase สำหรับระบบ ปพ.5 ออนไลน์

ระบบปัจจุบันใช้ Firebase Authentication และ Cloud Firestore ทั้งหมด ไม่มีการเรียก Supabase ขณะใช้งานเว็บ

วิธีสมัครครูด้วย Google เพิ่มนักเรียนพร้อมชั้น/เลขที่ และอัปโหลด Excel ดู [คู่มือครูและนักเรียน](./docs/teacher-student-setup.md)

## 1. สร้าง Firebase Project

เปิด https://console.firebase.google.com แล้วสร้างโปรเจกต์ สามารถเลือกเพิ่ม Firebase ให้ Google Cloud Project เดิมที่สร้าง OAuth ไว้ได้

ใน Project settings → General เพิ่มแอปชนิด Web (`</>`) ตั้งชื่อ `PP5 Online` แล้วคัดลอก firebaseConfig มาใส่ `.env.local` ตามชื่อดังนี้:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=ค่าจาก_apiKey
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ค่าจาก_authDomain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ค่าจาก_projectId
NEXT_PUBLIC_FIREBASE_APP_ID=ค่าจาก_appId
NEXT_PUBLIC_SITE_URL=http://localhost:3000
BOOTSTRAP_ADMIN_EMAILS=อีเมล_Google_ของผู้ดูแลคนแรก
```

ไม่ต้องใช้ Supabase Publishable Key หรือ Supabase Service Role Key ในตัวเว็บอีกแล้ว เก็บคีย์เดิมไว้ชั่วคราวเฉพาะหากต้อง export ข้อมูลเก่า

## 2. เปิด Google Login

Firebase Console → Build → Authentication → Get started → Sign-in method → Google → Enable เลือก Support email แล้ว Save

Authentication → Settings → Authorized domains เพิ่ม `localhost` สำหรับเครื่องพัฒนา และโดเมนเว็บจริงตอน deploy (กรอก hostname อย่างเดียว)

โครงการใหม่อาจไม่มี localhost มาให้โดยอัตโนมัติ หากใช้ OAuth client ที่กำหนดเอง ให้ callback เป็น `https://<PROJECT_ID>.firebaseapp.com/__/auth/handler` ตาม authDomain ของโครงการ ไม่ใช้ callback ของ Supabase

## 3. สร้าง Cloud Firestore

Build → Firestore Database → Create database → เลือก Standard / Native mode ฐานข้อมูล `(default)` เลือกภูมิภาคใกล้กับเซิร์ฟเวอร์ Vercel แล้วเริ่มใน Production mode

ระบบจะสร้าง collection และเอกสารตามการใช้งาน ไม่ต้องคลิกสร้างตาราง และไม่มี SQL migration สำหรับฐานข้อมูลใหม่

## 4. ตั้งคีย์ฝั่งเซิร์ฟเวอร์

Project settings → Service accounts → Firebase Admin SDK → Generate new private key ดาวน์โหลด JSON แล้วเปิดดูสองค่าเพื่อใส่ใน `.env.local`:

```dotenv
FIREBASE_CLIENT_EMAIL=ค่าจาก_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nค่าจาก_private_key\n-----END PRIVATE KEY-----\n"
```

ต้องเป็น Service account ของ Firebase Project เดียวกับ `NEXT_PUBLIC_FIREBASE_PROJECT_ID` เก็บ private key ในไฟล์ environment หรือ secret manager เท่านั้น ห้ามใช้ชื่อที่ขึ้นต้น NEXT_PUBLIC และห้าม commit JSON ลง repository

บนเครื่องพัฒนาสามารถเลือกใช้ไฟล์ JSON แทนสองค่าข้างต้น:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=E:/secure/pp5-service-account.json
```

บน Vercel ใช้ `FIREBASE_CLIENT_EMAIL` และ `FIREBASE_PRIVATE_KEY` จาก JSON แทน path ของเครื่องพัฒนา

## 5. ติดตั้ง Security Rules

```powershell
npx.cmd firebase login
npx.cmd firebase deploy --only firestore --project YOUR_FIREBASE_PROJECT_ID
```

Rules ใน repository ปฏิเสธการอ่าน/เขียนจาก client ทั้งหมด รวมถึง client ที่ login แล้ว เว็บใช้งานผ่าน Server Components, Server Actions และ API ที่ตรวจ Firebase session กับสิทธิ์โรงเรียน/assignment เสมอ Firebase Admin SDK ข้าม Security Rules ได้ ดังนั้น repository ฝั่งเซิร์ฟเวอร์จึงเป็นจุดบังคับสิทธิ์หลัก ห้ามเพิ่ม API ที่เรียก Firestore Admin โดยไม่มีการตรวจสิทธิ์

Query ใช้ single-field indexes ซึ่ง Firestore สร้างให้อัตโนมัติ ไม่ต้องมี composite index สำหรับ query ปัจจุบัน

## 6. ย้ายข้อมูลเก่า (เมื่อมีข้อมูล Supabase)

เครื่องมือจะอ่าน Supabase เท่านั้น และไม่ลบ/แก้ไขต้นทาง ต้องหยุดการกรอกข้อมูลที่ต้นทางระหว่างย้าย

```powershell
npm.cmd run migration:export
npm.cmd run migration:import -- YOUR_FIREBASE_PROJECT_ID
npm.cmd run migration:verify
```

Snapshot อยู่ที่ `.migration-data/supabase-snapshot.json` เก็บครบ 27 ตาราง รวมสิทธิ์ Audit และ Google identity ของบัญชีเดิม รหัสผ่าน/token ไม่ถูกนำเข้า Firebase ใช้ UID เดิมที่เป็น UUID สำหรับบัญชีที่ย้าย เพื่อรักษา references

ปลายทางต้องเป็นโปรเจกต์ว่างก่อนเริ่ม ถ้าคำสั่งถูกขัดจังหวะ รัน import ด้วย snapshot เดิมซ้ำได้ ตรวจ hash แต่ละ collection เทียบ snapshot ก่อนเปิดใช้งาน และตรวจว่าต้นทางไม่ได้เปลี่ยนระหว่างย้าย หากตรวจไม่ผ่านสถานะ migration จะปิดการ login จนกว่าจะแก้ไขและรันสำเร็จ

ข้อมูล snapshot เป็นข้อมูลส่วนตัว ห้าม commit หรือส่งลงแชต หากต้องสร้าง snapshot ใหม่ ให้เก็บสำเนาเดิมในที่ปลอดภัยก่อน ห้ามใช้ไฟล์จากแหล่งที่ไม่เชื่อถือ

**ผลตรวจต้นทางวันที่ 8 กันยายน 2026:** 27 ตาราง รวม 0 แถว และ 0 auth users จึงยังไม่มีข้อมูลบุคคลที่ต้องโอน หากเริ่มใช้ Firebase ใหม่ได้ทันที สามารถข้าม import ได้; snapshot ว่างถูกเก็บไว้แล้ว

## 7. เปิดเว็บและสร้าง Admin

```powershell
npm.cmd install
npm.cmd run dev
```

เปิด http://localhost:3000/login และเข้าสู่ระบบ Google ด้วย email ที่อยู่ใน `BOOTSTRAP_ADMIN_EMAILS` ระบบตรวจ Google provider และ verified email จาก Firebase Admin SDK สร้างโรงเรียนแรก เกณฑ์เกรด ระดับชั้น คุณลักษณะ และหัวข้ออ่านคิดวิเคราะห์เขียนใน transaction เดียว

การ bootstrap ทำได้ครั้งเดียวและมี Audit ผู้ใช้อื่นจะเข้าหน้ารออนุมัติ หรือได้รับสิทธิ์ตาม invitation ที่ email ตรงและยังไม่หมดอายุ หลังสร้างผู้ดูแลแล้วให้ลบอีเมลออกจาก `BOOTSTRAP_ADMIN_EMAILS`

## 8. ทดสอบโดยไม่ใช้คีย์จริง

ติดตั้ง Java 21+ สำหรับ Firestore Emulator เครื่องที่พัฒนาโปรเจกต์นี้มี JRE ส่วนตัวใน `.tools/java21` แล้ว ไม่ได้เปลี่ยน Java ของระบบ

```powershell
npm.cmd test
npm.cmd run db:test
$env:PLAYWRIGHT_CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
npm.cmd run test:e2e
```

`db:test` เริ่ม Firebase Auth + Firestore Emulator แล้วทดสอบสิทธิ์และ transactions จริง; `test:e2e` เริ่ม emulator และเว็บที่ port 3001 เตรียมข้อมูลสมมุติ 10 คน รวมบัญชี Firebase Emulator ครู/ผู้ดูแล แล้วทำ flow บน browser ชุดทดสอบไม่ติดต่อ Firebase production

ต้องปิด emulator ที่เปิดเองบน 8080/9099 ก่อนรันคำสั่งที่เริ่ม emulator ให้อัตโนมัติ กด Ctrl+C เพื่อหยุด emulator ที่เปิดด้วย `npm run firebase:emulators`

## 9. Deploy และสำรองข้อมูล

Frontend ใช้ Vercel ได้ตามเดิม ตั้ง environment ฝั่ง client/server ตามข้อ 1 และ 4 และตั้ง NEXT_PUBLIC_SITE_URL เป็น HTTPS ของเว็บจริง เพิ่มโดเมนใน Firebase Authorized domains จากนั้น deploy Security Rules และเว็บ

ใช้ Firestore managed export/backup ไป Cloud Storage ตามแผนบริการของโครงการ และสำรอง Firebase Authentication users แยกจาก Firestore ต้องทดสอบ restore ในโครงการแยกก่อนใช้งานกับข้อมูลโรงเรียนจริง

## ข้อจำกัดที่ต้องทราบ

- Session cookie เป็น HttpOnly / SameSite=Lax และ Secure ใน production อายุ 5 วัน เมื่อหมดอายุต้อง login ใหม่ การ logout ยกเลิก Firebase refresh tokens ของบัญชีและล้าง cookie
- ธุรกรรมเก็บการอ่านทั้งหมดก่อนเขียน ตรวจกรณีผิดพลาดแล้ว rollback ทั้งหมด ไม่มีการแบ่งบันทึกคะแนนสำคัญเป็นหลาย batch แบบเงียบ ๆ คำขอที่ใหญ่เกินขีดจำกัดจะถูกปฏิเสธและให้ลดรายการ
- ปัจจุบัน serialize การเขียนภายในโรงเรียนด้วย transaction lock เพื่อรักษา uniqueness และความถูกต้องในช่วงเปลี่ยนฐานข้อมูล โรงเรียนที่มีการเขียนพร้อมกันสูงควรวัด latency/read costs และแบ่ง lock ตามขอบเขตงานก่อนขยายระบบ
- การค้นหาข้อความกรองบนเซิร์ฟเวอร์หลังจำกัดขอบเขตข้อมูล ใช้ได้กับข้อมูลโรงเรียนทั่วไป แต่ยังไม่มี full-text search index ภายนอก
- Google OAuth จริง / Firebase production / Vercel ต้องตั้งบัญชีภายนอกก่อน จึงจะทดสอบได้ ชุด emulator ไม่ใช่หลักฐานว่าเชื่อมบัญชี production สำเร็จ

อ้างอิง: https://firebase.google.com/docs/auth/web/google-signin · https://firebase.google.com/docs/auth/admin/manage-cookies · https://firebase.google.com/docs/firestore/manage-data/transactions · https://firebase.google.com/docs/firestore/security/rules-conditions

## 10. Module ของระบบ

ผู้ดูแลจัดการโรงเรียน ครู สิทธิ์ คำเชิญ นักเรียน ห้องเรียน รายวิชา ปีการศึกษา ภาคเรียน การมอบหมาย เกณฑ์เกรด และ Audit ได้ ครูเห็นเฉพาะห้อง/วิชาที่รับผิดชอบ มีเช็กชื่อ คะแนน ตัวชี้วัด อ่านคิดวิเคราะห์เขียน คุณลักษณะ สรุปผล ปพ.5 และพิมพ์ A4

Next.js 16 / React / TypeScript strict / Tailwind / Radix shadcn-style UI / Lucide / Noto Sans Thai / Zod / React Hook Form / Sonner / ExcelJS / Vitest / Playwright ยังคงใช้เหมือนเดิม

## 11. โครงสร้างข้อมูล

`src/lib/firebase/schema.json` กำหนดชนิดข้อมูลและ default ของ 27 collections โดยคงชื่อ field และ UUID เดิม ค่าเวลาเป็น ISO 8601 UTC string และวันที่เป็น YYYY-MM-DD เพื่อรักษาสัญญาข้อมูลข้ามการย้ายจาก PostgreSQL ใช้ `npm run db:types` สร้าง TypeScript types จากไฟล์นี้

ทุกเอกสารข้อมูลโรงเรียนมี `_school_id` ซึ่งเซิร์ฟเวอร์คำนวณจาก references; ข้อมูลคะแนนมี `_assignment_id` และ `_classroom_id` สำหรับระบุขอบเขต คีย์เหล่านี้ไม่ส่งออกผ่าน repository ไปยัง UI

`_system` เก็บสถานะ bootstrap/migration; `_locks` ใช้ serialize transactions ภายในโรงเรียน ไม่ใช่ข้อมูลให้ client อ่าน

## 12. การบันทึกและสิทธิ์

`permissions.ts` ตรวจ active profile, role, school และ classroom/assignment ทุก operation `validation.ts` ตรวจชนิด ค่าอ้างอิง ข้อมูลซ้ำ คะแนนเต็ม และป้องกันการเปลี่ยนข้อมูลข้ามโรงเรียน ส่วน `operations.ts` เป็น business operations ฝั่งเซิร์ฟเวอร์ ใช้ buffered Firestore transaction ใน `store.ts`

การคำนวณเกรดใช้คะแนนที่อ่านจาก Firestore ฝั่งเซิร์ฟเวอร์ ไม่รับ total จาก browser ผลที่ยืนยันแล้วแก้ไม่ได้ ผู้ดูแลปลดล็อกพร้อมเหตุผลอย่างน้อย 5 ตัวอักษร และมี Audit

## 13. Import / Export นักเรียน

ผู้ดูแลเปิดจัดการนักเรียน → Import เลือกห้องและดาวน์โหลด Template `.xlsx` คอลัมน์คือ student_code, student_number, prefix, first_name, last_name, nickname ตรวจ Preview ให้ผ่านก่อนยืนยัน ระบบตรวจซ้ำที่เซิร์ฟเวอร์และ rollback ทั้งหมดเมื่อมีแถวผิด รองรับครั้งละ 1–500 แถวภายใต้ขีดจำกัด transaction

Export รายชื่อ คะแนน เวลาเรียน ผลการเรียน และ ปพ.5 ใช้ข้อมูลที่ผู้ใช้งานมีสิทธิ์ พร้อม Audit การส่งออก ไม่แสดง national_student_id ใน UI หรือ Export ทั่วไป

## 14. ปีการศึกษาใหม่และเก็บปีเก่า

ปิดปีปัจจุบันหรือเลือกเก็บเข้าคลัง จากนั้นเพิ่มปี พ.ศ. ใหม่ ภาคเรียน ห้องเรียน รายวิชา และ assignment นักเรียนลงทะเบียนในห้องของปีใหม่ได้ คะแนนและเอกสารปีเก่ายังคงเปิดดู/พิมพ์ได้ ปีที่เก็บเข้าคลังแก้คะแนนไม่ได้

## 15. Development Demo Data

ข้อมูลตัวอย่างสร้างเฉพาะ emulator โดย `scripts/firebase-prepare-test.ts` ซึ่งปฏิเสธการทำงานถ้า host ไม่ใช่ loopback emulator ไม่มี auto-seed นักเรียนปลอมใน production ข้อมูลต้นทาง Supabase และ migration SQL ใน `legacy/supabase/` เก็บเป็นประวัติอ้างอิงสำหรับการย้ายเท่านั้น

## 16. Quality Commands

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run db:test
npm.cmd run test:e2e
npm.cmd run build
```

ชุด SQL tests และคู่มือเดิมใน `docs/legacy-supabase.md` เป็นประวัติของระบบก่อนย้าย ไม่ใช่ผลตรวจ Firebase รุ่นปัจจุบัน ดูผลตรวจล่าสุดใน `docs/verification.md`

## 17. เริ่มต้นหลัง Login

Setup Wizard ให้ผู้ดูแลกรอกชื่อ/โลโก้โรงเรียน → ปีการศึกษา → ภาคเรียน → ห้อง → รายวิชา → เชิญครู → เพิ่มนักเรียน จากนั้นมอบหมายครูประจำรายวิชา ครูจึงจะเห็นห้องบน Dashboard และเริ่มเช็กชื่อ/บันทึกคะแนนได้
