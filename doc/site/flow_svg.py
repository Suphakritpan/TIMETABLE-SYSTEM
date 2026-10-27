"""วาดผังโหนด-เส้น (flowchart / sitemap / แผนภาพความสัมพันธ์) แบบกำหนดตำแหน่งเอง วิธีเดียวกับ er_svg.py

- ผู้เขียนกำหนด "ตารางช่อง" (grid) ว่าโหนดไหนอยู่ช่องไหน ไม่ให้โปรแกรมจัดผังอัตโนมัติ
- mode 'TB' = ไหลจากบนลงล่าง (แถว = ระดับ) · mode 'LR' = ไหลจากซ้ายไปขวา (คอลัมน์ = ระดับ)
- เส้นวิ่งเฉพาะ "ช่องทาง" ระหว่างระดับ (ไม่ทะลุโหนด) เส้นที่ทับกันแยกเป็นเลน เส้นที่ออกด้านเดียวกันกระจายห่างกัน
- ช่องทางขยายตามจำนวนเลน ป้ายบนเส้นวางเฉพาะที่ไม่ชนอะไร (ที่เหลืออยู่ใน tooltip)
- เส้นที่เดินโดยไม่ทะลุโหนดไม่ได้ จะถูกข้ามและแจ้งใน log (แก้โดยขยับโหนดใน grid)

รูปแบบเส้น (edges): "A -> B : ป้าย" ลูกศร · "A ~> B" เส้นประ · "A -- B" ไม่มีหัวลูกศร · "A <-> B" สองหัว
ปลายทางหลายตัวคั่นด้วย , ได้: "A -> B, C"; ต้นทางหลายตัวด้วย &: "A & B -> C" """
import re
from xml.sax.saxutils import escape, quoteattr

FONT = "Sarabun,'Noto Sans Thai',sans-serif"
INK = '#4b5563'
LANE, CH_BEFORE, CH_AFTER = 12, 26, 24
KINDS = {  # (พื้น, ขอบ)
    'page': ('#e8f0fb', '#1f5fae'), 'user': ('#e8f0fb', '#1f5fae'), 'head': ('#e8f0fb', '#1f5fae'),
    'ok': ('#e7f6ec', '#166534'), 'tea': ('#e7f6ec', '#166534'),
    'err': ('#fdecea', '#b42318'), 'sys': ('#f3f4f6', '#9ca3af'), 'tech': ('#f3f4f6', '#9ca3af'),
    'warn': ('#fff4e0', '#f0b45a'), 'adm': ('#fff4e0', '#f0b45a'), 'dec': ('#fff4e0', '#f0b45a'),
    'plain': ('#ffffff', '#4b5563'), 'goal': ('#ffffff', '#4b5563'), 'end': ('#e7f6ec', '#166534'),
    'start': ('#f3f4f6', '#6b7280'), 'new': ('#fff4e0', '#f0b45a'), 'root': ('#1f5fae', '#1f5fae'),
}


def N(text, kind='plain', tip='', **kw):
    """นิยามโหนด: text (\\n = ขึ้นบรรทัดใหม่), kind (สี/รูปร่าง), tip (ข้อความเพิ่มใน tooltip), w = กว้างเฉพาะโหนด"""
    return dict(t=text, k=kind, tip=tip, **kw)


def CARD(title, rows, kind='page', w=300):
    """การ์ดรายการ (ใช้กับ sitemap): rows = [(ชื่อ, ป้ายขวา, tooltip, 'new'|'')]"""
    return dict(t=title, k=kind, rows=rows, w=w, tip='')


def parse_edges(edges):
    out = []
    for e in edges:
        e = e.replace('\n', ' ')  # ป้ายบนเส้นเป็นบรรทัดเดียว
        m = re.match(r'^(.+?)\s*(<->|->|~>|--)\s*(.+?)(?:\s*:\s*(.+))?$', e.strip())
        if not m:
            raise ValueError('edge: ' + e)
        src, op, dst, label = m.groups()
        for a in [x.strip() for x in src.split('&')]:
            for b in [x.strip() for x in dst.split(',')]:
                out.append(dict(a=a, b=b, label=(label or '').strip(), dash=(op == '~>'),
                                ha=(op == '<->'), hb=(op in ('->', '~>', '<->'))))
    return out


