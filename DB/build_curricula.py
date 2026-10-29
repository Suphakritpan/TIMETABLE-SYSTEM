# สร้าง frontend/src/data/curricula.json จาก DB/test_pdf/วิชา/*.csv  (รัน: python DB/build_curricula.py)
# โครงสร้างผลลัพธ์: สถานศึกษา -> แผนก(กลุ่มรหัสวิชาชีพ) -> หลักสูตร(รุ่นปี พ.ศ. + ลำดับ) -> รายวิชา(ชั้นปี/ภาค)
# รหัสหลักสูตร ปวส. 683010101 = [68=รุ่นปีหลักสูตร พ.ศ.2568][30101=กลุ่มรหัสวิชาชีพ][01=ลำดับหลักสูตร]
import csv, collections, json, pathlib, re
src = pathlib.Path(__file__).parent / 'test_pdf' / 'วิชา'
SOURCES = [  # (ไฟล์, รหัส, ชื่อสถานศึกษา, ระดับ)
    ('voc-chonburi.csv', 'chonburi', 'วิทยาลัยเทคโนโลยีชลบุรี', 'ปวส.'),
    ('voc-sattahip.csv', 'sattahip', 'วิทยาลัยเทคนิคสัตหีบ', 'ปวส.'),
    ('ced.csv', 'ced', 'หลักสูตรครุศาสตร์ (ced.csv — ไม่ทราบสถาบัน)', 'ปริญญาตรี'),
]
# ชื่อแผนกที่ยืนยันจากเอกสารต้นทางแล้วเท่านั้น (ที่เหลือใช้ "กลุ่มรหัส xxxxx")
DEPT_NAMES = {('sattahip', '30102'): 'ธุรกิจการบิน (บริการภาคพื้น)'}
NOISE = re.compile(r'\s*\(\s*[\*"]?\d+\s*\)\s*$')  # เศษ OCR ท้ายชื่อ เช่น (*4) ("6)
UNREAD = '(อ่านชื่อไม่ได้)'

def clean(n): return NOISE.sub('', n).strip()

out, filled = [], 0
for fn, sid, sname, level in SOURCES:
    rows = list(csv.DictReader(open(src / fn, encoding='utf-8-sig')))
    # ชื่อที่พบบ่อยสุดของแต่ละรหัสวิชา ใช้เติมแถวที่ OCR อ่านชื่อไม่ออก
    by_code = collections.defaultdict(collections.Counter)
    for r in rows:
        if clean(r['name_th']): by_code[r['code']][clean(r['name_th'])] += 1
    depts = collections.OrderedDict()
    for r in rows:
        plan = r.get('plan') or 'ced'
        m = re.fullmatch(r'(\d{2})(\d{5})(\d{2})', plan)
        year_be, dept, variant = (2500 + int(m[1]), m[2], m[3]) if m else (None, 'ced', '01')
        name = clean(r['name_th'])
        if not name and by_code[r['code']]: name, filled = by_code[r['code']].most_common(1)[0][0], filled + 1
        cur = depts.setdefault(dept, {}).setdefault(plan, dict(plan=plan, year=year_be, variant=variant, courses=[], seen=set()))
        key = (r['code'], r['year'], r['term'], r['order'])
        if key in cur['seen']: continue
        cur['seen'].add(key)
        cur['courses'].append(dict(y=int(r['year']), t=r['term'], code=r['code'], name=name or UNREAD, kind=r['kind'],
                                   cr=int(r['credits'] or 0), lec=int(r['lecture'] or 0), lab=int(r['lab'] or 0),
                                   **({'check': True} if r.get('status') == 'CHECK' else {})))
    dl = []
    for d, plans in depts.items():
        pl = sorted(plans.values(), key=lambda p: (-(p['year'] or 0), p['variant']))
        for p in pl:
            del p['seen']
            p['courses'].sort(key=lambda c: (c['y'], c['t']))
        hint = [c['name'] for c in pl[0]['courses'] if c['kind'] == 'course' and not c['code'].startswith(('30000', '30001', '30100')) and c['name'] != UNREAD][:3]
        dl.append(dict(id=d, name=DEPT_NAMES.get((sid, d)) or ('ทุกสาขา' if d == 'ced' else f'กลุ่มรหัส {d}'), hint=hint, curricula=pl))
    out.append(dict(id=sid, name=sname, level=level, departments=dl))
dest = pathlib.Path(__file__).parent.parent / 'frontend/src/data/curricula.json'
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('filled names:', filled, '| unread left:', sum(c['name'] == UNREAD for s in out for d in s['departments'] for p in d['curricula'] for c in p['courses']))
for s in out: print(s['name'], len(s['departments']), 'แผนก', sum(len(d['curricula']) for d in s['departments']), 'หลักสูตร')
print(dest.stat().st_size // 1024, 'KB')
