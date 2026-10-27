# Website Quality Audit: ระบบตารางเรียน (frontend/) — รอบ 2

วันที่ 2026-10-27 (รอบหลังจากรอบ 18:50 ที่ปรับปรุงแล้ว) ไม่มี production URL ตรวจจาก source, build, lint, test, audit เท่านั้น **ไม่ได้เปิดเบราว์เซอร์รอบนี้** ข้อ runtime อ้างผลรอบก่อน (source ของ title/router/favicon ไม่เปลี่ยน) และติดป้าย "ยกมาจากรอบก่อน"

## 1. Executive Summary

- **ชนิด:** แอปภายในหลังล็อกอิน | **Stack:** Vite 8 + React 19 + TS, CSR, hash router, ยังไม่กำหนด host, `public/` ว่าง
- **สถานะ:** Pass 6 / Fail 3 / Not Applicable 7 / Not Verified 3 / Needs Decision 2 (รวม 21)
- **Fail:** Critical 0, High 0, Medium 2, Low 1
- **เปลี่ยนจากรอบก่อน:** ข้อ 18 test เขียวแล้ว (173/173, 3 รอบติด) ไม่ล้มอีก; bundle โตจาก 286 → 376 kB (gzip 87 → 106 kB); เพิ่ม meta description + color-scheme + skip link + responsive shell (งาน UX รอบนี้)
- **ควรทำก่อน:** (1) `document.title` ต่อ route (2) error boundary root (3) favicon
- **สรุป:** ไม่พบ blocker ด้าน security ยังสรุป "พร้อม production" ไม่ได้: host ยังไม่เลือก, headers/404 จริง/CWV ยัง Not Verified, `auth.ts` เป็น mock

## 2. Scope และเครื่องมือ

- Build `npm run build` ผ่าน (tsc + vite, 84 modules); `npm run lint` สะอาด; `npm audit --omit=dev` 0 ช่องโหว่; `npm test` 173/173 ผ่าน 3 รอบ
- secret regex ใน dist+src: ไม่พบ; ไม่พบ `.map` / `sourceMappingURL`
- ไม่ใช่ git repo (ตรวจ `.env` ที่ถูก commit ไม่ได้; `.gitignore` มี `.env`)
- ไม่ได้ตรวจ: production URL, headers, CWV, runtime รอบนี้ (ไม่ได้ preview/Playwright)

## 3. Checklist 21 ข้อ

| # | ข้อ | สถานะ | ระดับ | หลักฐาน |
|---|---|---|---|---|
| 1 | URL / Custom Domain | Needs Decision | - | ไม่มี config host; grep `vercel.app\|localhost` ใน src/index.html ไม่พบ |
| 2 | View Source | Pass | - | `dist/index.html` มีแค่ `<div id="root">` (CSR) แอปภายใน SEO ไม่เกี่ยว |
| 3 | Error handling / 404 | Fail | Medium | ไม่มี `ErrorBoundary`/`componentDidCatch` (grep ว่าง); hash ไม่รู้จัก → `parseHash` คืน null → เปลี่ยนเงียบ (`useRoute.ts`, `App.tsx:43`); 404 จริงของ host: Not Verified |
| 4 | Framework | Pass | - | CSR + hash router ตั้งใจให้ host สถิตไม่ต้อง rewrite (`useRoute.ts:4`) |
| 5 | Title รายหน้า | Fail | Medium | `index.html` title เดียว; ไม่มี `document.title` ใน src (grep ว่าง); WCAG 2.4.2 |
| 6 | Meta description | Not Applicable | - | แอปหลังล็อกอิน (มี description ทั่วไปใน `index.html` แล้ว ไม่เสียหาย) |
| 7 | Open Graph | Not Applicable | - | ไม่แชร์ออกสังคม |
| 8 | Structured Data | Not Applicable | - | ไม่เข้ากับแอปภายใน |
| 9 | H1 / Heading | Pass | - | ทุก page มี `<h1>` เดียว (grep `src/pages`); Timetable ฝังใช้ `h3` (`Timetable.tsx:63`); runtime ยกมาจากรอบก่อน (เฉพาะ `#/setup`); route หลังล็อกอิน Not Verified runtime |
| 10 | Canonical | Not Applicable | - | hash route, แอปภายใน |
| 11 | llms.txt | Not Applicable | - | ไม่มีเนื้อหาสาธารณะ |
| 12 | robots.txt / AI crawlers | Needs Decision | - | ไม่มี `public/robots.txt` ไม่แก้จนเจ้าของตัดสิน |
| 13 | Favicon | Fail | Low | `public/` ว่าง ไม่มี `<link rel="icon">`; รอบก่อน `/favicon.ico` 404 |
| 14 | Sitemap | Not Applicable | - | แอปภายใน/hash route |
| 15 | `<html lang>` | Pass | - | `dist/index.html`: `lang="th"` |
| 16 | Image alt | Not Applicable | - | grep `<img` ใน src ว่าง; ชื่อปุ่มตรวจด้วย vitest-axe ในชุดทดสอบ |
| 17 | Source maps | Pass | - | `find dist -name '*.map'` ว่าง; `sourceMappingURL` 0 |
| 18 | Console / build / test | Not Verified | - | build/lint/test เขียว แต่ console runtime ไม่ได้ตรวจรอบนี้ (รอบก่อน: มีแค่ favicon 404) |
| 19 | Security config | Not Verified | - | secret regex ว่าง, ไม่มี `VITE_*`, audit 0; `src/api/auth.ts` mock มีรหัสสาธิตใน client — ต้องแทนด้วย backend ก่อน production; headers ต้องตรวจที่ host |
| 20 | JS bundle | Pass | Low (หมายเหตุ) | chunk เดียว 376 kB / gzip 106 kB ไม่มี `lazy()` (มีแค่ type import); เล็กพอสำหรับแอปภายใน; แนะนำ lazy-load หน้าหนักเมื่อโตกว่างบที่ตกลง (ประเมินจาก source) |
| 21 | Core Web Vitals | Not Verified | - | ไม่ได้วัด |

