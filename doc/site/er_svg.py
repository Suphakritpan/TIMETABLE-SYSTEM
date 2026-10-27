"""วาด ER แบบกำหนดตำแหน่งเอง (ไม่ให้โปรแกรมจัดผังอัตโนมัติ) จาก er-diagram.mmd

แต่ละกลุ่ม = ตารางช่อง (col, row) ของการ์ดเอนทิตี เส้นความสัมพันธ์วิ่งเฉพาะ "ช่องทาง" (channel) ระหว่างแถว
- เส้นนอนในช่องทางเดียวกันที่ทับกันในแนวเดียวกัน ถูกแยกเป็นเลน (lane) คนละระดับ ไม่ซ้อนกัน
- ช่องทางขยายความสูงเองตามจำนวนเลน
- ป้ายชื่อความสัมพันธ์วางเฉพาะที่ที่ไม่ชนการ์ด เส้นอื่น หรือป้ายอื่น (ที่เหลือดูใน tooltip)
- ความสัมพันธ์ที่เดินเส้นไม่ได้โดยไม่ทะลุการ์ด ไม่วาดเป็นเส้น (ยังเห็นเป็น "→ เอนทิตี" ที่แถว FK)"""
import re
from xml.sax.saxutils import escape, quoteattr

W, GAP_X, GAP_Y = 268, 44, 52
HEAD, ROW, PAD = 28, 21, 14
LANE, CH_TOP, CH_BOT = 11, 28, 28   # ระยะเลน / จากการ์ดบนถึงเลนแรก / จากเลนสุดท้ายถึงการ์ดล่าง
NAME_X = 58                          # ตำแหน่งชื่อฟิลด์ (เว้นที่ให้ป้าย PK/FK)
FONT = "Sarabun,'Noto Sans Thai',sans-serif"
INK = '#4b5563'

# ชื่อฟิลด์ที่ไม่ตรงกฎ "<entity>_id"
FK_TARGET = {
    'term_id': 'ACADEMIC_TERM', 'format_id': 'CURRICULUM_FORMAT', 'group_id': 'STUDENT_GROUP',
    'version_id': 'TIMETABLE_VERSION', 'run_id': 'GENERATION_RUN', 'precheck_id': 'PRECHECK_REPORT',
    'class_id': 'SCHEDULED_CLASS', 'request_id': 'CHANGE_REQUEST', 'teacher_id': 'USER',
    'about_user_id': 'USER', 'author_id': 'USER', 'decided_by': 'USER', 'acknowledged_by': 'USER',
    'requested_by': 'USER', 'changed_by': 'USER', 'published_by': 'USER',
    'copied_from_profile_id': 'PROFILE', 'from_candidate_id': 'CANDIDATE', 'chosen_course_id': 'COURSE',
    'source_upload_id': 'SOURCE_UPLOAD', 'year_plan_id': 'YEAR_PLAN', 'plan_row_id': 'PLAN_ROW',
}

# (ชื่อกลุ่ม, {ENTITY: (col, row, is_ref)})  is_ref = การ์ดย่อ (เจ้าของจริงอยู่อีกกลุ่ม)
ZONES = [
    ('สถาบันและผู้ใช้', {
        'USER': (0, 0, 0), 'INSTITUTION': (1, 0, 0), 'ACADEMIC_TERM': (2, 0, 0), 'HOLIDAY': (3, 0, 0),
        'MEMBERSHIP': (0, 1, 0), 'DEPARTMENT': (1, 1, 0), 'ROOM': (2, 1, 0),
        'INVITE': (1, 2, 0)}),
    ('หลักสูตรและโปรไฟล์', {
        'DEPARTMENT': (0, 0, 1), 'PROGRAM': (1, 0, 0), 'CURRICULUM_FORMAT': (2, 0, 0),
        'PROFILE': (0, 1, 0), 'SOURCE_UPLOAD': (1, 1, 0),
        'STUDENT_GROUP': (0, 2, 0), 'YEAR_PLAN': (1, 2, 0), 'PLAN_ROW': (2, 2, 0),
        'ELECTIVE_SLOT': (1, 3, 0), 'COURSE': (2, 3, 0)}),
    ('เวลาว่างและปัญหาข้อมูลอาจารย์', {
        'ACADEMIC_TERM': (0, 0, 1), 'USER': (1, 0, 1), 'DEPARTMENT': (2, 0, 1), 'COURSE': (3, 0, 1),
        'AVAILABILITY_SLOT': (0, 1, 0), 'ROUND_RESPONSE': (1, 1, 0), 'SUBJECT_PREFERENCE': (2, 1, 0),
        'PROFILE': (0, 2, 1), 'ROUND': (1, 2, 0),
        'ISSUE': (0, 3, 0), 'COMMENT': (1, 3, 0), 'DECISION': (0, 4, 0)}),
    ('กฎและการสร้างตาราง', {
        'RULE_SETTING': (0, 0, 0), 'PROFILE': (1, 0, 1), 'TIMETABLE_VERSION': (2, 0, 0),
        'USER': (0, 1, 1), 'PRECHECK_REPORT': (1, 1, 0),
        'GENERATION_RUN': (1, 2, 0), 'CANDIDATE': (2, 2, 0)}),
    ('ตาราง ห้อง และการเปลี่ยนแปลง', {
        'PLAN_ROW': (0, 0, 1), 'STUDENT_GROUP': (1, 0, 1), 'USER': (2, 0, 1), 'ROOM': (3, 0, 1),
        'TIMETABLE_VERSION': (0, 1, 1), 'SCHEDULED_CLASS': (1, 1, 0), 'ROOM_BOOKING': (3, 1, 0),
        'CHANGE_REQUEST': (0, 2, 0), 'CHANGE_LOG': (1, 2, 0), 'NOTIFICATION': (2, 2, 0)}),
]

