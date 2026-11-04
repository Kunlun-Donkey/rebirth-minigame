#!/usr/bin/env python3
"""贴图体检：比例 / 透明角 / 内容是否被裁切 / 是否空图 / 体积 / 剧本引用是否缺图。
用法：python3 tools/art/check_art.py        （有问题时退出码 1）
"""
import json, os, re, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
BUNDLES = [os.path.join(ROOT, 'assets', b, 'textures') for b in ('resources', 'subres')]
DATA = os.path.join(ROOT, 'assets/resources/data/destinies')

# (路径正则, 期望宽高比 或 None, 是否要求四角透明, 是否检查内容贴边)
RULES = [
    (r'destiny/[^/]+/(main_bg|settle_bg|settle_bg_ending)$', 9 / 16, False, False),
    (r'destiny/[^/]+/cover$', 1, False, False),
    (r'destiny/[^/]+/stage_\d$', 1, True, True),
    (r'destiny/[^/]+/companion_\w+$', 1, True, True),
    (r'destiny/[^/]+/epitaph_card$', 2.3, False, False),
    (r'common/ui/(event_card|event_card_gold|event_card_sudden|epitaph_card|ending_card)$', 3 / 2, None, False),
    (r'common/ui/btn_\w+$', 2, True, False),
    (r'common/ui/(panel|settle_panel)$', None, True, False),
    (r'common/ui/logo_title$', None, True, True),
    (r'common/ui/share_cover$', 5 / 4, False, False),
    (r'common/ui/age_\d+$', None, None, False),
    (r'common/frame/frame_\w+$', 2 / 3, True, False),
    (r'common/frame/badge_\w+$', 1, True, True),
    (r'common/fx/\w+$', 1, False, False),
    (r'common/icon/\w+$', 1, True, True),
]
MAX_KB = {'.jpg': 320, '.png': 400}
TOL = 0.08

errors, warns = [], []


def rel_of(path):
    for b in BUNDLES:
        if path.startswith(b + os.sep):
            return os.path.splitext(os.path.relpath(path, b))[0].replace(os.sep, '/')
    return None


def check(path):
    rel = rel_of(path)
    ext = os.path.splitext(path)[1].lower()
    kb = os.path.getsize(path) / 1024
    im = Image.open(path)
    w, h = im.size
    rule = next((r for r in RULES if re.search(r[0], rel)), None)
    if not rule:
        warns.append(f'{rel}: 没有对应的检查规则')
        return
    _, ratio, need_alpha, edge = rule
    if ratio and abs((w / h) / ratio - 1) > TOL:
        (errors if 'destiny' not in rel or 'bg' not in rel else warns).append(
            f'{rel}: 比例 {w}x{h}={w / h:.3f}，期望 {ratio:.3f}')
    if kb > MAX_KB.get(ext, 400):
        warns.append(f'{rel}: 体积 {kb:.0f}KB 偏大')
    rgba = im.convert('RGBA')
    a = rgba.getchannel('A')
    corners = [a.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    if need_alpha and max(corners) > 8:
        errors.append(f'{rel}: 四角不透明 {corners}（应为透明底）')
    if need_alpha is False and ext == '.png' and min(corners) < 250:
        warns.append(f'{rel}: 应为不透明底图，但四角透明')
    bbox = a.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bbox:
        errors.append(f'{rel}: 空图（完全透明）')
        return
    if edge:
        x0, y0, x1, y1 = bbox
        touch = sum([x0 <= 0, y0 <= 0, x1 >= w, y1 >= h])
        if touch >= 1 and need_alpha:
            errors.append(f'{rel}: 内容贴边 {bbox}（可能被裁切）')
    # 几乎纯色 = 渲染失败
    small = rgba.resize((32, 32))
    px = [p for p in small.getdata() if p[3] > 24]
    if px:
        lum = [0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2] for p in px]
        if max(lum) - min(lum) < 12:
            errors.append(f'{rel}: 几乎是纯色，可能渲染失败')


def all_files():
    out = {}
    for b in BUNDLES:
        for d, _, fs in os.walk(b):
            for f in fs:
                if f.endswith(('.png', '.jpg')):
                    p = os.path.join(d, f)
                    r = rel_of(p)
                    if r in out:
                        errors.append(f'{r}: 主包和分包重复（{out[r]} / {p}）')
                    out[r] = p
    return out


files = all_files()
for p in files.values():
    check(p)

# 剧本引用
L = lambda x: x if isinstance(x, list) else list(x.values())[0]
index = json.load(open(os.path.join(DATA, 'index.json')))
for ent in index['destinies']:
    did = ent['id']
    base = os.path.join(DATA, did)
    if not os.path.isdir(base):  # 游玩解锁的命格剧本在分包
        base = os.path.join(ROOT, 'assets/subres/data/destinies', did)
    meta = json.load(open(os.path.join(base, 'destiny.json')))
    need = [f'destiny/{did}/{n}' for n in ('main_bg', 'settle_bg', 'settle_bg_ending', 'cover')]
    need += [f'destiny/{did}/stage_{s["level"]}' for s in meta['stages'] if s['level'] > 0]
    need += [f'destiny/{did}/companion_{c["id"]}' for c in L(json.load(open(os.path.join(base, 'companions.json'))))]
    need += [f'common/icon/death_{d["icon"]}' for d in meta['deaths'] if d.get('icon')]
    need += [f'common/icon/stat_{a["stat"]}' for a in meta['attrs'] if a.get('stat')]
    for fn, cat in (('skills', 'skill'), ('items', 'item'), ('talents', 'talent')):
        need += [f'common/icon/{cat}_{e["icon"]}' for e in L(json.load(open(os.path.join(base, fn + '.json')))) if e.get('icon')]
    for n in need:
        if n not in files:
            errors.append(f'缺图：{n}（{did} 引用）')
    # 默认开放的命格（无 unlock）首屏背景放主包；游玩解锁的命格放分包，控制主包 4MB
    if not ent.get('unlock') and f'destiny/{did}/main_bg' in files and 'resources' not in files[f'destiny/{did}/main_bg']:
        errors.append(f'destiny/{did}/main_bg 应放主包（首屏）')

main_kb = sum(os.path.getsize(p) for p in files.values() if '/resources/' in p) / 1024
print(f'检查 {len(files)} 张贴图，主包贴图 {main_kb:.0f}KB')
for w in warns:
    print('  ⚠', w)
for e in errors:
    print('  ✗', e)
print('  ✔ 无问题' if not errors else f'  共 {len(errors)} 个问题')
sys.exit(1 if errors else 0)
