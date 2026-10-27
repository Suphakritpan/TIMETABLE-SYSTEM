"""สร้าง index.html (เว็บเอกสาร) จากไฟล์ใน doc/. รัน: python build.py  (ไม่ต้องติดตั้งอะไรเพิ่ม)
หลังแก้ไฟล์เอกสาร ให้รันใหม่เพื่ออัปเดตเว็บ"""
import io
import json
import os
import re

import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from er_svg import er_zones, ZONES as ER_ZONES_ALL  # noqa: E402
from figs import HEADINGS as FIGS  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.dirname(HERE)


def rd(p):
    return io.open(os.path.join(D, p), encoding='utf-8').read()


# (กลุ่ม, id, ชื่อ, path, ชนิด)  ชนิด: md | txt | mmd | gallery
PAGES = [
    ('เอกสารนักพัฒนา', 'dev-readme', 'ภาพรวม', 'dev/README.md', 'md'),
    ('เอกสารนักพัฒนา', 'dev-requirements', 'ข้อกำหนด', 'dev/requirements.md', 'md'),
    ('เอกสารนักพัฒนา', 'dev-pages', 'หน้าและเส้นทาง', 'dev/pages-and-routes.md', 'md'),
    ('เอกสารนักพัฒนา', 'dev-flows', 'Flows', 'dev/flows.md', 'md'),
    ('เอกสารนักพัฒนา', 'dev-diagrams', 'แผนภาพ', 'dev/diagrams.md', 'md'),
    ('เอกสารนักพัฒนา', 'dev-wireframes-missing', 'Wireframe ที่ขาด', 'dev/wireframes-missing.md', 'md'),
    ('เอกสารนักพัฒนา', 'dev-data', 'โมเดลข้อมูล', 'dev/data-model.md', 'md'),
    ('เอกสารนักพัฒนา', 'dev-api', 'เส้น API', 'dev/api.md', 'md'),
    ('เอกสารนักพัฒนา', 'dev-decisions', 'บันทึกการตัดสินใจ', 'dev/decisions.md', 'md'),
    ('เทคนิคและออกแบบ', 'tech', 'Tech Stack', 'th/8-tech-stack.md', 'md'),
    ('เทคนิคและออกแบบ', 'design', 'Design System', 'th/7-design-system/design-system.md', 'md'),
    ('เทคนิคและออกแบบ', 'er', 'ER Diagram', 'th/6-er-diagram/er-diagram.mmd', 'mmd'),
    ('เทคนิคและออกแบบ', 'diagrams', 'ภาพแผนภาพและ Wireframe', None, 'gallery'),
    ('ฉบับแปลไทย (ขั้น 1-4)', 'th-start', 'START-HERE', 'th/START-HERE.md', 'md'),
    ('ฉบับแปลไทย (ขั้น 1-4)', 'th-1', '1 ผู้ใช้และเป้าหมาย', 'th/1-users-and-goals.md', 'md'),
    ('ฉบับแปลไทย (ขั้น 1-4)', 'th-2', '2 เส้นทางผู้ใช้', 'th/2-user-journeys.md', 'md'),
    ('ฉบับแปลไทย (ขั้น 1-4)', 'th-3', '3 Sitemap', 'th/3-sitemap.md', 'md'),
    ('ฉบับแปลไทย (ขั้น 1-4)', 'th-4', '4 User flows', 'th/4-user-flows.md', 'md'),
    ('ต้นฉบับ (อังกฤษ/ไทยปน)', 'o-start', 'START-HERE', 'START-HERE.txt', 'txt'),
    ('ต้นฉบับ (อังกฤษ/ไทยปน)', 'o-1', '1 Users and goals', '1-users-and-goals/users-and-goals.txt', 'txt'),
    ('ต้นฉบับ (อังกฤษ/ไทยปน)', 'o-2', '2 User journeys', '2-user-journeys/user-journeys.txt', 'txt'),
    ('ต้นฉบับ (อังกฤษ/ไทยปน)', 'o-3', '3 Sitemap', '3-sitemap/sitemap.txt', 'txt'),
    ('ต้นฉบับ (อังกฤษ/ไทยปน)', 'o-4', '4 User flows', '4-user-flows/user-flows.txt', 'txt'),
]

IMGS = [
    ('ผู้ใช้ → เป้าหมาย', '1-users-and-goals/users-goals-map.png'),
    ('Sitemap (แบบต้นไม้)', '3-sitemap/sitemap-tree.png'),
    ('Sitemap (แบบละเอียด)', '3-sitemap/sitemap.png'),
] + [(f'Flow F{i}', f'4-user-flows/flows/F{i}.png') for i in range(1, 13)]