CARD_TH = {'1': 'หนึ่งเดียว', '0..1': '0 หรือ 1', '1..N': '1 หรือหลาย', '0..N': '0 หรือหลาย'}


def card(tok):
    """สัญลักษณ์ปลายเส้นของ Mermaid -> 1 | 0..1 | 1..N | 0..N"""
    if '{' in tok or '}' in tok:
        return '0..N' if 'o' in tok else '1..N'
    return '0..1' if 'o' in tok else '1'


def parse(src):
    ents = {}
    for m in re.finditer(r'^[ ]+(\w+)[ ]+\{\n(.*?)^[ ]+\}', src, re.S | re.M):
        rows = []
        for ln in m.group(2).splitlines():
            t = re.match(r'\s+(\w+)\s+(\w+)((?:\s+(?:PK|FK|UK),?)*)(?:\s+"(.*)")?\s*$', ln)
            if t:
                rows.append(dict(type=t.group(1), name=t.group(2), keys=re.findall(r'PK|FK|UK', t.group(3)), note=t.group(4) or ''))
        # เลขลำดับคีย์: PK1.. (ถ้ามี PK เดียวเป็น PK เฉยๆ), FK1.., UK1..
        n_pk = sum('PK' in f['keys'] for f in rows)
        cnt = {'PK': 0, 'FK': 0, 'UK': 0}
        for f in rows:
            f['tags'] = []
            for k in f['keys']:
                cnt[k] += 1
                f['tags'].append(k if (k == 'PK' and n_pk == 1) else f'{k}{cnt[k]}')
        ents[m.group(1)] = rows
    rels = []
    for ln in src.splitlines():
        t = re.match(r'\s+(\w+)\s+(\S+)--(\S+)\s+(\w+)\s*:\s*"(.*)"', ln)
        if t:
            rels.append(dict(a=t.group(1), b=t.group(4), ca=card(t.group(2)), cb=card(t.group(3)), label=t.group(5)))
    return ents, rels


def tip(*lines):
    """ข้อความ tooltip เมื่อเมาส์ชี้ (บรรทัดแรกเป็นหัวข้อ) เก็บใน data-tip"""
    return 'data-tip=' + quoteattr(chr(10).join(l for l in lines if l))


def rel_lines(e, rels):
    out = []
    for r in rels:
        if r['a'] == e:
            out.append(f"• {r['b']} — {r['label']} (ฝั่งนี้ {CARD_TH[r['ca']]} : ฝั่งนั้น {CARD_TH[r['cb']]})")
        elif r['b'] == e:
            out.append(f"• {r['a']} — {r['label']} (ฝั่งนี้ {CARD_TH[r['cb']]} : ฝั่งนั้น {CARD_TH[r['ca']]})")
    return out


def fk_to(name):
    if name in FK_TARGET:
        return FK_TARGET[name]
    return name[:-3].upper() if name.endswith('_id') else ''


