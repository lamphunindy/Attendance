# ผลตรวจ Firebase วันที่ 8 กันยายน 2569

ผลตรวจการปรับฟอร์มและสมัครครูรอบถัดมาอยู่ใน [verification-enrollment.md](./verification-enrollment.md) รายงานด้านล่างเป็นผลตรวจเมื่อย้าย backend ไป Firebase

ระบบเว็บใช้ Firebase Authentication และ Cloud Firestore แล้ว ไม่มี Supabase SDK หรือการเรียก Supabase ใน `src/` ข้อมูลแอปมี 27 collections และ business operations ฝั่งเซิร์ฟเวอร์ 14 รายการ ดู [โครงสร้างข้อมูล](./database-inventory-firebase.json)

| คำสั่ง | ผลล่าสุด |
| --- | --- |
| `npm run lint` | PASS ไม่มี error/warning |
| `npm run typecheck` | PASS |
| `npm test` | PASS 46 tests |
| `npm run db:test` | PASS 21 tests / 3 files บน Firebase Auth + Firestore Emulator |
| `npm run test:e2e` | PASS 15 tests บน Chrome; `.last-run.json` เป็น passed และไม่มี failedTests |
| `npm run build` | PASS Next.js 16.3.4 production build |
| `npm audit --omit=dev` | ไม่พบช่องโหว่ใน production dependencies |

Database tests ตรวจสิทธิ์ครูและผู้ดูแลระหว่างสองโรงเรียน การปฏิเสธผู้ไม่มี role/บัญชีปิดใช้งาน และ Security Rules ที่ปฏิเสธ browser client แม้ login แล้ว ตรวจคะแนนศูนย์ คะแนนเกินเต็ม การ rollback ทั้งชุด การคำนวณผลจากข้อมูลฐานข้อมูล การยืนยันและล็อกผล ปลดล็อกพร้อม Audit และตัวกรองวันเวลาประเทศไทย นอกจากนี้ตรวจ bootstrap, invitation และการย้าย Google identity โดยคง UUID รวมถึงป้องกันการนำเข้าซ้ำทับข้อมูลที่แก้หลังย้ายสำเร็จ

Browser tests เปิดหน้า Next.js จริงและใช้ Firebase Emulator จริง ทดสอบ popup ของ Firebase Auth Emulator แล้วสร้าง HttpOnly session cookie ผ่าน API ของแอป ตรวจ CSRF, token ปลอม และ session cookie ปลอม การทดสอบนี้ไม่ได้ติดต่อ Google OAuth production

ตรวจจอ 375, 390, 430, 768, 1024 และ 1440px พร้อม flow ผู้ดูแลสร้างปีการศึกษาและ Import Excel จากนั้นครูเช็กชื่อ สร้างหมวด/งาน บันทึกคะแนนและการประเมินทุกประเภท ยืนยันผล ผู้ดูแลอนุมัติและล็อกผล พิมพ์ PDF และ Export Excel ครบ 8 worksheets ตรวจคะแนนรวมที่คำนวณ และครูแก้คะแนนหลังล็อกไม่ได้

ภาพหน้าจอและ `test-results/PP5.pdf` เป็นข้อมูลสมมุติจาก emulator ไม่ใช่ข้อมูลนักเรียนจริง ผลตรวจ Supabase รุ่นเก่าเก็บใน [verification-supabase.md](./verification-supabase.md) และไม่ใช่ผลตรวจ backend รุ่นนี้

## สถานะข้อมูลจริงและสิ่งที่ยังไม่ได้เชื่อมต่อ

- อ่านฐานข้อมูล Supabase ต้นทางและเก็บ snapshot แล้ว: 27 ตาราง รวม 0 แถว และ 0 auth users จึงไม่มีข้อมูลบุคคลจริงให้โอน ต้นทางไม่ได้ถูกแก้หรือลบ
- ยังไม่มี Firebase project credentials ใน `.env.local` จึงยังไม่ได้นำเข้าปลายทางจริงหรือ deploy Firestore Rules ไป Firebase production
- Google OAuth production, โดเมน HTTPS, Vercel และระบบ backup/restore ของโครงการจริงยังไม่ได้ทดสอบ ต้องตั้งค่าบริการภายนอกตาม [คู่มือ Firebase](./firebase-setup.md)
- การทดสอบ migration ใช้ต้นทาง HTTP จำลองและ Firebase Emulator เพื่อพิสูจน์การรักษา UUID, ข้อมูล, Google identity และการตรวจสอบปลายทาง ไม่ได้อ้างว่า migration ไป Firebase production สำเร็จแล้ว

## ข้อจำกัดในการดูแลระบบ

Firestore Rules ปิด client access ทั้งหมด ส่วน Firebase Admin SDK ข้าม Rules ได้ จึงตรวจสิทธิ์และความสัมพันธ์ของข้อมูลที่ server repository/operations ทุกครั้ง การเขียนใช้ transaction lock ต่อโรงเรียนเพื่อรักษาข้อมูลซ้ำและ workflow ควรวัด latency/read costs ก่อนขยายการใช้งานพร้อมกันจำนวนมาก การค้นหาข้อความปัจจุบันกรองในขอบเขตข้อมูลบนเซิร์ฟเวอร์ ยังไม่มี full-text search service

Full dependency audit ยังมี 7 moderate findings ในเครื่องมือพัฒนา Firebase CLI และ dependencies ที่เกี่ยวข้อง ขณะที่ production dependencies ไม่มี findings ไม่ได้ใช้ force downgrade เพื่อแก้รายการของเครื่องมือทดสอบ
