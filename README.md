# Morii Queue System (MQS)

เว็บภาษาไทยสำหรับแอดมินจัดการเช่ากล้องหลายคน ธีมขาว–ชมพู ใช้ Next.js App Router, TypeScript, Tailwind, Supabase, FullCalendar และ ExcelJS

แผนและกติกาอยู่ใน [project.md](project.md) โค้ดพร้อมเชื่อม Supabase และ deploy บน Vercel ปัจจุบันยังไม่ได้สร้างบริการคลาวด์หรือ GitHub repository

## เริ่มใช้งานในเครื่อง

ต้องมี Node.js 22 ขึ้นไป และ pnpm 11.25.0:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
```

คัดลอก `.env.example` เป็น `.env.local` แล้วตั้งค่า:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
MQS_DEMO_MODE=false
```

```sh
pnpm dev
```

เปิด <http://localhost:3000> ถ้ายังไม่ตั้งค่าฐานข้อมูลจะแสดงหน้าคู่มือเริ่มต้น

### ดูตัวอย่างโดยยังไม่มี Supabase

ตั้ง `MQS_DEMO_MODE=true` ใน `.env.local` แล้วเปิด <http://localhost:3000/demo> ข้อมูลในหน้านี้เป็นข้อมูลจำลอง ฟอร์มและตัวกรองทดลองได้ แต่ไม่มีการบันทึกหรือ export ผ่าน API จริง ไม่มีการข้ามสิทธิ์ Auth/RLS และไม่มี localStorage ที่ใช้แทนฐานข้อมูล

ปิดโหมดตัวอย่างด้วย `MQS_DEMO_MODE=false` ก่อนใช้งาน production `/demo` จะตอบ 404 เมื่อปิดโหมด

## ตั้งค่า Supabase

1. สร้าง Supabase project แล้วเปิด SQL Editor
2. รันไฟล์ใน `supabase/migrations` ตามลำดับ `202610070001_mqs.sql` แล้ว `202610070002_admin_owner.sql` **ไฟล์ละครั้งเดียว** หรือใช้ Supabase CLI link project และ `supabase db push` ถ้ารัน migration แรกแล้วให้รันเฉพาะไฟล์ใหม่
3. ไป Authentication → Sign In / Providers แล้วปิดการสมัครสมาชิกใหม่ (Allow new users to sign up)
4. ตั้ง Site URL เป็น URL เว็บไซต์จริง ส่วน local ใช้ `http://localhost:3000` หากยังทดสอบในเครื่อง
5. สร้างผู้ใช้ผ่าน Authentication → Users → Add user ด้วยอีเมลและรหัสผ่าน เปิดยืนยันอีเมลให้ผู้ใช้ที่ผู้ดูแลสร้างเอง
6. กำหนดบัญชีของเจ้าของระบบเป็นแอดมินหลักครั้งแรกด้วย SQL โดยแทนที่อีเมลตัวอย่าง (migration ไม่เลือกเจ้าของให้โดยอัตโนมัติ):

```sql
insert into public.admin_members (user_id, display_name, active, role)
select id, 'ชื่อแอดมินหลัก', true, 'owner'
from auth.users
where lower(email) = lower('admin@example.com')
on conflict (user_id)
do update set display_name = excluded.display_name, active = true, role = 'owner';
```

ตรวจว่ามีแถวที่เพิ่มจริง:

```sql
select user_id, display_name, active, role from public.admin_members;
```

จากนั้นแอดมินหลักล็อกอินที่ `/login` และเปิด **จัดการแอดมิน** (`/admins`) เพื่อสร้างบัญชีด้วยชื่อ อีเมล และรหัสผ่านอย่างน้อย 12 ตัวอักษร หรือเพิ่มสิทธิ์บัญชี Auth ที่มีอยู่แล้ว ผู้ดูแลตรวจสอบอีเมลของผู้รับและส่งข้อมูลบัญชีให้เจ้าของบัญชีโดยตรง ระบบไม่ส่งอีเมลอัตโนมัติและไม่เปิดสมัครสมาชิกสาธารณะ

แอดมินหลักเปิด–ปิดสิทธิ์สมาชิกจากหน้าเว็บได้ แอดมินทั่วไปจัดการงานเช่าเหมือนเดิมแต่เข้าหน้าสิทธิ์หรือเรียก RPC จัดการสมาชิกไม่ได้ การปิดสิทธิ์มีผลกับการอ่าน/เขียนครั้งถัดไปแม้ยังมี session อยู่ ประวัติคิวคงอยู่ บัญชี owner ไม่สามารถถูกปิดสิทธิ์หรือเปลี่ยนบทบาทผ่านหน้าเว็บได้ การตั้งหรือเปลี่ยน owner ทำผ่าน SQL โดยผู้ดูแล Supabase เท่านั้น

