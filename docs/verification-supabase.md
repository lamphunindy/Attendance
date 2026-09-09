# ผลตรวจระบบ วันที่ 8 กันยายน 2569

| การตรวจ | ผล |
| --- | --- |
| `npm run lint` | PASS ไม่มี error/warning |
| `npm run typecheck` | PASS |
| `npm test` | PASS 46 กรณี |
| `npm run db:test` | PASS 41 กรณี (Auth 9 + RLS/transactions/workflow 32) |
| `npm run test:e2e` | PASS 11 กรณี, exit code 0 |
| `npm run build` | PASS Next.js 16.3.4 |
| npm dependency audit หลังแก้ uuid ของ ExcelJS | ไม่พบช่องโหว่ |
| `npx supabase test db` | ยังรัน Local stack ไม่ได้: ECONNREFUSED 127.0.0.1:54322; ไม่มี Docker |

Database tests รัน migrations ทั้ง 5 ไฟล์และ seed บน PostgreSQL embedded (PGlite) จริง ตรวจ role/RLS, bootstrap, invitation, disabled account, คะแนนเกินเต็ม, cross-tenant FK, rollback, ยืนยันผล, unlock audit และ ร ที่ครูยืนยัน

Browser tests ใช้หน้าจอ Next.js และ PostgreSQL/RLS จริงผ่าน HTTP adapter เฉพาะ tests ส่วน authenticated identity เป็นข้อมูลทดสอบ ไม่ได้ผ่าน Google OAuth หรือ Supabase GoTrue จริง

ทดสอบการแสดงผลที่ 375, 390, 430, 768, 1024, 1440px ในหน้า Login, Admin และการกรอกคะแนน รวมถึง flow นำเข้า Excel → เช็กชื่อ → สร้างงาน → บันทึกคะแนน → ประเมินทุกหมวด → Submit → Approve → Lock → Export Excel ทดสอบการแก้คะแนนหลังล็อกด้วย

สร้าง `test-results/PP5.pdf` จาก print CSS และยืนยันว่าไม่พิมพ์ Navigation และมีฟอนต์ NotoSansThai ฝังอยู่ใน PDF ไฟล์ Excel ที่ Export เปิดอ่านด้วย ExcelJS ได้ครบ 8 worksheets และมีคะแนนรวมที่คำนวณแล้วถูกต้อง

ข้อมูลใน screenshots/Excel/PDF เป็นนักเรียนสมมุติจากชุดทดสอบ ไม่ใช่ข้อมูลของโรงเรียนจริง

## ขอบเขตที่ยังต้องตรวจบนบริการจริง

- Google OAuth consent, authorized origins, redirect URI และการ exchange session กับ Supabase ที่ตั้งค่าแล้ว
- Migration และ SQL tests บน Supabase Local/Remote จริง
- Vercel deployment, HTTPS domain, environment variables และ backup/PITR ของโรงเรียน

ไม่มีการสร้าง Remote Supabase Project หรือ deploy Vercel ในการทำงานครั้งนี้ เนื่องจากไม่ได้ตั้ง credentials ของบริการเหล่านั้น

จำนวน schema ที่ตรวจจริงอยู่ใน [database-inventory.json](./database-inventory.json)