def hits(rect, segs, pad=2):
    x, y, w, h = rect
    for (x1, y1), (x2, y2) in segs:
        if max(x1, x2) + pad >= x and min(x1, x2) - pad <= x + w and max(y1, y2) + pad >= y and min(y1, y2) - pad <= y + h:
            return True
    return False


def diagram(mode, grid, nodes, edges, W=230, gap_c=40, gap_m=44, title=''):
    TB = mode == 'TB'
    log = []
    cells = {}
    for r, line in enumerate(grid.strip().splitlines()):
        for c, tok in enumerate(line.split()):
            if tok != '.':
                if tok not in nodes:
                    raise KeyError('grid node without definition: ' + tok)
                cells[tok] = (c, r)
    # ขนาดโหนด
    size = {}
    for k in cells:
        n = nodes[k]
        if 'rows' in n:
            size[k] = (n['w'], 30 + len(n['rows']) * 22 + 8)
        elif n['k'] == 'head':
            size[k] = (n.get('w', W), 26)
        else:
            lines = n['t'].split('\n')
            size[k] = (n.get('w', W), max(40, 18 + len(lines) * 19) + (8 if n['k'] == 'dec' else 0))
    lev = {k: (cr[1] if TB else cr[0]) for k, cr in cells.items()}
    slot = {k: (cr[0] if TB else cr[1]) for k, cr in cells.items()}
    main = {k: (size[k][1] if TB else size[k][0]) for k in cells}
    cross = {k: (size[k][0] if TB else size[k][1]) for k in cells}
    nlev, nslot = max(lev.values()) + 1, max(slot.values()) + 1
    at = {(slot[k], lev[k]): k for k in cells}
    slotW = [max((cross[k] for k in cells if slot[k] == s), default=0) for s in range(nslot)]
    levW = [max((main[k] for k in cells if lev[k] == l), default=0) for l in range(nlev)]
    PAD = 14
    slotStart, x = [], PAD
    for s in range(nslot):
        slotStart.append(x)
        x += slotW[s] + gap_c
    ccenter = [slotStart[s] + slotW[s] / 2 for s in range(nslot)]
    total_cross = x - gap_c + PAD

    def between(s, l0, l1):
        return any((s, l) in at for l in range(l0 + 1, l1))

    # --- 1) เลือกเส้นทาง ---
    E = parse_edges(edges)
    routes = []
    for e in E:
        a, b = e['a'], e['b']
        if a not in cells or b not in cells:
            log.append(f'  skip (undefined) {a} {b}')
            continue
        flip = (lev[a], slot[a]) > (lev[b], slot[b])
        u, v = (b, a) if flip else (a, b)
        r = dict(u=u, v=v, label=e['label'], dash=e['dash'],
                 hu=(e['ha'] if not flip else e['hb']), hv=(e['hb'] if not flip else e['ha']), e=e)
        lu, lv, su, sv = lev[u], lev[v], slot[u], slot[v]
        if lu == lv and sv - su == 1:
            r.update(kind='adj', su_side='cross+', sv_side='cross-')
        elif lu == lv:
            r.update(kind='chan', ch=lu, su_side='after', sv_side='after', lane_at='u')
        elif su == sv and not between(su, lu, lv):
            r.update(kind='straight', su_side='after', sv_side='before')
        elif not between(sv, lu, lv):
            r.update(kind='chan', ch=lu, su_side='after', sv_side='before')
        elif not between(su, lu, lv):
            r.update(kind='chan', ch=lv - 1, su_side='after', sv_side='before')
        else:
            log.append(f'  skip {e["a"]} {e["b"]}')
            continue
        routes.append(r)

    # --- 2) กระจายจุดเกาะ ---
    users = {}
    for i, r in enumerate(routes):
        users.setdefault((r['u'], r['su_side']), []).append((i, 'u'))
        users.setdefault((r['v'], r['sv_side']), []).append((i, 'v'))
    for (node_k, side_k), lst in users.items():
        # เรียงตามตำแหน่งปลายอีกด้านเพื่อลดเส้นไขว้
        def other(it):
            i, end = it
            o = routes[i]['v' if end == 'u' else 'u']
            return (slot[o], lev[o])
        lst.sort(key=other)
        extent = cross[node_k] if side_k in ('after', 'before') else main[node_k]  # ความยาวด้านที่เส้นเกาะ
        step = min(16, (extent - 20) / (len(lst) - 1)) if len(lst) > 1 else 0
        for kk, (i, end) in enumerate(lst):
            routes[i]['o' + end] = (kk - (len(lst) - 1) / 2) * step

    def ccoord(k, off):
        return ccenter[slot[k]] + off

    # --- 3) เลน ---
    chans = {}
    for r in routes:
        if r['kind'] == 'chan':
            xa, xb = ccoord(r['u'], r.get('ou', 0)), ccoord(r['v'], r.get('ov', 0))
            r['span'] = (min(xa, xb), max(xa, xb))
            chans.setdefault(r['ch'], []).append(r)
    lanes_in = {}
    for ch, lst in chans.items():
        ends = []
        for r in sorted(lst, key=lambda r: r['span']):
            for kk, e_ in enumerate(ends):
                if r['span'][0] > e_ + 10:
                    r['lane'] = kk
                    ends[kk] = r['span'][1]
                    break
            else:
                r['lane'] = len(ends)
                ends.append(r['span'][1])
        lanes_in[ch] = len(ends)

    # --- 4) ตำแหน่งระดับ ---
    levStart, y = [], PAD + 6
    for l in range(nlev):
        levStart.append(y)
        n = lanes_in.get(l, 0)
        gap = max(gap_m, CH_BEFORE + (n - 1) * LANE + CH_AFTER) if n else gap_m
        y += levW[l] + (gap if l < nlev - 1 else (CH_BEFORE + (n - 1) * LANE + 10 if n else 0))
    total_main = y + PAD
    box = {}
    for k in cells:
        mc = levStart[lev[k]] + levW[lev[k]] / 2
        cc = ccenter[slot[k]]
        w, h = size[k]
        box[k] = (cc - w / 2, mc - h / 2, w, h) if TB else (mc - w / 2, cc - h / 2, w, h)

    def anchor(k, side, off):
        x0, y0, w, h = box[k]
        if TB:
            m = {'after': (x0 + w / 2 + off, y0 + h, (0, 1)), 'before': (x0 + w / 2 + off, y0, (0, -1)),
                 'cross+': (x0 + w, y0 + h / 2 + off, (1, 0)), 'cross-': (x0, y0 + h / 2 + off, (-1, 0))}
        else:
            m = {'after': (x0 + w, y0 + h / 2 + off, (1, 0)), 'before': (x0, y0 + h / 2 + off, (-1, 0)),
                 'cross+': (x0 + w / 2 + off, y0 + h, (0, 1)), 'cross-': (x0 + w / 2 + off, y0, (0, -1))}
        return m[side]

    # --- 5) เส้นจริง ---
    lines, heads, hit, per = [], [], [], []
    for r in routes:
        ux, uy, ud = anchor(r['u'], r['su_side'], r.get('ou', 0))
        vx, vy, vd = anchor(r['v'], r['sv_side'], r.get('ov', 0))
        if r['kind'] == 'adj':
            pts = [(ux, uy), (vx, vy)]
        elif r['kind'] == 'straight':
            if abs((ux - vx) if TB else (uy - vy)) < 1:
                pts = [(ux, uy), (vx, vy)]
            elif TB:
                ym = (uy + vy) / 2
                pts = [(ux, uy), (ux, ym), (vx, ym), (vx, vy)]
            else:
                xm = (ux + vx) / 2
                pts = [(ux, uy), (xm, uy), (xm, vy), (vx, vy)]
        else:
            lane_m = levStart[r['ch']] + levW[r['ch']] + CH_BEFORE + r['lane'] * LANE
            if TB:
                pts = [(ux, uy), (ux, lane_m), (vx, lane_m), (vx, vy)]
            else:
                pts = [(ux, uy), (lane_m, uy), (lane_m, vy), (vx, vy)]
        pl = ' '.join(f'{p:.0f},{q:.0f}' for p, q in pts)
        dash = ' stroke-dasharray="6 4"' if r['dash'] else ''
        lines.append(f'<polyline points="{pl}" fill="none" stroke="{INK}" stroke-width="1.7" stroke-linejoin="round"{dash}/>')
        for (px, py, d), on in (((ux, uy, ud), r['hu']), ((vx, vy, vd), r['hv'])):
            if on:  # หัวลูกศรชี้เข้าโหนด (ทิศ d = ออกจากโหนด)
                dx, dy = d
                bx, by = px + dx * 11, py + dy * 11
                heads.append(f'<polygon points="{px:.1f},{py:.1f} {bx - dy * 5:.1f},{by + dx * 5:.1f} {bx + dy * 5:.1f},{by - dx * 5:.1f}" fill="{INK}"/>')
        ea, eb = r['e']['a'], r['e']['b']
        na, nb = nodes[ea]['t'].replace('\n', ' '), nodes[eb]['t'].replace('\n', ' ')
        hit.append(f'<polyline points="{pl}" fill="none" stroke="transparent" stroke-width="14" data-tip={quoteattr(chr(10).join(x for x in [na + " → " + nb, r["label"]] if x))}/>')
        per.append((r, list(zip(pts, pts[1:]))))
    all_segs = [s_ for _, sg in per for s_ in sg]
    boxes_r = [(x0 - 2, y0 - 2, w + 4, h + 4) for x0, y0, w, h in box.values()]
    tw, th = (total_cross, total_main) if TB else (total_main, total_cross)

    # --- 6) ป้ายบนเส้น ---
    tags, placed = [], []
    for r, sg in per:
        text = r['label']
        if not text:
            continue
        tw_ = len(text) * 6.4 + 10
        done = False
        for s_ in sorted(sg, key=lambda s_: -(abs(s_[0][0] - s_[1][0]) + abs(s_[0][1] - s_[1][1]))):
            (x1, y1), (x2, y2) = s_
            horiz = abs(y1 - y2) < 1
            if abs(x1 - x2) + abs(y1 - y2) < 24:
                continue
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            cands = ([(mx - tw_ / 2, my - 18, tw_, 14), (mx - tw_ / 2, my + 4, tw_, 14)] if horiz
                     else [(mx + 6, my - 7, tw_, 14), (mx - 6 - tw_, my - 7, tw_, 14)])
            for rect in cands:
                other = [t for t in all_segs if t is not s_]
                clash = any(rx < rect[0] + rect[2] and rect[0] < rx + rw and ry < rect[1] + rect[3] and rect[1] < ry + rh
                            for rx, ry, rw, rh in boxes_r + placed)
                if rect[0] < 0 or rect[0] + rect[2] > tw or clash or hits(rect, other, 1):
                    continue
                placed.append(rect)
                tags.append(f'<rect x="{rect[0]:.0f}" y="{rect[1]:.0f}" width="{rect[2]:.0f}" height="{rect[3]:.0f}" rx="3" fill="#fff" fill-opacity=".94"/>'
                            f'<text x="{rect[0] + rect[2] / 2:.0f}" y="{rect[1] + 11:.0f}" font-size="11.5" text-anchor="middle" fill="#374151">{escape(text)}</text>')
                done = True
                break
            if done:
                break

    # --- 7) โหนด ---
    nbr = {k: ([], []) for k in cells}
    for e in E:
        if e['a'] in nbr and e['b'] in nbr:
            lab = f' ({e["label"]})' if e['label'] else ''
            nbr[e['a']][0].append('→ ' + nodes[e['b']]['t'].replace('\n', ' ') + lab)
            nbr[e['b']][1].append('← ' + nodes[e['a']]['t'].replace('\n', ' ') + lab)
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {tw:.0f} {th:.0f}" width="{tw:.0f}" height="{th:.0f}" font-family="{FONT}" role="img" aria-label="{escape(title)}">']
    for k in cells:
        n = nodes[k]
        x0, y0, w, h = box[k]
        fill, stroke = KINDS.get(n['k'], KINDS['plain'])
        txt = '#fff' if n['k'] == 'root' else '#1f2937'
        tipl = [n['t'].replace('\n', ' ')] + ([n['tip']] if n['tip'] else [])
        if nbr[k][1]:
            tipl += ['มาจาก:'] + nbr[k][1]
        if nbr[k][0]:
            tipl += ['ไปที่:'] + nbr[k][0]
        tip = f' data-tip={quoteattr(chr(10).join(tipl))}'
        if n['k'] == 'head':
            s.append(f'<text x="{x0 + w / 2:.0f}" y="{y0 + 18:.0f}" font-size="14" font-weight="700" text-anchor="middle" fill="#4b5563">{escape(n["t"])}</text>')
            continue
        if 'rows' in n:
            s.append(f'<g><rect x="{x0:.0f}" y="{y0:.0f}" width="{w}" height="{h}" rx="4" fill="#fff" stroke="{stroke}" stroke-width="1.4"/>'
                     f'<rect x="{x0:.0f}" y="{y0:.0f}" width="{w}" height="30" rx="4" fill="{fill}" stroke="{stroke}" stroke-width="1.4"/>'
                     f'<text x="{x0 + 12:.0f}" y="{y0 + 20:.0f}" font-size="14" font-weight="700" fill="#1f2937">{escape(n["t"])}</text>')
            for i, (nm, tag, rtip, flag) in enumerate(n['rows']):
                ry = y0 + 30 + i * 22
                if i:
                    s.append(f'<line x1="{x0:.0f}" y1="{ry:.0f}" x2="{x0 + w:.0f}" y2="{ry:.0f}" stroke="#e5e7eb"/>')
                star = '<rect x="%.0f" y="%.0f" width="14" height="14" rx="3" fill="#fff4e0" stroke="#f0b45a"/><text x="%.0f" y="%.0f" font-size="11" text-anchor="middle" font-weight="700" fill="#92400e">*</text>' % (x0 + 8, ry + 4, x0 + 15, ry + 15) if flag == 'new' else ''
                s.append(f'<g data-tip={quoteattr(chr(10).join(x for x in [nm, rtip] if x))}><rect x="{x0:.0f}" y="{ry:.0f}" width="{w}" height="22" fill="transparent"/>{star}'
                         f'<text x="{x0 + 28:.0f}" y="{ry + 15:.0f}" font-size="12.5" fill="#1f2937">{escape(nm)}</text>'
                         f'<text x="{x0 + w - 10:.0f}" y="{ry + 15:.0f}" font-size="11" text-anchor="end" fill="#6b7280">{escape(tag)}</text></g>')
            s.append('</g>')
            continue
        if n['k'] == 'dec':
            sh = f'<polygon points="{x0 + 16:.0f},{y0:.0f} {x0 + w - 16:.0f},{y0:.0f} {x0 + w:.0f},{y0 + h / 2:.0f} {x0 + w - 16:.0f},{y0 + h:.0f} {x0 + 16:.0f},{y0 + h:.0f} {x0:.0f},{y0 + h / 2:.0f}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>'
        elif n['k'] in ('end', 'start'):
            sh = f'<rect x="{x0:.0f}" y="{y0:.0f}" width="{w}" height="{h}" rx="{h / 2:.0f}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>'
        else:
            sh = f'<rect x="{x0:.0f}" y="{y0:.0f}" width="{w}" height="{h}" rx="5" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>'
        lines_t = n['t'].split('\n')
        y_t = y0 + h / 2 - (len(lines_t) - 1) * 9.5 + 5
        txs = ''.join(f'<text x="{x0 + w / 2:.0f}" y="{y_t + i * 19:.0f}" font-size="13" text-anchor="middle" fill="{txt}">{escape(t)}</text>' for i, t in enumerate(lines_t))
        s.append(f'<g{tip}>{sh}{txs}</g>')
    s += lines + heads + tags + hit
    s.append('</svg>')
    diagram.last = dict(box=box, per=per, size=(tw, th))  # สำหรับสคริปต์ตรวจเรขาคณิต (ไม่กระทบผลลัพธ์)
    return ''.join(s), log