ตั้ง `SUPABASE_SECRET_KEY` (secret key หรือ legacy service-role key) เฉพาะฝั่งเซิร์ฟเวอร์ใน `.env.local` และ Vercel ห้ามมีคำนำหน้า `NEXT_PUBLIC_` และห้าม commit ใช้เฉพาะการสร้าง Auth account หลังตรวจ owner ส่วนการเพิ่มสิทธิ์ใช้ RPC ภายใต้บัญชีผู้เรียกและตรวจ owner ในฐานข้อมูลอีกครั้ง ตาม [Supabase Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) ถ้าไม่ใส่ secret key ยังเพิ่มสิทธิ์ให้บัญชี Auth ที่สร้างไว้แล้วได้

การสร้าง Auth account และเพิ่มสมาชิกเป็นคนละระบบ ถ้าสร้างบัญชีสำเร็จแต่เพิ่มสิทธิ์ล้มเหลว บัญชียังเข้าแอปไม่ได้ ให้เลือก “เพิ่มสิทธิ์บัญชีที่มีอยู่แล้ว” ด้วยอีเมลเดิมเพื่อทำต่อ ไม่ต้องสร้างซ้ำ รหัสผ่านที่มีอยู่ไม่ถูกแก้ไข รหัสผ่านที่ลืมยังจัดการผ่าน Supabase Auth โดยเจ้าของระบบ

แชร์ URL จาก Vercel ให้ทีม เช่น `https://ชื่อเว็บ.vercel.app/login` หรือแชร์หน้าแรกซึ่งจะพาไปล็อกอินเมื่อยังไม่มี session; `127.0.0.1`/`localhost` เป็นลิงก์เฉพาะเครื่อง ไม่ใช่ลิงก์สำหรับทีม หน้า `/login` ดูตัวอย่างฟอร์มได้แม้ยังไม่ตั้งค่า แต่ปุ่มล็อกอินจะปิดไว้จนกว่าจะเชื่อม Supabase

### ข้อมูลเริ่มต้น

Migration สร้างวิธีส่ง 4 รายการ: นัดรับ (0/0, ไม่บังคับที่อยู่), EMS (2/2), แมสจากคอน (0/0), แมสจากอ้อม (0/0) ไม่มีการใส่ลูกค้าหรือคิวจำลองลงฐานข้อมูลจริง

หลังล็อกอิน ให้เพิ่มรุ่นกล้อง → กล้องรายตัว → rate → อุปกรณ์ จากนั้นสร้างคิวได้ทันที

## การใช้งาน

- **ปฏิทิน**: ตารางรายเดือนเป็นค่าเริ่มต้นทั้งคอมพิวเตอร์และมือถือ สลับเป็นตารางรายสัปดาห์ได้ ไม่มีมุมมองรายการ คลิกวันเพิ่มคิว คลิกชื่อกล้องแก้ทั้งคิว กรองตามรุ่น ตัวกล้อง วิธีส่ง สถานะ
- **กล้องและอุปกรณ์**: รุ่นกล้องหนึ่งรุ่นมีหลายตัว แต่ละตัวแยกรหัส หมายเลข สี ปิดใช้งานแทนลบ ราคาเช่าระบุต่อรุ่นตามจำนวนวัน
- **คิว**: หลายกล้องในคิวเดียวกันใช้ลูกค้า ช่วงเช่า และวิธีส่งเดียวกัน หากต่างกันให้แยกคิว อุปกรณ์ระบุจำนวนได้แต่ไม่กันสต็อก
- **วันเช่า**: รวมวันต้นและวันปลาย เช่น 10–12 = 3 วัน วิธีส่ง EMS กัน 8–14 คิวถัดไปเริ่มได้วันที่ 15 วันเผื่อนับวันปฏิทินรวมวันหยุด
- **ราคา**: แนะนำเฉพาะ rate ตรงจำนวนวัน ไม่มี rate ให้กรอกเอง ราคาและวันเผื่อเก็บไว้กับคิว การแก้ตั้งค่าไม่เปลี่ยนคิวเก่า
- **สถานะ**: จองแล้ว/ส่งมอบแล้ว/คืนแล้ว/ยกเลิก เปลี่ยนโดยแอดมิน ยกเลิกคืนวันว่าง เปิดกลับต้องผ่านตรวจชน คืนแล้วเก็บช่วงวันเดิม
- **คิวชน**: แจ้งคิวที่ทับระหว่างเลือกกล้อง และฐานข้อมูลป้องกันซ้ำอีกชั้น หากตัวใดชนจะไม่บันทึกทั้งคิว แก้คิวด้วยข้อมูลเวอร์ชันเก่าจะถูกปฏิเสธพร้อมปุ่มโหลดล่าสุด
- **ปฏิทินข้ามเดือน**: ใช้ Asia/Bangkok ตรวจทุกนาทีและเมื่อกลับเข้าแท็บ หากเดือน/ปีเปลี่ยนจะเลื่อนไปเดือนปัจจุบัน ทั้งรายการคิวและ catalog รีเฟรชเมื่อกลับเข้าแท็บ
- **Dashboard**: กรองตามวันเริ่มเช่า ยอดจริงนับส่งมอบแล้ว/คืนแล้ว ยอดจองแยกต่างหาก รายรุ่นแสดงคิวไม่ซ้ำและจำนวนกล้อง รายตัวหนึ่งครั้งต่อกล้องต่อคิว
- **Export**: XLSX แยกชีตตามรุ่น, CSV รวม หนึ่งแถวต่อกล้องต่อคิว ไม่มีการใส่ยอดรวมคิวซ้ำทุกแถว ตัวกรองใช้วันเริ่มเช่า