ER_GROUPS = [
    ('สถาบันและผู้ใช้', ['INSTITUTION', 'DEPARTMENT', 'ACADEMIC_TERM', 'HOLIDAY', 'ROOM', 'USER', 'MEMBERSHIP', 'INVITE']),
    ('หลักสูตรและโปรไฟล์', ['DEPARTMENT', 'PROGRAM', 'CURRICULUM_FORMAT', 'SOURCE_UPLOAD', 'PROFILE', 'YEAR_PLAN',
                            'STUDENT_GROUP', 'PLAN_ROW', 'COURSE', 'ELECTIVE_SLOT']),
    ('เวลาว่างและปัญหาข้อมูลอาจารย์', ['USER', 'ACADEMIC_TERM', 'PROFILE', 'COURSE', 'DEPARTMENT', 'AVAILABILITY_SLOT',
                                      'SUBJECT_PREFERENCE', 'ROUND', 'ROUND_RESPONSE', 'ISSUE', 'COMMENT', 'DECISION']),
    ('กฎและการสร้างตาราง', ['PROFILE', 'USER', 'YEAR_PLAN', 'RULE_SETTING', 'PRECHECK_REPORT', 'GENERATION_RUN',
                            'CANDIDATE', 'TIMETABLE_VERSION']),
    ('ตาราง ห้อง และการเปลี่ยนแปลง', ['TIMETABLE_VERSION', 'SCHEDULED_CLASS', 'PLAN_ROW', 'STUDENT_GROUP', 'USER', 'ROOM',
                                      'ROOM_BOOKING', 'DEPARTMENT', 'CHANGE_REQUEST', 'CHANGE_LOG', 'NOTIFICATION']),
]


HAND_DRAWN = {z[0] for z in ER_ZONES_ALL}  # ทุกกลุ่มวางผังเองแล้ว (er_svg.py)


def er_page(src):
    """แยก ER ใหญ่เป็นแผนภาพย่อยตามกลุ่ม (อ่านง่ายกว่า) + แผนภาพเต็มท้ายหน้า"""
    blocks = {m.group(1): m.group(0) for m in re.finditer(r'^[ ]+(\w+)[ ]+\{\n.*?^[ ]+\}', src, re.S | re.M)}
    rels = []
    for line in src.splitlines():
        m = re.match(r'\s+(\w+)\s+\S+--\S+\s+(\w+)\s*:', line)
        if m:
            rels.append((m.group(1), m.group(2), line))
    out = ['# ER Diagram', '',
           'แยกเป็น **5 แผนภาพตามกลุ่ม** เพื่อให้อ่านง่าย (เอนทิตีที่ซ้ำคือจุดเชื่อมระหว่างกลุ่ม) '
           'ภาพรวมทุกเอนทิตีในภาพเดียวอ่านไม่ได้ (เส้นพันกัน) จึงไม่แสดง (ดูโค้ดเต็มที่ `er-diagram.mmd`) **เอาเมาส์ชี้** ที่การ์ด ฟิลด์ หรือเส้น เพื่อดูข้อมูลเต็ม ใช้ปุ่ม **+ / −** หรือ **Ctrl + ลูกกลิ้งเมาส์** เพื่อซูม และลากเพื่อเลื่อน', '',
           '**สัญลักษณ์ปลายเส้น:** ขีดคู่ = หนึ่งเดียว · วงกลม+ขีด = ศูนย์หรือหนึ่ง · ตีนกา+ขีด = หนึ่งหรือหลาย · ตีนกา+วงกลม = ศูนย์หรือหลาย', '']
    svgs, log = er_zones(src)
    svg_by_title = dict(svgs)
    for line in log:
        print(line.encode('ascii', 'replace').decode())
    for name, ents in ER_GROUPS:
        if name in HAND_DRAWN:  # กลุ่มที่วางผังเองแล้ว (er_svg.py)
            out += ['## ' + name, '', '<div class="er-svg">' + svg_by_title[name] + '</div>', '']
            continue
        es = set(ents)
        rl = [r for r in rels if r[0] in es and r[1] in es]
        used = sorted({x for r in rl for x in r[:2]})
        body = 'erDiagram\n' + '\n'.join(r[2] for r in rl) + '\n' + '\n'.join(blocks[e] for e in used if e in blocks)
        out += ['## ' + name, '', '```mermaid', body, '```', '']
    return '\n'.join(out)


def inject_figs(md, page):
    """แทนบล็อก ```mermaid ที่อยู่ใต้ heading ซึ่งมีผังวางเอง (figs.py) ด้วย SVG; ที่เหลือเป็น mermaid ตามเดิม"""
    out, head, i, lines = [], '', 0, md.split('\n')
    while i < len(lines):
        ln = lines[i]
        if ln.startswith('#'):
            head = ln
        if ln.strip() == '```mermaid':
            j = i + 1
            while j < len(lines) and lines[j].strip() != '```':
                j += 1
            key = next((k for k in FIGS if head.startswith(k)), None)
            if key:
                svg, log = FIGS[key]()
                for m in log:
                    print('  [' + page + '] ' + m.encode('ascii', 'replace').decode())
                out.append('<div class="er-svg">' + svg + '</div>')
                i = j + 1
                continue
        out.append(ln)
        i += 1
    return '\n'.join(out)


pages = []
for g, i, t, p, k in PAGES:
    if k == 'gallery':
        body = '# ภาพแผนภาพและ Wireframe\n\n[เปิดต้นแบบคลิกได้ (prototype.html) →](../5-wireframes/prototype.html)\n\n'
        body += '\n\n'.join(f'### {n}\n\n![{n}](../{u})' for n, u in IMGS)
    elif k == 'txt':
        body = '```text\n' + rd(p) + '\n```'
    elif k == 'mmd':
        body = er_page(rd(p))
    else:
        body = inject_figs(rd(p), i)
    pages.append(dict(g=g, id=i, t=t, p=p or '', md=body))

tpl = io.open(os.path.join(HERE, 'template.html'), encoding='utf-8').read()
data = json.dumps(pages, ensure_ascii=False).replace('</', '<\\/')
io.open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8', newline='').write(tpl.replace('__DATA__', data))
print('ok', len(pages), 'pages')
