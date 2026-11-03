"""
每个命格一张分享卡（500×400，5:4，微信分享推荐比例）→ build-templates/wechatgame/share/<id>.jpg
Cocos 构建微信小游戏时会把 build-templates/wechatgame/ 原样拷到输出根目录，
所以分享时 imageUrl 直接写 'share/<id>.jpg'。素材：命格主背景 + 封面 + 游戏名。
运行：npm run share
"""
import json, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'build-templates', 'wechatgame', 'share')
FONT = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
GAME = '《这一世我重生了》'
W, H = 500, 400

def find(*cands):
    for c in cands:
        for ext in ('.jpg', '.png'):
            p = os.path.join(ROOT, c + ext)
            if os.path.exists(p): return p
    return None

def font(size):
    return ImageFont.truetype(FONT, size, index=2)  # index 2 = SC

def cover_fit(img, w, h):
    k = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    l, t = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((l, t, l + w, t + h))

def card(did, name, slogan):
    bg = find(f'assets/resources/textures/destiny/{did}/main_bg', f'assets/subres/textures/destiny/{did}/main_bg')
    base = cover_fit(Image.open(bg).convert('RGB'), W, H).filter(ImageFilter.GaussianBlur(2)) if bg else Image.new('RGB', (W, H), '#efdcb6')
    shade = Image.new('RGBA', (W, H), (40, 24, 10, 70))
    base = Image.alpha_composite(base.convert('RGBA'), shade)
    cv = find(f'assets/subres/textures/destiny/{did}/cover')
    if cv:
        c = Image.open(cv).convert('RGB').resize((210, 210), Image.LANCZOS)
        mask = Image.new('L', (210, 210), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, 209, 209), 26, fill=255)
        frame = Image.new('RGBA', (222, 222), (0, 0, 0, 0))
        ImageDraw.Draw(frame).rounded_rectangle((0, 0, 221, 221), 30, fill=(251, 243, 225, 255))
        base.alpha_composite(frame, (W // 2 - 111, 34))
        base.paste(c, (W // 2 - 105, 40), mask)
    d = ImageDraw.Draw(base)
    def center(txt, y, size, fill, stroke=0):
        f = font(size)
        tw = d.textlength(txt, font=f)
        d.text(((W - tw) / 2, y), txt, font=f, fill=fill, stroke_width=stroke, stroke_fill=(60, 34, 14))
    center(f'这一世，我是{name}', 268, 34, (255, 244, 214), 3)
    center(slogan, 316, 20, (255, 230, 170), 2)
    center(GAME, 360, 16, (255, 250, 236), 2)
    os.makedirs(OUT, exist_ok=True)
    base.convert('RGB').save(os.path.join(OUT, f'{did}.jpg'), quality=86, optimize=True)

index = json.load(open(os.path.join(ROOT, 'assets/resources/data/destinies/index.json'), encoding='utf8'))
SLOGAN = {
    'desert_grass': '从一颗草籽，长成荒漠的神',
    'local_dog': '被赶出村的土狗，要咬回一切',
    'caterpillar': '谁见了都想捏死的虫，要飞上天',
    'mantis_shrimp': '差点上桌的皮皮虾，一拳打出一片海',
    'crocodile': '谁都嫌丑的小鳄鱼，要从烂泥里化龙',
}
for d in index['destinies']:
    card(d['id'], d['name'], SLOGAN.get(d['id'], d['desc'][:16]))
    print('share/' + d['id'] + '.jpg')