### เปิดไฟล์ใน Google Sheets

เลือกไฟล์ → นำเข้า → อัปโหลด แล้วเลือก `.xlsx` เพื่อเก็บหลายชีตและชนิดข้อความของเบอร์โทร หากใช้ `.csv` ให้ปิดการแปลงข้อความเป็นตัวเลข/วันที่/สูตรขณะนำเข้า เพื่อรักษาเลขศูนย์นำหน้า CSV มี UTF-8 BOM และข้อมูลข้อความที่เริ่มเหมือนสูตรจะถูกทำให้เป็นข้อความ

ชื่อชีต XLSX จะตัดอักขระต้องห้าม จำกัด 31 ตัวอักษร และเติมหมายเลขเมื่อชื่อซ้ำ หากไม่มีข้อมูลในช่วงที่เลือกจะได้ชีตหัวตารางว่าง

## โครงสร้างและสัญญา API

```text
src/app/(workspace)/    หน้าที่ต้องล็อกอิน
src/app/actions.ts      Server Actions ที่ตรวจสมาชิกแอดมินก่อนเขียน
src/app/api/            อ่านคิวและดาวน์โหลดไฟล์
src/components/        หน้าจอ ฟอร์ม ปฏิทิน และ UI
src/lib/               ชนิดข้อมูล กติกาวัน สถิติ export Auth และ data access
supabase/migrations/   Schema, RLS, constraints, transactional RPC
tests/                 Domain, export, database, concurrency และ browser tests
```

- `GET /api/bookings?start=YYYY-MM-DD&end=YYYY-MM-DD`: คิวที่ช่วงกันกล้องทับช่วงที่ขอ รวมกล้องและอุปกรณ์
- `GET /api/bookings?mode=report&start=...&end=...`: คิวที่วันเริ่มเช่าอยู่ในช่วง
- `GET /api/bookings?id=<uuid>`: รายละเอียดคิวล่าสุดสำหรับแก้ไข
- `GET /api/export?format=xlsx|csv&start=...&end=...&model=<uuid หรือว่าง>&status=<สถานะหรือว่าง>`: ไฟล์ที่กรองแล้ว
- ทุก API ตรวจ Supabase session และ active admin ก่อนอ่านข้อมูล และไม่ cache ข้อมูลส่วนตัวสาธารณะ
- Catalog เขียนผ่าน `saveCatalog` Server Action ที่เลือกตารางและ validate ฟิลด์จาก allowlist
- `save_booking(payload jsonb)` RPC รับข้อมูลคิว `id`/`expected_version` เมื่อแก้, `cameras:[{unit_id,price}]` และ `gadgets:[{gadget_id,quantity}]`
- `set_booking_status(booking_id, expected_version, new_status)` ใช้ธุรกรรมเดียวกันกับการบันทึกคิว
- RPC สร้างช่วงกันกล้องและ audit IDs เอง ตรวจสมาชิก ตรวจ version ด้วย row lock และใช้ PostgreSQL exclusion constraint กันการจองชน
- Client role ไม่มีสิทธิ์เขียนตรงไปยัง bookings/booking_cameras/booking_gadgets หรือแก้สมาชิกแอดมิน ทุกตารางเปิด RLS ไม่มี policy สำหรับผู้ใช้สาธารณะ
- เวลาเช่าเก็บแบบ `date` ส่วน audit timestamps เป็น `timestamptz` snapshot ของชื่อกล้อง/รุ่น ราคา และค่าจัดส่งช่วยรักษาประวัติ

สถานะภายใน: `booked`, `dispatched`, `returned`, `cancelled` จำนวนเงินเป็นบาท `numeric(12,2)`

