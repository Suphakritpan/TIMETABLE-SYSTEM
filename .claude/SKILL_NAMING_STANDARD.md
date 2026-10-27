# Skill Naming Standard

มาตรฐานการตั้งชื่อ custom skill ของ Suphakrit สำหรับ Claude Code

## 1. สูตร

```
suphakrit-<category>-<skill-name>
```

ชื่อนี้ใช้ **เหมือนกัน 3 ที่**: ชื่อโฟลเดอร์ · ฟิลด์ `name:` ใน frontmatter ของ `SKILL.md` · slash command (`/<ชื่อ>`)

## 2. หมวด (category)

| category | ใช้กับ |
|---|---|
| `docs` | เอกสารและการจัดการเนื้อหา |
| `web` | พัฒนาเว็บไซต์และ workflow ที่เกี่ยวกับเว็บ |
| `audit` | audit ทั่วไปและการรีวิวคุณภาพ |
| `design` | UI/UX และงานภาพ |
| `dev` | พัฒนาซอฟต์แวร์และเขียนโค้ด |
| `data` | ฐานข้อมูลและวิเคราะห์ข้อมูล |
| `devops` | deployment, CI/CD, infrastructure |
| `security` | workflow ด้านความปลอดภัย |

เลือก **หมวดหลักเพียงหมวดเดียว** ตามวัตถุประสงค์หลักของ skill ถ้าไม่มีหมวดที่ตรง ให้เพิ่มหมวดใหม่ในตารางนี้ก่อนใช้ (สั้น มีความหมาย ตัวพิมพ์เล็ก)

## 3. กฎ

- ตัวพิมพ์เล็กภาษาอังกฤษ ตัวเลข (เมื่อจำเป็น) และขีดกลาง `-` เท่านั้น
- ห้ามเว้นวรรคและขีดล่าง `_`
- `<skill-name>` ต้องยังอ่านแล้วรู้ว่าคืออะไร
- ห้ามชื่อซ้ำกับ skill/command อื่น ตรวจก่อนสร้าง
- ความยาวรวมไม่เกิน 64 ตัวอักษร (ข้อจำกัดของฟิลด์ `name` ใน Claude Code)

ตัวอย่างที่ถูก: `suphakrit-dev-api-client` · `suphakrit-devops-vercel-deploy`
ตัวอย่างที่ผิด: `Suphakrit_Web_Audit` (ตัวใหญ่ + ขีดล่าง) · `suphakrit-web` (ไม่มีชื่อ skill) · `suphakrit-docs-web-audit` (สองหมวด)

## 4. ชื่อที่ใช้อยู่

| ชื่อเดิม | ชื่อใหม่ / slash command | ระดับ | ตำแหน่ง |
|---|---|---|---|
| `office-silver-docs-site` | `/suphakrit-docs-office-silver-docs-site` | project | `<project>/.claude/skills/suphakrit-docs-office-silver-docs-site/` |
| `website-quality-audit` | `/suphakrit-web-website-quality-audit` | personal | `~/.claude/skills/suphakrit-web-website-quality-audit/` |

หมายเหตุหมวด: `website-quality-audit` อยู่ใต้ `web` ตามที่กำหนด แม้ลักษณะงานเป็น audit (`audit` ใช้กับ audit ทั่วไปที่ไม่เจาะจงเว็บ)

## 5. วิธีเพิ่ม skill ใหม่

1. เลือก category จากตาราง §2 และตั้งชื่อตามสูตร
2. ตรวจว่าชื่อไม่ซ้ำ: `ls ~/.claude/skills .claude/skills` และดูรายการ skill ใน session (`/skills` หรือ listing ของ Claude Code)
3. สร้าง `<ที่เก็บ>/<ชื่อ>/SKILL.md` โดย frontmatter มี `name:` เท่ากับชื่อโฟลเดอร์ และ `description:` ที่บอกว่าใช้เมื่อไร/ไม่ใช้เมื่อไร
4. วางไฟล์เสริมใน `references/` หรือ `assets/` และอ้างด้วย path สัมพัทธ์ (เปลี่ยนชื่อโฟลเดอร์แล้วไม่พัง)
5. รีโหลดและตรวจตาม §6
6. เพิ่มแถวใน §4

## 6. ตรวจว่าเรียกได้จริง

1. รัน `/reload-skills` (หรือเริ่ม session ใหม่) แล้วดูว่าชื่อใหม่อยู่ในรายการ ชื่อเก่าหายไป
2. พิมพ์ `/suphakrit-…` แล้วดูว่ามีให้เลือกและเรียกแล้ว skill โหลดจริง (ไม่ใช่แค่ไฟล์ถูกเปลี่ยนชื่อ)
3. ตรวจโครงสร้างด้วยไฟล์: มี `SKILL.md`, ฟิลด์ `name` ตรงชื่อโฟลเดอร์, ไฟล์ที่อ้างถึงอยู่ครบ

การเปลี่ยนชื่อไฟล์สำเร็จ **ไม่ใช่หลักฐาน** ว่า command ใช้ได้ ต้องเห็นใน listing ของ Claude Code

## 7. Personal vs Project

| | personal | project |
|---|---|---|
| ที่เก็บ | `~/.claude/skills/<ชื่อ>/` | `<project>/.claude/skills/<ชื่อ>/` |
| ใช้ได้ที่ | ทุกโปรเจกต์ของผู้ใช้ | เฉพาะโปรเจกต์นั้น (ติดไปกับ repo ถ้า commit) |
| เหมาะกับ | เครื่องมือทั่วไปใช้ซ้ำหลายเว็บ (เช่น audit) | สไตล์/ความรู้เฉพาะโปรเจกต์ (เช่น docs site ของระบบตารางเรียน) |

ถ้าชื่อเดียวกันอยู่ทั้งสองระดับ ระดับที่เฉพาะกว่าอาจบังอีกอัน จึงห้ามใช้ชื่อซ้ำข้ามระดับ

## 8. พฤติกรรมเฉพาะเวอร์ชันและข้อจำกัดที่พบ

- ตรวจกับ Claude Code **2.1.310**
- โปรเจกต์นี้ไม่ใช่ git repo การเปลี่ยนชื่อไม่มีประวัติให้ย้อนกลับ สำรองก่อนเปลี่ยนไว้ในโฟลเดอร์ scratchpad ของ session (ลบเองเมื่อ session ผ่านไปแล้ว)
- skill ใหม่/ที่เปลี่ยนชื่อต้อง `/reload-skills` หรือเริ่ม session ใหม่ รายการ skill ที่ session ปัจจุบันเห็นอยู่ไม่อัปเดตเอง
- ไฟล์ที่อ้างชื่อเก่าเป็นข้อความอธิบาย (เช่น `frontend/audit-report.md`) ไม่ถูกแก้ ไม่กระทบการทำงาน