def marker(x, y, d, card_):
    """สัญลักษณ์ ER ที่ขอบการ์ด: ขีด = หนึ่ง, วงกลม = ศูนย์, ตีนกา = หลาย (d = ทิศออกจากการ์ด)"""
    dx, dy = d
    px, py = -dy, dx
    at = lambda t, u=0: (x + dx * t + px * u, y + dy * t + py * u)
    st = f'stroke="{INK}" stroke-width="1.7" fill="none"'
    bar = lambda t: '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" %s/>' % (*at(t, -6), *at(t, 6), st)
    ring = lambda t: '<circle cx="%.1f" cy="%.1f" r="4.5" fill="#fff" stroke="%s" stroke-width="1.7"/>' % (*at(t), INK)
    out = []
    if card_ in ('1', '0..1'):
        out += [bar(9), bar(15) if card_ == '1' else ring(20)]
    else:
        for u in (-7, 0, 7):  # ตีนกา
            out.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" %s/>' % (*at(0, u), *at(13), st))
        out.append(bar(18) if card_ == '1..N' else ring(21))
    return ''.join(out)


CHIP = {'PK': ('#fef3c7', '#92400e'), 'FK': ('#e0f2fe', '#075985'), 'UK': ('#ede9fe', '#5b21b6')}


def chips(x, y, tags):
    out, cx = [], x + 6
    for tg in tags:
        bg, fg = CHIP[tg[:2]]
        w = 7 * len(tg) + 6
        out.append(f'<rect x="{cx}" y="{y + 4}" width="{w}" height="14" rx="3" fill="{bg}"/>'
                   f'<text x="{cx + w / 2}" y="{y + 14.5}" font-size="9.5" font-weight="700" text-anchor="middle" fill="{fg}">{tg}</text>')
        cx += w + 3
    return ''.join(out), cx - x + 2


def hits(rect, segs, pad=2):
    """กล่อง rect ชนกับเส้นตรงแนวแกนใดใน segs หรือไม่"""
    x, y, w, h = rect
    for (x1, y1), (x2, y2) in segs:
        if max(x1, x2) + pad >= x and min(x1, x2) - pad <= x + w and max(y1, y2) + pad >= y and min(y1, y2) - pad <= y + h:
            return True
    return False


