# Tech Stack: ระบบตารางเรียน

ร่างสำหรับ MVP ฝั่ง Frontend · 2026-10-27

**สถานะของแต่ละรายการ**

| ป้าย | ความหมาย |
|---|---|
| ✅ ติดตั้งแล้ว | มีใน `frontend/package.json` |
| 📄 ตามเอกสาร | ระบุไว้ในเอกสารขั้น 1-7 แต่ยังไม่ได้ทำ |
| 💡 เสนอ | ข้อเสนอ รอตัดสินใจ |
| ❓ ว่าง | ยังไม่มีข้อมูล ต้องถามอานนท์ |

> `tech-stack-list.txt` (สเปกเทคนิคฉบับเต็ม) ไม่อยู่ในชุดที่ได้รับ ฝั่ง Backend จึงมีเท่าที่เอกสารกล่าวถึง

---

## 1. ภาพรวม

```
เบราว์เซอร์ (React)  ──►  project service  ──►  FET solver
      ▲                        │
      │                        ▼
   ส่วนของเรา              PostgreSQL
                         (ฝั่งอานนท์ / Backend)
```

- Frontend ไม่คุยกับ solver ตรง ๆ ทุกอย่างผ่าน project service
- project service เป็นตัวเดียวที่เขียนข้อมูล ทุกการเปลี่ยนแปลงถูกบันทึกและเก็บเวอร์ชัน

---

## 2. Frontend (ส่วนที่เรารับผิดชอบ)

### 2.1 หลัก

| ส่วน | เทคโนโลยี | สถานะ |
|---|---|---|
| UI framework | React 19 | ✅ |
| Build / dev server | Vite 8 + `@vitejs/plugin-react` | ✅ |
| Lint | ESLint 10 (`eslint.config.js` ยังว่าง) | ✅ |
| ภาษา | JavaScript (JSX) | ✅ |

### 2.2 ที่เสนอเพิ่ม

| ส่วน | เทคโนโลยี | เหตุผล |
|---|---|---|
| Routing | React Router | แยกหน้าตามบทบาทใน sitemap |
| Server state | TanStack Query | ดึงผลการรันและ polling สถานะโดยไม่ต้องเขียน state เอง |
| Global state | React Context | พอสำหรับผู้ใช้ ภาควิชา ภาษา ข้าม Redux ใน MVP |
| i18n | react-i18next | ไทย / อังกฤษ ห้าม hardcode ข้อความ |
| ทดสอบ | Vitest + Testing Library + axe | ทุก `ui/` ต้องมี test และตรวจ a11y |
| TypeScript | ยังไม่ตัดสินใจ | ช่วยกำหนด type ของ data contract แต่ต้องเลือกก่อนเขียนโค้ดจริง |

### 2.3 ตามเอกสาร (ยังไม่ติดตั้ง)

| ส่วน | เทคโนโลยี | ใช้เมื่อไร |
|---|---|---|
| ลากวางตาราง | dnd-kit | ภายหลัง (MVP แค่เลือกเซลล์ + แผงแก้ + ลากพื้นฐาน) |
| สไตล์ | CSS Modules + `tokens.css` | ตั้งแต่เริ่ม ใช้ `var(--…)` เท่านั้น ไม่ใช้ UI kit สำเร็จรูป |
| ฟอนต์ | Sarabun (สำรอง Noto Sans Thai) | ทั้งหน้าเว็บและพิมพ์ A4 |

โครงโฟลเดอร์และกติกา: [design-system.md §7](7-design-system/design-system.md)
ทิศทางการ import ทางเดียว: `features → timetable/shell → ui → styles`

---

## 3. Backend และ Algorithm (ฝั่งอานนท์)

### 3.1 ที่เอกสารระบุ