นับ: Pass 6 (2,4,9,15,17,20) / Fail 3 (3,5,13) / N/A 7 (6,7,8,10,11,14,16) / Not Verified 3 (18,19,21) / Needs Decision 2 (1,12)

## 4. ปัญหาที่พบ

### F1 ข้อ 5 ไม่มี title ต่อ route (Medium)
- **Impact:** screen reader/แท็บ/ประวัติบอกหน้าไม่ได้ (WCAG 2.4.2)
- **Evidence:** `index.html` title เดียว; `grep document.title src` ว่าง
- **Fix:** `useEffect` ใน `App.tsx` ตั้ง `document.title = \`${หัวหน้า} · ระบบตารางเรียน\`` ไม่เพิ่ม dependency
- **Verify:** เปลี่ยน hash ทุก route อ่าน `document.title` + เทส `App.test.tsx`

### F2 ข้อ 3 ไม่มี error boundary / Not Found (Medium)
- **Impact:** error ตอน render = จอขาว; hash ผิดถูกพาไปหน้าอื่นเงียบ
- **Evidence:** grep `ErrorBoundary` ว่าง; `App.tsx:43`
- **Fix:** class error boundary 1 ตัวใน `main.tsx`; ตัดสินใจ Not Found vs redirect (ดู §5)
- **Verify:** เทส throw จาก child; เทส `#/xyz`

### F3 ข้อ 13 ไม่มี favicon (Low)
- **Impact:** แท็บไม่มีไอคอน, console 404
- **Evidence:** `public/` ว่าง
- **Fix:** `public/favicon.svg` + `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` (ต้องได้ภาพจากเจ้าของ)
- **Verify:** `ls dist/favicon.svg`; console ไม่มี 404

## 5. Needs Decision

| เรื่อง | ทางเลือก | คำแนะนำ | ใครตัดสิน |
|---|---|---|---|
| Host / โดเมน (1) | Vercel / Netlify / nginx; custom domain หรือชั่วคราว | กระทบ 404 จริง, 12, headers | เจ้าของ |
| robots / AI crawler (12) | ไม่มีไฟล์ / `Disallow: /` / อนุญาต search บล็อก AI | แอปภายในมักไม่ต้อง index แต่ยังไม่แก้ | เจ้าของ |
| Not Found vs redirect (3) | หน้า Not Found / redirect เงียบ | เลือกตาม UX | เจ้าของ |

## 6. Not Verified

| ข้อ | ขาดอะไร | วิธีตรวจ |
|---|---|---|
| 18 | เบราว์เซอร์รอบนี้ | `npm run preview` + Playwright `browser_console_messages` ทุก route/บทบาท |
| 19 | production headers | `curl -sI $URL` ดู CSP, X-Content-Type-Options, Referrer-Policy, HSTS |
| 21 | production URL | Lighthouse + CrUX |

## 7. แผนตรวจซ้ำ

แก้ F1→F2→F3 แล้วรัน `npm run build && npm test && npm run lint && npm audit --omit=dev` จากนั้น preview + Playwright ไล่ทุก route และบทบาท; ตรวจ live เมื่อมี URL

## 8. สิ่งที่ผ่านดีแล้ว

`lang="th"`, ไม่มี source map, ไม่มี secret/env ใน bundle, `npm audit` 0, lint สะอาด, test 173 ผ่านนิ่ง 3 รอบ, h1 ต่อ view, มี axe test, tsc + build ผ่าน
