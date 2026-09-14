# Deploy บน Netlify

## แก้ ERR_REQUIRE_ESM จาก firebase-admin / jwks-rsa / jose

Log วันที่ 11 กันยายน 2026 ของ `mkattendance.netlify.app` ยืนยันว่า server โหลด `firebase-admin/auth` ไม่ผ่าน เพราะ `jwks-rsa` เรียก `require('jose')` แต่ `jose` เป็น ESM-only ปัญหาเกิดขณะโหลดโมดูล ก่อนเชื่อมต่อ Firebase จึงไม่ได้เกิดจากการรอข้อมูลชื่อ/โลโก้โรงเรียน

แพ็กเกจใน lockfile คือ `firebase-admin@14.3.0 → jwks-rsa@4.1.0 → jose@6.2.12` เครื่องพัฒนาใช้ Node.js 26.7.0 ที่โหลดได้ ส่วน Lambda ปิด `require(ESM)` โดยค่าเริ่มต้นใน Node.js 22/24

โปรเจกต์แก้ด้วย `patches/jwks-rsa+4.1.0.patch` ซึ่งเปลี่ยนการโหลด `jose` เป็น `await import('jose')` ภายในฟังก์ชัน async ทั้งส่วนแปลง JWK และ Passport integration โดยยังใช้แพ็กเกจและการตรวจลายเซ็นเดิม แนวทางนี้ตรงกับข้อเสนอแก้ไข upstream [PR #508](https://github.com/auth0/node-jwks-rsa/pull/508) ที่ยังไม่ถูกรวม ณ วันที่ตรวจ

`npm run build` เรียก `prebuild` เพื่อใช้แพตช์ด้วย `patch-package --error-on-fail` และรัน `test:runtime` ก่อน Next.js build ทุกครั้ง รวมถึงเมื่อติดตั้ง dependency ใหม่บน Netlify หากแพตช์ใช้ไม่ได้หรือการทดสอบล้มเหลว build จะหยุด ต้องใช้คำสั่ง `npm run build` ไม่เรียก `next build` โดยตรง

ทดสอบโดยปิด synchronous ESM require แบบ runtime ที่มีปัญหา ตรวจทั้งการโหลด Firebase Auth, การแปลง RSA/EC JWK, ลายเซ็น token ที่ถูกต้อง, การปฏิเสธ token ที่แก้ payload, key ID ที่ไม่มี และ Passport callback โดยใช้กุญแจชั่วคราวในหน่วยความจำ ไม่ใช้ credentials และไม่เชื่อมฐานข้อมูล:

```powershell
npm run prebuild
npm run build
```

ส่ง `package.json`, `package-lock.json`, โฟลเดอร์ `patches`, `tests/runtime` และ `netlify.toml` ขึ้น GitHub ที่ Netlify เชื่อมอยู่ แล้ว deploy commit ใหม่ ใน build log ต้องพบ `jwks-rsa@4.1.0 ✔` และ runtime tests ผ่าน 3 รายการ การ deploy commit เก่าซ้ำจะยังไม่มีแพตช์นี้

ตั้ง `AWS_LAMBDA_JS_RUNTIME=nodejs22.x` ใน Netlify UI ให้ครอบคลุม production ตามเดิม แพตช์นี้ไม่ต้องพึ่ง `NODE_OPTIONS=--experimental-require-module` อีกต่อไป หากใส่ไว้แล้วสามารถคงไว้ระหว่าง deploy แพตช์ได้ การใส่ runtime variables ใน `[build.environment]` ของ `netlify.toml` อย่างเดียวไม่ส่งค่าให้ Functions

ผลทดสอบ runtime ยืนยันบน Node.js 26.7.0 ในเครื่องด้วย `--no-experimental-require-module` แล้ว ยังต้องตรวจ deployment จริงของ Netlify หลัง deploy ให้เปิด `/login` ซึ่งควรแสดงหน้าเว็บ และส่ง GET ไป `/api/auth/session` ซึ่งควรตอบ 405 เพราะรองรับเฉพาะ POST หากยังได้ 500 ให้ตรวจ log รอบใหม่ที่ Cloud compute → Functions → เลือก Next.js server handler

ตรวจ production build ในเครื่องวันที่ 11 กันยายน 2026: `npm run build` ผ่าน, runtime tests ผ่าน 3 รายการ, unit tests ผ่าน 51 รายการ และเปิด `next start` ด้วย `--no-experimental-require-module` ได้ `/login` ตอบ 200 กับ GET `/api/auth/session` ตอบ 405 การอ่าน branding ในรอบนี้ timeout แล้วใช้ค่าเริ่มต้น จึงยังไม่ยืนยันการเชื่อม Firestore หรือ Google login จริง

อ้างอิง: [AWS Lambda: Experimental Node.js features](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html#nodejs-experimental-features), [Netlify: Node.js version for runtime](https://docs.netlify.com/build/functions/configuration/#node-js-version-for-runtime), [รายงานปัญหา jwks-rsa #507](https://github.com/auth0/node-jwks-rsa/issues/507)

## ตั้งค่า deploy และ Firebase

เชื่อม Git repository กับ Netlify แล้ว deploy จาก source โดยใช้ `netlify.toml` ในโฟลเดอร์นี้: build command `npm run build`, publish directory `.next`, Node.js 22 และ Next.js adapter ที่ Netlify ติดตั้งให้อัตโนมัติ เว็บนี้ใช้ server rendering, session cookies และ Server Actions จึงไม่รองรับการอัปโหลดเฉพาะ `public` หรือ static export

ตั้งค่าที่ Netlify → Project configuration → Environment variables ให้ตรงกับ Firebase project ที่ใช้จริง:

| ตัวแปร                             | Scope หากมีตัวเลือก  |
| ---------------------------------- | -------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`     | Builds และ Functions |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Builds และ Functions |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`  | Builds และ Functions |
| `NEXT_PUBLIC_FIREBASE_APP_ID`      | Builds และ Functions |
| `NEXT_PUBLIC_SITE_URL`             | Builds และ Functions |
| `FIREBASE_CLIENT_EMAIL`            | Functions            |
| `FIREBASE_PRIVATE_KEY`             | Functions            |
| `BOOTSTRAP_ADMIN_EMAILS`           | Functions            |

หากเลือก scope ไม่ได้ ให้ใช้ all scopes ตั้ง `NEXT_PUBLIC_SITE_URL` เป็น URL จริงที่มี `https://` เช่น `https://your-site.netlify.app` และเพิ่ม hostname เดียวกันใน Firebase Authentication → Settings → Authorized domains เปิด Google provider และสร้าง Firestore ตาม [คู่มือ Firebase](firebase-setup.md)

คัดลอก `FIREBASE_CLIENT_EMAIL` และ `FIREBASE_PRIVATE_KEY` จาก Service account ของ project เดียวกัน โดยใส่ private key เป็น PEM ที่มีบรรทัดจริงหรือ `\n` ได้ ไม่ใส่เครื่องหมายคำพูดครอบค่าในช่อง Netlify และไม่ใส่ JSON ทั้งไฟล์ ห้ามนำ private key ไปใส่ตัวแปร `NEXT_PUBLIC_*` หรือ commit ลง Git

ตัวอ่าน credentials รองรับเครื่องหมายคำพูดและรูปแบบ `FIREBASE_PRIVATE_KEY="..."` ที่อาจติดมาจากการคัดลอกด้วย โดยตัดเฉพาะส่วนครอบและแปลงบรรทัด ไม่แก้เนื้อหาคีย์ที่ขาดหรือคีย์ที่ถูกเพิกถอน หน้า login แสดงข้อความผิดพลาดค้างไว้พร้อมรหัสอ้างอิง เช่น `LOGIN-KEY`, `LOGIN-CREDENTIAL`, `LOGIN-PROFILE`, `LOGIN-SESSION` เพื่อส่งให้ผู้ดูแลได้โดยไม่ต้องเปิด Function log

ไฟล์ `.env.local` ในเครื่องไม่ได้ถูกส่งขึ้น Git จึงต้องตั้งค่าบน Netlify แยกต่างหาก อย่าใช้ `GOOGLE_APPLICATION_CREDENTIALS` ที่ชี้ path ในเครื่อง Windows และอย่าตั้งตัวแปร emulator บน production ตัวแปรที่เขียนใน `netlify.toml` ไม่ส่งต่อให้ Functions เมื่อแก้ environment variables แล้วต้อง deploy ใหม่ รวมถึงค่าที่ขึ้นต้น `NEXT_PUBLIC_` ซึ่งฝังตอน build

## ตรวจ Internal Server Error

เปิด Function logs ของ Next.js server handler แล้วเปิด URL ที่มีปัญหาอีกครั้ง เก็บ error และ stack trace พร้อม path และเวลาที่เกิด โดยไม่ส่ง credentials หรือ session cookies:

- `[firebase/login-branding] unavailable`: การอ่านชื่อ/โลโก้โรงเรียนล้มเหลว ตรวจ Firebase credentials, Firestore และรหัส SDK ที่ตามหลัง
- `[firebase/login-branding] timeout`: อ่านข้อมูลโรงเรียนเกิน 2 วินาที หน้า login จะใช้ชื่อ/ไอคอนเริ่มต้นต่อไป การจำกัดเวลานี้ไม่ได้ยกเลิกคำขอ Firestore และไม่ได้แก้การเชื่อมต่อสำหรับการเข้าสู่ระบบ
- `Could not load the default credentials` หรือ private-key/PEM error: ตรวจ Service account และ Functions scope
- `Emulators are forbidden in production`: ลบตัวแปร emulator ออกจาก production
- `Cannot find module`, adapter หรือ proxy error: ตรวจ build log, Next.js adapter และ Node runtime ของ deployment
- `/api/auth/session` ตอบ 403: ตรวจ `NEXT_PUBLIC_SITE_URL` ให้ตรง origin ที่ใช้เข้าเว็บ
- `[auth/session] failed`: ส่งเฉพาะ `stage`, `code`, `reason` จาก log เพื่อแยกการตั้งค่า Firebase (`initialize-firebase`), ตรวจ Google token (`verify-token`), ลงทะเบียนใน Firestore (`register-profile`), สร้าง cookie (`create-session`) และอ่านสิทธิ์ (`read-permissions`) หาก `reason` เป็น `invalid-private-key-format` ให้ตรวจรูปแบบค่า `FIREBASE_PRIVATE_KEY` ใน Netlify โดยไม่ส่งคีย์ลงแชต

การไม่มี `netlify.toml` เพียงอย่างเดียวไม่ยืนยันว่าเป็นต้นเหตุ เพราะ Netlify ตรวจ Next.js อัตโนมัติได้ ต้องใช้ log ของ deployment ที่มีปัญหาเพื่อระบุสาเหตุจริง

อ้างอิง: [Next.js บน Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [Environment variables ของ Functions](https://docs.netlify.com/build/functions/environment-variables/)