| ส่วน | เทคโนโลยี | หมายเหตุ |
|---|---|---|
| Solver | FET | ผลลัพธ์ < 1 วินาที รองรับ locks (pin) |
| ตัวตรวจกฎ | core lib ของโครงการ | ใช้ตรวจสดตอนวางคาบ |
| ตัวกลาง | project service | ผู้เขียนข้อมูลเพียงตัวเดียว |
| **ภาษา + API framework** | **Python + FastAPI** | อานนท์ใช้สร้าง API และจัดการเอกสาร (นำเข้า/แปลงไฟล์หลักสูตร) ยืนยันแล้ว |
| API ที่รู้ | `POST /api/check` | ตรวจสดตอนวาง |
| ฐานข้อมูล | PostgreSQL ใน Docker | โครงสร้างตาม [ER diagram](6-er-diagram/er-diagram.mmd) |
| นำเข้าหลักสูตร | `pdftotext` + ตัวอ่านรูปแบบ, OCR + glyph tool (ไฟล์สแกน) | ยังไม่ยืนยันว่าอยู่ใน MVP ฝั่ง Frontend |

### 3.2 ที่เอกสารเสนอไว้ ยังไม่ตัดสินใจ

| ส่วน | ข้อเสนอ |
|---|---|
| ล็อกอิน | บัญชีในตัว (SSO ของสถาบัน = ภายหลัง) |
| แจ้งเตือน | ในแอปเสมอ + อีเมลเมื่อตั้ง SMTP |

### 3.3 FastAPI: ผลต่อฝั่ง Frontend

- FastAPI สร้างสเปก **OpenAPI** ให้อัตโนมัติที่ `/openapi.json` (และหน้าลองเรียกที่ `/docs`) ใช้เป็น data contract ได้เลย ไม่ต้องเขียนเอกสารแยก
- Frontend สร้าง type หรือ client จากสเปกนี้ได้ (เช่น `openapi-typescript`) ดังนั้น **ควรขอให้อานนท์กำหนด Pydantic model ของ request / response ของ Generate และ `/api/check` ก่อน** แล้วเราอ่านสเปกจากนั้น
- ถ้า Frontend (Vite, พอร์ต 5173) เรียก API คนละพอร์ต ต้องตั้ง CORS ที่ FastAPI หรือใช้ proxy ใน `vite.config.js`
- การอัปโหลดไฟล์หลักสูตรใช้ `multipart/form-data` (FastAPI รับด้วย `UploadFile`)
- งานนาน (OCR, solver) ควรเป็น background task + ให้ Frontend poll สถานะ

### 3.4 ยังว่าง (ต้องถามอานนท์)

- วิธีเรียกรัน FET จาก Python (subprocess หรือไลบรารี) และเวลาที่ใช้จริง
- รายการ endpoint และรูปแบบ input / output / error ของ Generate
- วิธียืนยันตัวตน (ดู 3.2)

---

## 4. การติดตั้งและใช้งาน

- Self-hosted + โอเพนซอร์ส: แต่ละสถาบันติดตั้งเองด้วย `docker compose up` แล้วเข้าหน้าตั้งค่าครั้งแรก
- ข้อมูลไม่ออกจากเซิร์ฟเวอร์ของสถาบัน (PDPA)
- ไม่มีบทบาทนักศึกษา ไม่มีลิงก์สาธารณะ

**คำสั่งฝั่ง Frontend**

```
cd frontend
npm install
npm run dev      # เปิด dev server
npm run build    # build production
npm run lint
```

> ⚠ ตอนนี้โครง `src` อยู่ใต้ `frontend/public/` ซึ่ง Vite ไม่ bundle ต้องย้ายออกมาเป็น `frontend/src/` ก่อนจึงจะ build ผ่าน

---

## 5. ที่ยังต้องตัดสินใจ

| # | เรื่อง | ถามใคร |
|---|---|---|
| 1 | JavaScript หรือ TypeScript | เรา |
| 2 | ~~ภาษา / framework ของ backend~~ **ตัดสินใจแล้ว: Python + FastAPI**; ยังค้างวิธีเรียกรัน FET จาก Python | อานนท์ |
| 3 | data contract ของ Generate | อานนท์ + เรา |
| 4 | วิธีล็อกอิน | ทีม |
| 5 | ยืนยันไลบรารี routing และ i18n | เรา |