def draw_zone(title, layout, ents, rels, log):
    size = {}
    for e, (c, r, ref) in layout.items():
        size[e] = (W, HEAD + (ROW if ref else len(ents[e]) * ROW) + 8)
    nrows = max(r for _, r, _ in layout.values()) + 1
    ncols = max(c for c, _, _ in layout.values()) + 1
    rowH = [max((size[e][1] for e, (c, r, _) in layout.items() if r == i), default=0) for i in range(nrows)]
    col = {e: c for e, (c, r, _) in layout.items()}
    row = {e: r for e, (c, r, _) in layout.items()}
    at = {(c, r): e for e, (c, r, _) in layout.items()}
    colx = lambda c: PAD + c * (W + GAP_X)

    def between(c, r0, r1):
        return any((c, r) in at for r in range(r0 + 1, r1))

    # --- 1) เลือกเส้นทาง: ช่องทาง (channel i = ใต้แถว i) ที่เส้นจะวิ่งนอน ---
    routes = []
    for rel in rels:
        a, b, ca, cb = rel['a'], rel['b'], rel['ca'], rel['cb']
        if a not in layout or b not in layout:
            continue
        if (row[a], col[a]) > (row[b], col[b]):
            a, b, ca, cb = b, a, cb, ca
        r = dict(a=a, b=b, ca=ca, cb=cb, label=rel['label'])
        if row[a] == row[b] and col[b] - col[a] == 1:
            r.update(kind='h', sa='right', sb='left')
        elif row[a] == row[b]:
            r.update(kind='c', sa='bottom', sb='bottom', ch=row[a])
        elif col[a] == col[b] and not between(col[a], row[a], row[b]):
            r.update(kind='c', sa='bottom', sb='top', ch=row[a])
        elif col[a] != col[b] and not between(col[b], row[a], row[b]):
            r.update(kind='c', sa='bottom', sb='top', ch=row[a])
        elif col[a] != col[b] and not between(col[a], row[a], row[b]):
            r.update(kind='c', sa='bottom', sb='top', ch=row[b] - 1)
        else:
            log.append(f'  skip {rel["a"]} - {rel["b"]} ({title})')
            continue
        routes.append(r)

    # --- 2) กระจายจุดเกาะของเส้นที่ออกด้านเดียวกันของการ์ดเดียวกัน ---
    users = {}
    for i, r in enumerate(routes):
        users.setdefault((r['a'], r['sa']), []).append((i, 'a'))
        users.setdefault((r['b'], r['sb']), []).append((i, 'b'))
    for lst in users.values():
        for k, (i, end) in enumerate(lst):
            routes[i]['o' + end] = (k - (len(lst) - 1) / 2) * 22

    def ax(e, off):
        return colx(col[e]) + W / 2 + off

    # --- 3) จัดเลน: เส้นนอนในช่องทางเดียวกันที่ช่วง x ทับกัน ไปคนละเลน ---
    chans = {}
    for r in routes:
        if r['kind'] != 'c':
            continue
        xa, xb = ax(r['a'], r.get('oa', 0)), ax(r['b'], r.get('ob', 0))
        r['span'] = (min(xa, xb), max(xa, xb))
        chans.setdefault(r['ch'], []).append(r)
    lanes_in = {}
    for ch, lst in chans.items():
        ends = []  # ปลายขวาสุดของแต่ละเลน
        for r in sorted(lst, key=lambda r: r['span']):
            for k, e_ in enumerate(ends):
                if r['span'][0] > e_ + 10:
                    r['lane'] = k
                    ends[k] = r['span'][1]
                    break
            else:
                r['lane'] = len(ends)
                ends.append(r['span'][1])
        lanes_in[ch] = len(ends)

    # --- 4) ตำแหน่งแถว (ช่องทางขยายตามจำนวนเลน) ---
    rowY, y = [], PAD + 8
    for i in range(nrows):
        rowY.append(y)
        n = lanes_in.get(i, 0)
        gap = max(GAP_Y, CH_TOP + (n - 1) * LANE + CH_BOT) if n else GAP_Y
        y += rowH[i] + (gap if i < nrows - 1 else (CH_TOP + (n - 1) * LANE + 12 if n else 0))
    th = y + PAD
    tw = PAD * 2 + ncols * W + (ncols - 1) * GAP_X
    box = {e: (colx(col[e]), rowY[row[e]], size[e][0], size[e][1]) for e in layout}

    def anchor(e, side, off):
        x, y0, w, h = box[e]
        if side == 'right':
            return x + w, y0 + 16 + off, (1, 0)
        if side == 'left':
            return x, y0 + 16 + off, (-1, 0)
        if side == 'bottom':
            return x + w / 2 + off, y0 + h, (0, 1)
        return x + w / 2 + off, y0, (0, -1)

    # --- 5) สร้างเส้นจริง ---
    lines, marks, hit, per_route = [], [], [], []
    for r in routes:
        px, py, pd = anchor(r['a'], r['sa'], r.get('oa', 0))
        qx, qy, qd = anchor(r['b'], r['sb'], r.get('ob', 0))
        if r['kind'] == 'h':
            pts = [(px, py), (qx, qy)]
        else:
            ly = rowY[r['ch']] + rowH[r['ch']] + CH_TOP + r['lane'] * LANE
            if r['sa'] == 'bottom' and r['sb'] == 'top' and abs(px - qx) < 1:
                pts = [(px, py), (qx, qy)]
            else:
                pts = [(px, py), (px, ly), (qx, ly), (qx, qy)]
        pl = ' '.join(f'{a:.0f},{b:.0f}' for a, b in pts)
        lines.append(f'<polyline points="{pl}" fill="none" stroke="{INK}" stroke-width="1.7" stroke-linejoin="round"/>')
        hit.append(f'<polyline points="{pl}" fill="none" stroke="transparent" stroke-width="14" '
                   + tip(f"{r['a']} — {r['b']}", r['label'], f"{r['a']}: {CARD_TH[r['ca']]}", f"{r['b']}: {CARD_TH[r['cb']]}") + '/>')
        marks.append(marker(px, py, pd, r['ca']))
        marks.append(marker(qx, qy, qd, r['cb']))
        per_route.append((r, list(zip(pts, pts[1:]))))
    all_segs = [s_ for _, sg in per_route for s_ in sg]
    cards_r = [(x - 2, y0 - 2, w + 4, h + 4) for x, y0, w, h in box.values()]

    # --- 6) ป้ายชื่อความสัมพันธ์: วางเฉพาะที่ที่ไม่ชนอะไร ---
    tags, placed = [], []
    for r, sg in per_route:
        text = r['label']
        tw_ = len(text) * 6.3 + 10
        done = False
        for s_ in sorted(sg, key=lambda s_: -(abs(s_[0][0] - s_[1][0]) + abs(s_[0][1] - s_[1][1]))):
            (x1, y1), (x2, y2) = s_
            horiz = abs(y1 - y2) < 1
            if abs(x1 - x2) + abs(y1 - y2) < 30:
                continue
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            cands = ([(mx - tw_ / 2, my - 17, tw_, 14), (mx - tw_ / 2, my + 4, tw_, 14)] if horiz
                     else [(mx + 6, my - 7, tw_, 14), (mx - 6 - tw_, my - 7, tw_, 14)])
            for rect in cands:
                other = [t for t in all_segs if t is not s_]
                clash = any(rx < rect[0] + rect[2] and rect[0] < rx + rw and ry < rect[1] + rect[3] and rect[1] < ry + rh
                            for rx, ry, rw, rh in cards_r + placed)
                if rect[0] < 0 or rect[0] + rect[2] > tw or clash or hits(rect, other, 1):
                    continue
                placed.append(rect)
                tags.append(f'<rect x="{rect[0]:.0f}" y="{rect[1]:.0f}" width="{rect[2]:.0f}" height="{rect[3]:.0f}" rx="3" fill="#fff" fill-opacity=".92"/>'
                            f'<text x="{rect[0] + rect[2] / 2:.0f}" y="{rect[1] + 11:.0f}" font-size="11" text-anchor="middle" fill="#374151">{escape(text)}</text>')
                done = True
                break
            if done:
                break

    # --- 7) การ์ด ---
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {tw} {th:.0f}" width="{tw}" height="{th:.0f}" font-family="{FONT}" role="img" aria-label="{escape(title)}">']
    for e, (x, y0, w, h) in box.items():
        ref = layout[e][2]
        stroke = '#9ca3af' if ref else '#1f5fae'
        dash = ' stroke-dasharray="5 3"' if ref else ''
        ent_tip = [e + (' (อ้างอิง: รายละเอียดอยู่อีกกลุ่ม)' if ref else ''), f'{len(ents[e])} ฟิลด์']
        if ref:
            ent_tip += ['ฟิลด์: ' + ', '.join(f['name'] for f in ents[e])]
        rl = rel_lines(e, rels)
        if rl:
            ent_tip += ['ความสัมพันธ์:'] + rl
        s.append(f'<g {tip(*ent_tip)}><rect x="{x}" y="{y0}" width="{w}" height="{h}" rx="4" fill="#fff" stroke="{stroke}" stroke-width="1.4"{dash}/>')
        s.append(f'<rect x="{x}" y="{y0}" width="{w}" height="{HEAD}" rx="4" fill="{"#f3f4f6" if ref else "#e8f0fb"}" stroke="{stroke}" stroke-width="1.4"{dash}/>')
        s.append(f'<text x="{x + 10}" y="{y0 + 19}" font-size="13.5" font-weight="700" fill="#1f2937">{e}</text>')
        if ref:
            s.append(f'<text x="{x + 10}" y="{y0 + HEAD + 15}" font-size="12" fill="#6b7280">(รายละเอียดอยู่อีกกลุ่ม)</text></g>')
            continue
        for i, f in enumerate(ents[e]):
            fy = y0 + HEAD + i * ROW
            if i:
                s.append(f'<line x1="{x}" y1="{fy}" x2="{x + w}" y2="{fy}" stroke="#e5e7eb"/>')
            tgt = fk_to(f['name']) if 'FK' in f['keys'] else ''
            right = f'→ {tgt}' if tgt else (f['note'][:22] if f['note'] else '')
            ft = tip(f['name'], 'ชนิด: ' + f['type'], ('คีย์: ' + ', '.join(f['tags'])) if f['tags'] else '',
                     f'อ้างอิง: {tgt}' if tgt else '', ('หมายเหตุ: ' + f['note']) if f['note'] else '')
            chip_svg, name_dx = chips(x, fy, f['tags'])
            s.append(f'<g {ft}><rect x="{x}" y="{fy}" width="{w}" height="{ROW}" fill="transparent"/>'
                     + chip_svg
                     + f'<text x="{x + max(NAME_X, name_dx)}" y="{fy + 15}" font-size="12" font-weight="{700 if "PK" in f["keys"] else 400}" fill="#1f2937">{escape(f["name"])}</text>'
                     f'<text x="{x + w - 8}" y="{fy + 15}" font-size="11" text-anchor="end" fill="{"#075985" if tgt else "#6b7280"}">{escape(right)}</text></g>')
        s.append('</g>')
    s += lines + marks + tags + hit  # เส้นอยู่เหนือการ์ด ป้ายเหนือเส้น พื้นที่ชี้เมาส์บนสุด
    s.append('</svg>')
    return ''.join(s)  # บรรทัดเดียว ไม่มีบรรทัดว่าง (เพื่อไม่ให้ markdown ตัด HTML block)


def er_zones(src):
    """คืน list ของ (ชื่อกลุ่ม, svg) และ log เส้นที่ไม่ได้วาด"""
    ents, rels = parse(src)
    log, out = [], []
    for title, layout in ZONES:
        out.append((title, draw_zone(title, layout, ents, rels, log)))
    return out, log