## ทดสอบ

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Windows ที่มี Edge อยู่แล้วสามารถตั้ง `$env:PLAYWRIGHT_CHANNEL='msedge'` แล้วรัน `pnpm test:e2e` ได้ ชุด browser tests เปิด localhost พร้อมข้อมูลตัวอย่างเอง และต้องไม่มี Supabase credentials จริงอยู่ใน environment ที่รันทดสอบ

- `domain.test.ts`: วันเช่า/ข้ามปี/EMS, สถิติหลายกล้อง, validation, อ่านกลับ XLSX, CSV ภาษาไทย/สูตร/เบอร์โทร
- `database.test.ts`: ใช้ PGlite ซึ่งเป็น PostgreSQL แบบฝังพร้อม `btree_gist` รัน migration จริง ทดสอบ atomic rollback, stale version, snapshots, cancel/reopen และ RLS โดยจำลอง schema Auth ขั้นต่ำ
- `concurrency.test.ts`: ใช้ PostgreSQL สอง connection จริง ต้องตั้ง `MQS_TEST_DATABASE_URL` ไปยังฐานข้อมูลทดสอบว่างที่ลบทิ้งได้เท่านั้น ปฏิเสธฐานข้อมูลที่มีตารางแอปอยู่แล้ว ทดสอบว่าผู้จองพร้อมกันมีผู้ชนะคนเดียว
- `tests/e2e`: หน้าจอเดสก์ท็อปและมือถือ ฟอร์ม/ตัวกรอง/หน้าต่างแก้ไข ราคาแนะนำ หน้าจัดการ Dashboard Export API ที่ยังไม่ได้ตั้งค่า และเปลี่ยนเดือน/ปีตามเวลาไทย
- GitHub Actions จัด PostgreSQL service สำหรับ concurrency test พร้อม typecheck, lint, build และ Chromium browser tests

PGlite ใช้ connection เดียว จึงไม่แทนการทดสอบสอง connection จริง ส่วนการล็อกอิน Supabase Auth และ deploy จริงต้องตรวจหลังตั้งค่าบริการแล้ว

## GitHub และ Vercel

1. สร้าง GitHub repository ใหม่ (แนะนำ private สำหรับงานภายใน) ในโฟลเดอร์นี้เริ่ม Git branch `main` ไว้แล้ว
2. ตรวจ `git status` แล้ว commit source/config/tests/docs และไฟล์ต้นฉบับที่ต้องการเก็บ โดย `.env.local`, node_modules และผลทดสอบถูก ignore ไว้
3. เชื่อม remote และ push:

```sh
git remote add origin https://github.com/YOUR_ACCOUNT/morii-queue-system.git
git add .
git commit -m "Build Morii Queue System"
git push -u origin main
```

4. ใน Vercel เลือก Add New → Project → Import repository เลือก Next.js ใช้ Node.js 22 และ root เป็นโฟลเดอร์หลัก
5. ตั้ง install command เป็น `pnpm install --frozen-lockfile` และ build command เป็น `pnpm build`
6. เพิ่ม `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` และ `SUPABASE_SECRET_KEY` ใน Vercel Environment Variables ตั้ง `MQS_DEMO_MODE=false` สำหรับ production
7. ใช้ Supabase project แยกสำหรับ Preview และ Production เพื่อให้ข้อมูลทดลองไม่ปะปนข้อมูลลูกค้า ตั้ง production branch เป็น `main`
8. รัน migration และสร้างบัญชีแอดมินในแต่ละ Supabase project ก่อนใช้งาน ตรวจ login, เพิ่มคิว, การชนกันจากสองบัญชี, dashboard และ export ใน Preview ก่อน promote production
9. เมื่อได้ URL จริงให้อัปเดต Site URL ใน Supabase แล้ว redeploy หากเปลี่ยนค่า `NEXT_PUBLIC_*` เพราะค่าจะถูกผูกกับ build

ยังไม่ได้ตั้ง remote, push repository, สร้าง Supabase หรือ deploy Vercel เนื่องจากผู้ใช้เลือกให้เตรียมโค้ดและคู่มือก่อน ไม่มี secret keys ถูกสร้างหรือเก็บใน repo

## ข้อจำกัดเวอร์ชันแรก

ไม่รวม sync Google Sheets อัตโนมัติ ลูกค้าจองเอง การจ่ายเงิน มัดจำ ค่าขนส่ง ส่วนลด ค่าเช่าอุปกรณ์ และการกันสต็อกอุปกรณ์ การรีเฟรชเป็นเมื่อกลับเข้าแท็บ/รายนาทีบนปฏิทิน ไม่ใช่ realtime subscription แต่ฐานข้อมูลยังตรวจชนล่าสุดทุกครั้งที่บันทึก
