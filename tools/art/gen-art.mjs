// 用 SVG 程序化生成「通用层」占位美术，经 headless Chrome 渲染为 PNG/JPG 入库。
// 用法：npm run art            全部生成
//       npm run art -- icon    只生成文件名含 icon 的
// AI 生成的同名图放进来会直接替换这里的产物（见 docs/art/ai-image-prompts.md）。
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// 首屏用到的图进主包 resources，其余进分包 subres（见 assets/scripts/game/res.ts）
const MAIN_TEX = join(ROOT, 'assets/resources/textures');
const SUB_TEX = join(ROOT, 'assets/subres/textures');
const MAIN_FILES = new Set(['destiny/desert_grass/main_bg', 'destiny/local_dog/main_bg', 'common/ui/logo_title', 'common/ui/panel',
  'common/ui/btn_normal', 'common/ui/btn_primary', 'common/ui/btn_ad', 'common/ui/btn_locked']);
const TMP = join(tmpdir(), 'rebirth-art');
const filter = process.argv[2] ?? '';

// ---------- 工具 ----------
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => +n.toFixed(1);
function star(cx, cy, ro, ri, n, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push(`${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join(' L')}Z`;
}
function spiral(cx, cy, r0, r1, turns, a0 = 0) {
  const pts = [], steps = 90 * turns;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = a0 + t * turns * 2 * Math.PI, r = r0 + (r1 - r0) * t;
    pts.push(`${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`);
  }
  return `M${pts.join(' L')}`;
}
function arc(cx, cy, r, a0, a1) {
  const p = (a) => [f(cx + r * Math.cos((a * Math.PI) / 180)), f(cy + r * Math.sin((a * Math.PI) / 180))];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

// 通用 defs：纸张颗粒、发光
const DEFS = `
<filter id="grain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7"/>
  <feColorMatrix values="0 0 0 0 .42  0 0 0 0 .28  0 0 0 0 .14  0 0 0 .55 -.18"/>
  <feComposite in2="SourceAlpha" operator="in"/>
</filter>
<filter id="stone" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency=".012 .03" numOctaves="4" seed="3"/>
  <feColorMatrix values="0 0 0 0 .35  0 0 0 0 .3  0 0 0 0 .24  0 0 0 .9 -.3"/>
  <feComposite in2="SourceAlpha" operator="in"/>
</filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="5" result="b"/>
  <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
  <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#5a3714" flood-opacity=".28"/>
</filter>`;

// 需要 Pillow（带 libimagequant）：python3 -c "from PIL import features; print(features.check('libimagequant'))"
const QUANT = `import sys
from PIL import Image
Image.open(sys.argv[1]).convert('RGBA').quantize(256, method=Image.LIBIMAGEQUANT).save(sys.argv[2], optimize=True)`;

const jobs = [];
function job(rel, w, h, body, { jpg = false, bg = 'transparent' } = {}) {
  jobs.push({ rel, w, h, body, jpg, bg });
}
function run() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const todo = jobs.filter((j) => j.rel.includes(filter));
  for (const j of todo) {
    const html = join(TMP, j.rel.replace(/\//g, '_') + '.html');
    const png = join(TMP, j.rel.replace(/\//g, '_') + '.png');
    writeFileSync(html, `<!doctype html><html><body style="margin:0;background:${j.bg}">
<svg xmlns="http://www.w3.org/2000/svg" width="${j.w}" height="${j.h}" viewBox="0 0 ${j.w} ${j.h}"><defs>${DEFS}</defs>${j.body}</svg></body></html>`);
    execFileSync('google-chrome', ['--headless=old', '--disable-gpu', '--hide-scrollbars',
      '--default-background-color=00000000', `--window-size=${j.w},${j.h}`, `--screenshot=${png}`, `file://${html}`],
      { stdio: 'ignore' });
    const out = join(MAIN_FILES.has(j.rel) ? MAIN_TEX : SUB_TEX, j.rel + (j.jpg ? '.jpg' : '.png'));
    mkdirSync(dirname(out), { recursive: true });
    // JPG：不透明大图；PNG：libimagequant 量化为 256 色调色板（保留半透明边缘与发光，体积约为 1/5）
    if (j.jpg) execFileSync('convert', [png, '-quality', '86', out]);
    else execFileSync('python3', ['-c', QUANT, png, out]);
    console.log(j.rel + (j.jpg ? '.jpg' : '.png'));
  }
}

// ---------- 装饰件 ----------
// 角花（祥云卷），以左上角为原点，向内延伸约 s 像素
function cornerCurl(color, s = 1, w = 4) {
  return `<g fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" transform="scale(${s})">
    <path d="M18 112 L18 48 Q18 18 48 18 L112 18"/>
    <path d="M40 74 C38 46 70 40 78 58 C84 72 66 80 58 70 C52 62 60 54 67 60"/>
    <path d="M74 40 C92 30 110 40 104 54"/>
  </g>`;
}
function corners(W, H, inset, draw) {
  return [
    `translate(${inset} ${inset})`,
    `translate(${W - inset} ${inset}) scale(-1 1)`,
    `translate(${inset} ${H - inset}) scale(1 -1)`,
    `translate(${W - inset} ${H - inset}) scale(-1 -1)`,
  ].map((t) => `<g transform="${t}">${draw}</g>`).join('');
}
// 回纹（方形螺旋）
const meander = (c) => `<path d="M14 74 V14 H74 V54 H34 V34 H54" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="square"/>`;
function sparkles(r, n, x0, y0, w, h, color, size = [4, 10]) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * w, y = y0 + r() * h, z = size[0] + r() * (size[1] - size[0]);
    s += `<path d="${star(x, y, z, z * 0.28, 4)}" fill="${color}" opacity="${f(0.5 + r() * 0.5)}"/>`;
  }
  return s;
}
function dust(r, n, x0, y0, w, h, color, max = 3) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<circle cx="${f(x0 + r() * w)}" cy="${f(y0 + r() * h)}" r="${f(0.6 + r() * max)}" fill="${color}" opacity="${f(0.3 + r() * 0.6)}"/>`;
  return s;
}

// ---------- 1. UI 卡片 1080×720 ----------
{
  const W = 1080, H = 720, I = 26;
  const r = rng(11);
  job('common/ui/event_card_gold', W, H, `
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdf3d6"/><stop offset=".55" stop-color="#f6e2ae"/><stop offset="1" stop-color="#eccf8a"/></linearGradient>
  <radialGradient id="hl" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fffbe9" stop-opacity=".8"/><stop offset="1" stop-color="#fffbe9" stop-opacity="0"/></radialGradient>
  <g filter="url(#shadow)"><rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I}" rx="26" fill="url(#g)" stroke="#d4a743" stroke-width="5"/></g>
  <rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I}" rx="26" fill="url(#hl)"/>
  <rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I}" rx="26" fill="#fff" filter="url(#grain)" opacity=".7"/>
  <rect x="${I + 20}" y="${I + 20}" width="${W - 2 * I - 40}" height="${H - 2 * I - 40}" rx="16" fill="none" stroke="#e2bf63" stroke-width="2"/>
  ${corners(W, H, I + 6, cornerCurl('#c9962e', 1.25, 4.5))}
  ${sparkles(r, 7, 60, 50, 200, 150, '#e8b84a')}${sparkles(r, 7, W - 260, H - 200, 200, 150, '#e8b84a')}
  ${sparkles(r, 4, W - 240, 50, 180, 120, '#f1cc6a', [3, 7])}${sparkles(r, 4, 60, H - 170, 180, 120, '#f1cc6a', [3, 7])}
  ${dust(r, 60, I + 10, I + 10, W - 2 * I - 20, H - 2 * I - 20, '#d9a93e', 1.6)}`);

  const r2 = rng(23);
  let cracks = '';
  const crack = (x, y, dx, dy, n) => {
    let d = `M${x} ${y}`;
    for (let i = 0; i < n; i++) { x += dx * (0.6 + r2()) + (r2() - 0.5) * 18; y += dy * (0.6 + r2()) + (r2() - 0.5) * 18; d += ` L${f(x)} ${f(y)}`; }
    return `<path d="${d}" fill="none" stroke="#7a3320" stroke-width="${f(1.5 + r2() * 1.5)}" opacity=".5" stroke-linecap="round"/>`;
  };
  cracks += crack(I + 4, 140, 22, 8, 5) + crack(I + 4, 520, 20, -6, 4) + crack(W - I - 4, 210, -24, 10, 5) + crack(W - I - 4, 600, -18, -8, 4);
  cracks += crack(260, I + 4, 6, 22, 4) + crack(820, I + 4, -8, 20, 5) + crack(380, H - I - 4, 8, -20, 4) + crack(760, H - I - 4, -6, -22, 4);
  job('common/ui/event_card_sudden', W, H, `
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e3d0"/><stop offset=".6" stop-color="#efcdb2"/><stop offset="1" stop-color="#e3b393"/></linearGradient>
  <clipPath id="c"><rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I}" rx="22"/></clipPath>
  <g filter="url(#shadow)"><rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I}" rx="22" fill="url(#g)"/></g>
  <g clip-path="url(#c)">
    <rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I}" rx="22" fill="none" stroke="#8c3b1f" stroke-width="56" opacity=".42" filter="url(#soft)"/>
    <rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I}" fill="#fff" filter="url(#grain)" opacity=".8"/>
    ${cracks}
    ${dust(r2, 140, I, I, W - 2 * I, 70, '#8a4a2a', 2.2)}${dust(r2, 140, I, H - I - 70, W - 2 * I, 70, '#8a4a2a', 2.2)}
    ${dust(r2, 60, I, I, 60, H - 2 * I, '#8a4a2a', 2.2)}${dust(r2, 60, W - I - 60, I, 60, H - 2 * I, '#8a4a2a', 2.2)}
  </g>
  <rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I}" rx="22" fill="none" stroke="#9a4a2a" stroke-width="3" opacity=".6"/>`);

  const r3 = rng(5);
  const chip = `M${I + 30} ${I} L${W - I - 60} ${I} L${W - I - 40} ${I + 14} L${W - I} ${I + 20} L${W - I} ${H - I - 50} L${W - I - 16} ${H - I - 30} L${W - I - 8} ${H - I} L${I + 70} ${H - I} L${I + 50} ${H - I - 12} L${I} ${H - I - 18} L${I} ${I + 40} L${I + 14} ${I + 22}Z`;
  job('common/ui/epitaph_card', W, H, `
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eee6d6"/><stop offset=".6" stop-color="#e1d6c1"/><stop offset="1" stop-color="#cfc1a6"/></linearGradient>
  <linearGradient id="bev" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0" stop-opacity=".9"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#7a6648" stop-opacity=".6"/></linearGradient>
  <clipPath id="c"><path d="${chip}"/></clipPath>
  <g filter="url(#shadow)"><path d="${chip}" fill="url(#g)"/></g>
  <g clip-path="url(#c)">
    <rect width="${W}" height="${H}" fill="#fff" filter="url(#stone)" opacity=".28"/>
    <rect width="${W}" height="${H}" fill="#fff" filter="url(#grain)" opacity=".6"/>
    <circle cx="${W - 150}" cy="140" r="56" fill="#e7a47a" opacity=".32"/>
    <circle cx="${W - 150}" cy="140" r="70" fill="none" stroke="#d9906a" stroke-width="2" opacity=".3"/>
    <path d="M${I + 200} ${H - I} l20 -40 l-14 -30 l24 -36" fill="none" stroke="#8a7656" stroke-width="2.5" opacity=".55"/>
    <path d="M${W - I} 300 l-36 14 l-20 30 l-34 6" fill="none" stroke="#8a7656" stroke-width="2.5" opacity=".5"/>
    <path d="M${I + 40} ${I} l18 30 l-6 26" fill="none" stroke="#8a7656" stroke-width="2" opacity=".45"/>
    ${dust(r3, 70, I, H - I - 50, W - 2 * I, 50, '#b59c74', 2.4)}
  </g>
  <path d="${chip}" fill="none" stroke="url(#bev)" stroke-width="10"/>
  <path d="${chip}" fill="none" stroke="#8a7656" stroke-width="2" opacity=".6"/>
  ${corners(W, H, I + 22, meander('#a8977a'))}`);
}

// ---------- 2. 卡框 600×900（四种稀有度共用，类型由徽记区分）----------
const RARITY = {
  common: { line: '#c9ae80', paper: ['#fbf3e1', '#f2e3c4'], win: '#fffaf0', deco: '#b89a66', w: 3 },
  rare: { line: '#4A90C8', paper: ['#f6f9fb', '#e6eef4'], win: '#fbfdff', deco: '#4A90C8', w: 4 },
  epic: { line: '#8E5BC9', paper: ['#faf6fd', '#ece2f5'], win: '#fdfbff', deco: '#8E5BC9', w: 4 },
  legend: { line: 'url(#gold)', paper: ['#fdf6e2', '#f5e3b8'], win: '#fffcf2', deco: '#c9962e', w: 6 },
};
for (const [id, c] of Object.entries(RARITY)) {
  const W = 600, H = 900, I = 10;
  const gem = (x, y) => `<path d="M${x} ${y - 11} L${x + 9} ${y} L${x} ${y + 11} L${x - 9} ${y}Z" fill="#b48be6" stroke="#6a3fa0" stroke-width="2"/><path d="M${x - 3} ${y - 4} L${x} ${y - 8}" stroke="#fff" stroke-width="2" opacity=".8"/>`;
  const deco = id === 'common'
    ? `<path d="M22 70 V22 H70" fill="none" stroke="${c.deco}" stroke-width="3"/><circle cx="22" cy="22" r="5" fill="${c.deco}"/>`
    : cornerCurl(c.deco, id === 'legend' ? 1.05 : 0.9, id === 'legend' ? 5 : 4) + (id === 'epic' ? gem(26, 26) : '') +
      (id === 'legend' ? `<circle cx="24" cy="24" r="7" fill="#f6d77a" stroke="#b07a1a" stroke-width="2"/>` : '');
  job(`common/frame/frame_${id}`, W, H, `
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dd8e"/><stop offset=".45" stop-color="#d9a43c"/><stop offset=".7" stop-color="#f2cf6e"/><stop offset="1" stop-color="#b8862a"/></linearGradient>
  <linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.paper[0]}"/><stop offset="1" stop-color="${c.paper[1]}"/></linearGradient>
  <g filter="url(#shadow)"><rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I - 6}" rx="30" fill="url(#p)" stroke="${c.line}" stroke-width="${c.w * 2}"/></g>
  <rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I - 6}" rx="30" fill="#fff" filter="url(#grain)" opacity=".5"/>
  <rect x="${I + 16}" y="${I + 16}" width="${W - 2 * I - 32}" height="${H - 2 * I - 38}" rx="20" fill="none" stroke="${c.line}" stroke-width="2" opacity=".7"/>
  <rect x="62" y="96" width="${W - 124}" height="290" rx="20" fill="${c.win}" stroke="${c.line}" stroke-width="3"/>
  <line x1="120" y1="420" x2="${W - 120}" y2="420" stroke="${c.line}" stroke-width="2" opacity=".45"/>
  ${corners(W, H - 6, I + 8, deco)}
  ${id === 'legend' ? `<rect x="${I}" y="${I}" width="${W - 2 * I}" height="${H - 2 * I - 6}" rx="30" fill="none" stroke="#ffe9a8" stroke-width="3" opacity=".7" filter="url(#glow)"/>` : ''}
  <circle cx="${W / 2}" cy="${I + 34}" r="30" fill="url(#p)" stroke="${c.line}" stroke-width="${c.w + 1}"/>`);
}

// ---------- 3. 类型徽记 128 ----------
{
  const ring = (inner) => `
  <radialGradient id="d" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#f1dfb8"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dd8e"/><stop offset=".5" stop-color="#d9a43c"/><stop offset="1" stop-color="#b8862a"/></linearGradient>
  <circle cx="64" cy="64" r="58" fill="url(#d)" stroke="url(#gold)" stroke-width="7"/>
  <circle cx="64" cy="64" r="49" fill="none" stroke="#d9a43c" stroke-width="1.5" opacity=".6"/>
  <g filter="url(#glow)">${inner}</g>`;
  job('common/frame/badge_talent', 128, 128, ring(`<path d="${star(64, 64, 34, 9, 4)}" fill="#e2a93a"/><circle cx="64" cy="64" r="6" fill="#fff6d6"/>`));
  job('common/frame/badge_item', 128, 128, ring(`
    <path d="M42 58 Q34 96 64 98 Q94 96 86 58 Q76 50 64 52 Q52 50 42 58Z" fill="#c4874a" stroke="#8a5a2a" stroke-width="2.5"/>
    <path d="M46 52 Q64 40 82 52" fill="none" stroke="#8a5a2a" stroke-width="4" stroke-linecap="round"/>
    <circle cx="64" cy="52" r="5" fill="#e2a93a"/><path d="M60 56 l-8 12 M68 56 l8 12" stroke="#e2a93a" stroke-width="3" stroke-linecap="round"/>`));
  job('common/frame/badge_companion', 128, 128, ring(`
    <path d="M48 70 Q64 52 80 62" fill="none" stroke="#f0c45a" stroke-width="3" stroke-dasharray="2 5" stroke-linecap="round"/>
    <circle cx="46" cy="72" r="14" fill="#f2b84a"/><circle cx="82" cy="60" r="14" fill="#f6cf6c"/>
    <circle cx="42" cy="68" r="4" fill="#fff6d6"/><circle cx="78" cy="56" r="4" fill="#fff6d6"/>`));
  job('common/frame/badge_skill', 128, 128, ring(`
    <path d="${spiral(64, 70, 4, 26, 1.6, Math.PI / 2)}" fill="none" stroke="#5c9a3a" stroke-width="6" stroke-linecap="round"/>
    <path d="M64 30 L56 46 L72 46Z" fill="#7bb556"/><circle cx="64" cy="70" r="4" fill="#c3ec8f"/>`));
}

// ---------- 4. 突破光效 1080 ----------
{
  const r = rng(99), C = 540;
  let rays = '';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * 2 * Math.PI + r() * 0.05, w = (i % 2 ? 0.018 : 0.04) + r() * 0.02, R = 780;
    rays += `<path d="M${C} ${C} L${f(C + R * Math.cos(a - w))} ${f(C + R * Math.sin(a - w))} L${f(C + R * Math.cos(a + w))} ${f(C + R * Math.sin(a + w))}Z" fill="url(#ray)" opacity="${f(0.5 + r() * 0.5)}"/>`;
  }
  let pts = '';
  for (let i = 0; i < 90; i++) {
    const a = r() * 2 * Math.PI, d = 140 + r() * 400;
    pts += `<circle cx="${f(C + d * Math.cos(a))}" cy="${f(C + d * Math.sin(a))}" r="${f(1 + r() * 3.5)}" fill="#efffc8" opacity="${f(0.25 + r() * 0.7)}"/>`;
  }
  job('common/fx/fx_breakthrough', 1080, 1080, `
  <radialGradient id="bg" cx=".5" cy=".5" r=".72"><stop offset="0" stop-color="#2f4a2a"/><stop offset=".45" stop-color="#1b2a20"/><stop offset="1" stop-color="#0d1215"/></radialGradient>
  <radialGradient id="ray" gradientUnits="userSpaceOnUse" cx="${C}" cy="${C}" r="760"><stop offset="0" stop-color="#e9ffc2" stop-opacity=".55"/><stop offset=".6" stop-color="#b8e58a" stop-opacity=".12"/><stop offset="1" stop-color="#b8e58a" stop-opacity="0"/></radialGradient>
  <radialGradient id="core" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f6ffe0" stop-opacity=".95"/><stop offset=".35" stop-color="#cdf09a" stop-opacity=".55"/><stop offset="1" stop-color="#9bd36a" stop-opacity="0"/></radialGradient>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  ${rays}
  <circle cx="${C}" cy="${C}" r="230" fill="none" stroke="#d6f5a8" stroke-width="3" opacity=".3"/>
  <circle cx="${C}" cy="${C}" r="340" fill="none" stroke="#d6f5a8" stroke-width="2" opacity=".18"/>
  <circle cx="${C}" cy="${C}" r="460" fill="none" stroke="#d6f5a8" stroke-width="2" opacity=".09"/>
  <circle cx="${C}" cy="${C}" r="300" fill="url(#core)"/>
  ${pts}
  <rect width="1080" height="1080" fill="#fff" filter="url(#grain)" opacity=".25"/>`, { jpg: true });
}

// ---------- 5. 符号图标 256 ----------
const G = '#f3cf7a', L = '#fff3d0', D = '#2e1f15';
const CAT = { death: '#b9a3dc', skill: '#8fd16a', item: '#f2a65a', talent: '#7cc4f0' };
function icon(cat, name, glyph) {
  const A = CAT[cat];
  job(`common/icon/${cat}_${name}`, 256, 256, `
  <radialGradient id="ib" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#5a4130"/><stop offset="1" stop-color="#2a1c12"/></radialGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1d58e"/><stop offset=".5" stop-color="#b98a3c"/><stop offset="1" stop-color="#e2b866"/></linearGradient>
  <circle cx="128" cy="128" r="120" fill="url(#ib)"/>
  <circle cx="128" cy="128" r="80" fill="${A}" opacity=".12" filter="url(#soft)"/>
  <g filter="url(#glow)">${glyph(A)}</g>
  <circle cx="128" cy="128" r="117" fill="none" stroke="url(#rim)" stroke-width="7"/>
  <circle cx="128" cy="128" r="106" fill="none" stroke="${A}" stroke-width="1.5" opacity=".45"/>`);
}
const heart = 'M128 190 C80 156 62 126 72 100 C82 74 114 72 128 98 C142 72 174 74 184 100 C194 126 176 156 128 190Z';
const shield = 'M128 62 L184 84 Q184 152 128 196 Q72 152 72 84Z';
const cloud = (c, o = 1) => `<g fill="${c}" opacity="${o}"><circle cx="104" cy="104" r="26"/><circle cx="136" cy="92" r="32"/><circle cx="164" cy="108" r="22"/><rect x="82" y="104" width="100" height="26" rx="13"/></g>`;
const flame = (x, y, s, c1, c2) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M0 -72 C22 -36 50 -20 44 22 C40 54 18 70 0 70 C-24 70 -44 52 -42 22 C-40 -4 -24 -16 -20 -36 C-12 -20 -8 -12 -2 -8 C2 -30 -4 -52 0 -72Z" fill="${c1}"/>
  <path d="M0 -16 C12 4 26 16 22 38 C19 56 10 62 0 62 C-12 62 -22 52 -20 36 C-18 22 -8 14 0 -16Z" fill="${c2}"/></g>`;
const bubble = (x, y, w, h, fill, tail) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${fill}"/><path d="${tail}" fill="${fill}"/>`;

// 死因
icon('death', 'old_age', (A) => `
  <rect x="82" y="58" width="92" height="12" rx="5" fill="${G}"/><rect x="82" y="186" width="92" height="12" rx="5" fill="${G}"/>
  <path d="M94 70 L162 70 L134 128 L162 186 L94 186 L122 128Z" fill="${L}" fill-opacity=".12" stroke="${G}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M104 184 Q128 150 152 184Z" fill="${A}"/>
  <path d="M184 92 q16 -12 6 -30 M196 120 q12 -8 4 -20" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round" opacity=".7"/>`);
icon('death', 'thirst', (A) => `
  <path d="M58 166 L198 166 L188 196 L68 196Z" fill="#8a6a44"/><path d="M58 166 L198 166" stroke="${G}" stroke-width="5" stroke-linecap="round"/>
  <path d="M92 166 l8 12 l-6 16 M128 166 l-7 10 l8 18 M164 166 l6 12 l-4 16" fill="none" stroke="${D}" stroke-width="3.5"/>
  <path d="M128 66 C128 66 102 100 102 118 A26 26 0 0 0 154 118 C154 100 128 66 128 66Z" fill="#8cc8ec"/>
  <path d="M116 112 q2 -12 10 -20" stroke="${L}" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="128" cy="152" r="3" fill="#8cc8ec" opacity=".7"/>`);
icon('death', 'beast', () => `
  <g fill="none" stroke="${G}" stroke-width="13" stroke-linecap="round">
  <path d="M90 66 Q74 128 94 190"/><path d="M130 58 Q114 128 134 196"/><path d="M170 66 Q154 128 174 190"/></g>`);
icon('death', 'storm', (A) => `
  <g fill="none" stroke="${G}" stroke-width="7" stroke-linecap="round">
  <ellipse cx="128" cy="74" rx="58" ry="13"/><ellipse cx="122" cy="104" rx="46" ry="11"/><ellipse cx="132" cy="132" rx="34" ry="9"/>
  <ellipse cx="124" cy="158" rx="22" ry="7"/><ellipse cx="132" cy="182" rx="11" ry="5"/></g>
  ${[[70, 96], [186, 118], [80, 150], [176, 76], [168, 160]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${A}"/>`).join('')}`);
icon('death', 'lightning', (A) => `${cloud('#8f86a6')}
  <path d="M136 116 L108 162 L130 162 L114 206 L160 146 L138 146 L154 116Z" fill="${G}"/>
  <circle cx="98" cy="96" r="6" fill="${A}" opacity=".7"/>`);
icon('death', 'fire', () => `${flame(128, 132, 1, '#f08a4b', G)}
  <path d="M128 52 q-12 -14 0 -26" fill="none" stroke="#ccc" stroke-width="3" opacity=".5"/>`);
icon('death', 'collapse', () => `
  <g stroke="${G}" stroke-width="3.5"><ellipse cx="98" cy="174" rx="36" ry="22" fill="#a58a6a"/><ellipse cx="160" cy="172" rx="32" ry="24" fill="#93785a"/>
  <ellipse cx="128" cy="138" rx="32" ry="22" fill="#b89a76"/><ellipse cx="152" cy="86" rx="18" ry="14" fill="#a58a6a"/></g>
  <path d="M150 104 v14 M160 106 v10" stroke="${L}" stroke-width="3" stroke-linecap="round" opacity=".6"/>
  ${[[70, 150], [190, 146], [84, 200], [176, 202], [110, 110]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${L}" opacity=".6"/>`).join('')}`);
icon('death', 'curse', (A) => `
  <circle cx="128" cy="130" r="70" fill="${A}" opacity=".25"/>
  <path d="M92 196 L92 100 Q92 62 128 62 Q164 62 164 100 L164 196Z" fill="#6f5a7e" stroke="${A}" stroke-width="5"/>
  <g fill="none" stroke="#e6d6ff" stroke-width="5" stroke-linecap="round"><path d="M112 98 h32 M128 98 v20"/><path d="M110 134 l18 12 l18 -12"/><path d="M114 168 h28 M128 160 v18"/></g>`);
icon('death', 'human', () => `
  <clipPath id="net"><path d="M60 184 Q128 22 196 184Z"/></clipPath>
  <g clip-path="url(#net)" stroke="#d9b679" stroke-width="5">
    ${Array.from({ length: 10 }, (_, i) => `<line x1="${20 + i * 26}" y1="40" x2="${-60 + i * 26}" y2="200"/><line x1="${-20 + i * 26}" y1="40" x2="${60 + i * 26}" y2="200"/>`).join('')}
  </g>
  <path d="M60 184 Q128 22 196 184" fill="none" stroke="${G}" stroke-width="8" stroke-linecap="round"/>
  <path d="M56 186 L200 186" stroke="${G}" stroke-width="6" stroke-linecap="round"/>`);
icon('death', 'betrayal', () => {
  const zig = 'L120 96 L136 122 L120 150 L132 256';
  return `<clipPath id="lh"><path d="M128 0 ${zig} H0 V0Z"/></clipPath><clipPath id="rh"><path d="M128 0 ${zig} H256 V0Z"/></clipPath>
  <path d="M128 70 L120 96 L136 122 L120 150 L130 196" fill="none" stroke="${L}" stroke-width="6" opacity=".8"/>
  <g clip-path="url(#lh)" transform="translate(-10 4) rotate(-6 128 128)"><path d="${heart}" fill="#d9748a" stroke="${G}" stroke-width="5"/></g>
  <g clip-path="url(#rh)" transform="translate(10 0) rotate(6 128 128)"><path d="${heart}" fill="#c65f78" stroke="${G}" stroke-width="5"/></g>`;
});
icon('death', 'accident', () => `
  <ellipse cx="128" cy="136" rx="76" ry="26" fill="none" stroke="${L}" stroke-width="3" stroke-dasharray="6 8" opacity=".6" transform="rotate(-12 128 136)"/>
  <path d="${star(64, 140, 20, 8, 5)}" fill="${G}"/><path d="${star(128, 104, 28, 11, 5)}" fill="${G}"/>
  <path d="${star(192, 124, 18, 7, 5)}" fill="${G}"/><path d="${star(150, 170, 14, 6, 5)}" fill="${G}" opacity=".8"/>`);
icon('death', 'exhaust', () => `
  <path d="M70 150 Q128 200 186 150Z" fill="#a8763a" stroke="${G}" stroke-width="4"/>
  <path d="M110 174 h36 l8 20 h-52z" fill="#8a5a2a" stroke="${G}" stroke-width="3"/>
  <path d="M182 150 Q196 138 204 120" fill="none" stroke="${G}" stroke-width="7" stroke-linecap="round"/>
  <path d="M70 150 Q56 134 70 120 Q82 112 88 128" fill="none" stroke="${G}" stroke-width="5" stroke-linecap="round"/>
  <path d="M205 100 C212 110 212 118 205 121 C198 118 198 110 205 100Z" fill="#f08a4b" opacity=".8"/>
  <line x1="204" y1="120" x2="204" y2="126" stroke="${D}" stroke-width="3"/>`);

// 技能
icon('skill', 'grow', (A) => `<path d="M128 54 L172 104 L146 104 L146 198 L110 198 L110 104 L84 104Z" fill="${G}" stroke="${A}" stroke-width="4" stroke-linejoin="round"/>
  ${[[78, 150, 6], [178, 140, 5], [88, 92, 4], [170, 70, 5], [190, 186, 4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${A}"/>`).join('')}`);
icon('skill', 'burst', (A) => `<path d="${star(128, 128, 84, 34, 12)}" fill="${A}" opacity=".8"/><path d="${star(128, 128, 60, 26, 8, -67.5)}" fill="${G}"/><circle cx="128" cy="128" r="18" fill="${L}"/>`);
icon('skill', 'rest', (A) => `<path d="M150 66 A64 64 0 1 0 150 190 A52 52 0 1 1 150 66Z" fill="${G}"/>
  <circle cx="172" cy="78" r="9" fill="none" stroke="${A}" stroke-width="3"/><circle cx="190" cy="104" r="6" fill="none" stroke="${A}" stroke-width="3"/><circle cx="198" cy="128" r="3.5" fill="${A}"/>`);
icon('skill', 'link', (A) => {
  const n = Array.from({ length: 6 }, (_, i) => [128 + 66 * Math.cos((i * Math.PI) / 3), 128 + 66 * Math.sin((i * Math.PI) / 3)]);
  return `<g stroke="${A}" stroke-width="4">${n.map(([x, y], i) => `<line x1="128" y1="128" x2="${f(x)}" y2="${f(y)}"/><line x1="${f(x)}" y1="${f(y)}" x2="${f(n[(i + 1) % 6][0])}" y2="${f(n[(i + 1) % 6][1])}"/>`).join('')}</g>
  <circle cx="128" cy="128" r="14" fill="${G}"/>${n.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="9" fill="${G}"/>`).join('')}`;
});
icon('skill', 'thunder', (A) => `<path d="M140 50 L100 132 L128 132 L110 206 L166 114 L138 114 L160 50Z" fill="${G}"/>
  <ellipse cx="110" cy="206" rx="34" ry="8" fill="none" stroke="${A}" stroke-width="4"/><circle cx="110" cy="204" r="6" fill="${L}"/>`);
icon('skill', 'rally', (A) => `<line x1="94" y1="58" x2="94" y2="190" stroke="${G}" stroke-width="7" stroke-linecap="round"/>
  <path d="M98 62 Q140 50 178 68 Q160 84 178 104 Q140 88 98 100Z" fill="${A}"/>
  ${[118, 140, 162, 184].map((x) => `<circle cx="${x}" cy="176" r="8" fill="${G}"/>`).join('')}`);
icon('skill', 'insight', (A) => `<path d="M52 128 Q128 54 204 128 Q128 202 52 128Z" fill="${L}" stroke="${G}" stroke-width="6"/>
  <circle cx="128" cy="128" r="32" fill="${A}"/><circle cx="128" cy="128" r="14" fill="${D}"/><path d="${star(138, 116, 9, 2.5, 4)}" fill="#fff"/>`);
icon('skill', 'bind', (A) => `<g fill="none" stroke-linecap="round"><ellipse cx="108" cy="128" rx="40" ry="62" transform="rotate(-35 108 128)" stroke="${G}" stroke-width="12"/>
  <ellipse cx="148" cy="128" rx="40" ry="62" transform="rotate(35 148 128)" stroke="${A}" stroke-width="12"/>
  <path d="M84 88 Q96 104 104 106" stroke="${G}" stroke-width="12"/></g>`);
icon('skill', 'feign', (A) => `<clipPath id="rhalf"><rect x="128" y="0" width="128" height="256"/></clipPath>
  <path d="M68 88 Q128 58 188 88 Q192 160 128 198 Q64 160 68 88Z" fill="${L}"/>
  <path d="M68 88 Q128 58 188 88 Q192 160 128 198 Q64 160 68 88Z" fill="${A}" clip-path="url(#rhalf)" opacity=".85"/>
  <path d="M68 88 Q128 58 188 88 Q192 160 128 198 Q64 160 68 88Z" fill="none" stroke="${G}" stroke-width="5"/>
  <path d="M88 122 q14 10 28 0" fill="none" stroke="${D}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="156" cy="122" r="9" fill="${D}"/><path d="M106 160 q22 16 44 0" fill="none" stroke="${D}" stroke-width="5" stroke-linecap="round"/>`);
icon('skill', 'counter', (A) => `<path d="${star(128, 130, 94, 74, 16)}" fill="${G}"/><path d="${shield}" fill="${A}" stroke="${G}" stroke-width="5"/>
  <path d="M128 84 V176 M96 112 H160" stroke="${L}" stroke-width="5" opacity=".7" stroke-linecap="round"/>`);
icon('skill', 'wind', (A) => `<g fill="none" stroke-linecap="round"><path d="M56 108 Q130 64 172 98 Q194 118 174 136 Q156 148 146 130" stroke="${G}" stroke-width="10"/>
  <path d="M66 152 Q140 122 196 152" stroke="${A}" stroke-width="8"/><path d="M90 188 Q140 168 178 182" stroke="${A}" stroke-width="6"/></g>`);
icon('skill', 'talk', (A) => `${bubble(56, 70, 100, 64, L, 'M80 132 L72 156 L104 134Z')}${bubble(104, 122, 100, 64, A, 'M176 184 L186 206 L156 186Z')}
  <path d="${star(128, 128, 14, 5, 4)}" fill="${G}"/>`);
icon('skill', 'devour', (A) => `<path d="${spiral(120, 136, 4, 70, 2.4)}" fill="none" stroke="${G}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="186" cy="74" r="16" fill="${L}"/><circle cx="186" cy="74" r="24" fill="${A}" opacity=".35"/>
  <circle cx="166" cy="92" r="4" fill="${L}"/><circle cx="154" cy="104" r="3" fill="${L}" opacity=".7"/>`);
icon('skill', 'immune', (A) => `${flame(80, 120, 0.7, '#f08a4b', '#f6c06a')}${flame(176, 120, 0.7, '#f08a4b', '#f6c06a')}
  <path d="${shield}" fill="${A}" stroke="${G}" stroke-width="6"/><path d="M128 90 V170" stroke="${L}" stroke-width="5" stroke-linecap="round" opacity=".7"/>`);

// 道具
icon('item', 'supply', (A) => `<rect x="112" y="56" width="32" height="14" rx="4" fill="#a8703e"/><rect x="116" y="68" width="24" height="26" fill="${L}" opacity=".85"/>
  <circle cx="128" cy="140" r="50" fill="${L}" opacity=".9"/><path d="M80 146 A48 48 0 0 0 176 146 Q128 128 80 146Z" fill="${A}"/>
  <circle cx="128" cy="140" r="50" fill="none" stroke="${G}" stroke-width="5"/><path d="M104 118 q8 -12 20 -14" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M116 86 l-14 10 M140 86 l14 10" stroke="#c94a3a" stroke-width="4" stroke-linecap="round"/>`);
icon('item', 'gem', (A) => `<radialGradient id="pearl" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f1e6d2"/><stop offset="1" stop-color="#c9b48e"/></radialGradient>
  <circle cx="128" cy="130" r="54" fill="url(#pearl)" stroke="${G}" stroke-width="4"/><ellipse cx="110" cy="110" rx="14" ry="9" fill="#fff" opacity=".9" transform="rotate(-30 110 110)"/>
  <path d="${star(180, 80, 14, 4, 4)}" fill="${A}"/>`);
icon('item', 'crystal', (A) => `<ellipse cx="128" cy="130" rx="40" ry="60" fill="#ffd27a" opacity=".4"/>
  <path d="M128 52 L172 104 L150 198 L106 198 L84 104Z" fill="${A}" stroke="${G}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M84 104 L128 120 L172 104 M128 120 L128 198 M128 52 L128 120" fill="none" stroke="${L}" stroke-width="3" opacity=".7"/>`);
icon('item', 'shield', (A) => `<path d="M128 44 Q94 66 102 96 M128 44 Q162 66 154 96" fill="none" stroke="#c94a3a" stroke-width="6" stroke-linecap="round"/>
  <circle cx="128" cy="142" r="52" fill="${G}" stroke="${A}" stroke-width="7"/><circle cx="128" cy="142" r="26" fill="none" stroke="${A}" stroke-width="5"/><circle cx="128" cy="142" r="8" fill="${A}"/>`);
icon('item', 'guide', (A) => `<circle cx="128" cy="130" r="64" fill="#b98a4a" stroke="${G}" stroke-width="6"/><circle cx="128" cy="130" r="50" fill="${D}"/>
  ${[0, 90, 180, 270].map((a) => `<line x1="128" y1="84" x2="128" y2="94" stroke="${G}" stroke-width="4" transform="rotate(${a} 128 130)"/>`).join('')}
  <path d="M128 90 L140 130 L116 130Z" fill="${A}"/><path d="M128 170 L140 130 L116 130Z" fill="${L}"/><circle cx="128" cy="130" r="6" fill="${G}"/>
  <rect x="120" y="56" width="16" height="12" rx="4" fill="${G}"/>`);
icon('item', 'key', (A) => `<path d="M92 80 L150 64 L180 110 L160 178 L104 190 L78 136Z" fill="#c79a6a" stroke="${G}" stroke-width="5" stroke-linejoin="round"/>
  <g fill="none" stroke="${A}" stroke-width="5" stroke-linecap="round"><path d="M110 104 h36 M128 104 v24"/><path d="M106 150 l22 14 l22 -14"/></g>`);
icon('item', 'relic', () => `<path d="M84 124 L104 82 L196 94 L176 124Z" fill="#a8703e" stroke="${G}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M84 124 L176 124 L170 106 L94 108Z" fill="#ffe9a8" opacity=".85"/>
  <rect x="76" y="122" width="108" height="66" rx="6" fill="#8a5a32" stroke="${G}" stroke-width="4"/>
  <rect x="120" y="136" width="20" height="16" rx="3" fill="${G}"/><path d="M76 154 H184" stroke="${G}" stroke-width="2" opacity=".5"/>`);
icon('item', 'token', (A) => `<circle cx="128" cy="138" r="58" fill="${A}" stroke="${G}" stroke-width="7"/><circle cx="128" cy="72" r="10" fill="none" stroke="${G}" stroke-width="5"/>
  <g fill="#5a3a24"><ellipse cx="128" cy="152" rx="22" ry="18"/><circle cx="100" cy="124" r="9"/><circle cx="118" cy="110" r="9"/><circle cx="138" cy="110" r="9"/><circle cx="156" cy="124" r="9"/></g>`);
icon('item', 'artifact', (A) => `<ellipse cx="128" cy="160" rx="62" ry="16" fill="none" stroke="${A}" stroke-width="4"/>
  ${Array.from({ length: 8 }, (_, i) => `<line x1="128" y1="56" x2="128" y2="40" stroke="${G}" stroke-width="4" stroke-linecap="round" transform="rotate(${i * 45} 128 116)"/>`).join('')}
  <path d="M128 64 L158 116 L128 170 L98 116Z" fill="${G}"/><path d="M128 82 L144 116 L128 150 L112 116Z" fill="${L}"/>`);

// 天赋
icon('talent', 'vitality', () => `<path d="${heart}" fill="#f29a8a" stroke="${G}" stroke-width="5"/>
  <path d="M74 128 H104 L114 108 L128 152 L140 120 L148 128 H182" fill="none" stroke="${L}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`);
icon('talent', 'growth', (A) => `<g fill="${A}" stroke="${G}" stroke-width="4"><rect x="66" y="160" width="38" height="36" rx="4"/><rect x="108" y="126" width="38" height="70" rx="4"/><rect x="150" y="92" width="38" height="104" rx="4"/></g>
  <path d="${star(170, 64, 16, 5, 4)}" fill="${G}"/>`);
icon('talent', 'defense', (A) => `<path d="${shield}" fill="${A}" stroke="${G}" stroke-width="7"/><circle cx="128" cy="124" r="18" fill="${G}"/><circle cx="128" cy="124" r="8" fill="${L}"/>`);
icon('talent', 'wisdom', (A) => `<path d="M128 56 L170 152 L86 152Z M128 200 L86 104 L170 104Z" fill="${G}" fill-rule="nonzero"/><circle cx="128" cy="128" r="16" fill="${L}"/>
  ${[[70, 80], [190, 84], [72, 180], [188, 176]].map(([x, y]) => `<path d="${star(x, y, 8, 2.5, 4)}" fill="${A}"/>`).join('')}`);
icon('talent', 'luck', (A) => `<ellipse cx="128" cy="128" rx="48" ry="60" fill="${G}" stroke="#b07a2a" stroke-width="5" transform="rotate(-14 128 128)"/>
  <rect x="116" y="116" width="24" height="24" fill="#2a1c12" transform="rotate(-14 128 128)"/>
  <path d="M60 100 q-10 28 0 56 M196 100 q10 28 0 56" fill="none" stroke="${A}" stroke-width="5" stroke-linecap="round"/>`);
icon('talent', 'social', () => `${bubble(62, 72, 132, 96, L, 'M98 166 L86 200 L132 168Z')}<path d="${star(128, 120, 24, 9, 5)}" fill="${G}"/>`);
icon('talent', 'cursed', (A) => `${cloud('#8a8fa8')}<g stroke="${A}" stroke-width="5" stroke-linecap="round">${[[98, 146], [122, 150], [146, 146], [170, 150], [110, 178], [158, 178]].map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x - 6}" y2="${y + 16}"/>`).join('')}</g>`);
icon('talent', 'bloodline', (A) => {
  const pts = Array.from({ length: 121 }, (_, i) => { const a = (i / 120) * 2 * Math.PI, r = 44 + 7 * Math.sin(6 * a); return `${f(128 + r * Math.cos(a))},${f(128 + r * Math.sin(a))}`; });
  return `<circle cx="128" cy="128" r="66" fill="none" stroke="${G}" stroke-width="7"/><path d="M${pts.join(' L')}Z" fill="none" stroke="${A}" stroke-width="5"/>
  <path d="M128 106 C128 106 114 124 114 134 A14 14 0 0 0 142 134 C142 124 128 106 128 106Z" fill="#e06a5a"/>`;
});
icon('talent', 'rebirth', (A) => {
  const head = (a, c) => { const x = 128 + 62 * Math.cos((a * Math.PI) / 180), y = 128 + 62 * Math.sin((a * Math.PI) / 180); return `<path d="M0 -16 L18 0 L0 16Z" fill="${c}" transform="translate(${f(x)} ${f(y)}) rotate(${a + 90})"/>`; };
  return `<g fill="none" stroke-width="12" stroke-linecap="round"><path d="${arc(128, 128, 62, 200, 330)}" stroke="${G}"/><path d="${arc(128, 128, 62, 20, 150)}" stroke="${A}"/></g>
  ${head(336, G)}${head(156, A)}<circle cx="128" cy="128" r="12" fill="${L}"/>`;
});

// ---------- 6. 命格层：荒漠一株草主界面背景 1080×1920 ----------
{
  const r = rng(42);
  job('destiny/desert_grass/main_bg', 1080, 1920, `
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e6c6"/><stop offset=".6" stop-color="#f3dcb0"/><stop offset="1" stop-color="#ecc98f"/></linearGradient>
  <linearGradient id="d1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c58c"/><stop offset="1" stop-color="#d9ad6e"/></linearGradient>
  <linearGradient id="d2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ddb072"/><stop offset="1" stop-color="#c8935a"/></linearGradient>
  <linearGradient id="d3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cf9d60"/><stop offset="1" stop-color="#a87444"/></linearGradient>
  <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff8e0"/><stop offset=".4" stop-color="#fff1c8" stop-opacity=".7"/><stop offset="1" stop-color="#fff1c8" stop-opacity="0"/></radialGradient>
  <rect width="1080" height="1920" fill="url(#sky)"/>
  <circle cx="800" cy="300" r="260" fill="url(#sun)"/>
  <path d="M0 1540 Q200 1480 420 1520 T820 1500 T1080 1520 V1920 H0Z" fill="url(#d1)" opacity=".8"/>
  <path d="M0 1620 Q260 1560 540 1610 T1080 1590 V1920 H0Z" fill="url(#d2)"/>
  <path d="M0 1740 Q300 1690 620 1730 T1080 1720 V1920 H0Z" fill="url(#d3)"/>
  <path d="M0 1620 Q260 1560 540 1610 T1080 1590" fill="none" stroke="#f3d39c" stroke-width="4" opacity=".7"/>
  <g transform="translate(540 1712)">
    <path d="M0 0 C-2 -20 2 -36 0 -52" stroke="#5c9a3a" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M0 -40 C-20 -54 -36 -50 -42 -40 C-28 -32 -12 -34 0 -40Z" fill="#7bb556"/>
    <path d="M1 -50 C18 -66 34 -62 40 -52 C26 -44 12 -44 1 -50Z" fill="#9bd36a"/>
    <ellipse cx="0" cy="2" rx="26" ry="6" fill="#a87444" opacity=".6"/>
  </g>
  ${dust(r, 120, 0, 1600, 1080, 320, '#f6dfb0', 2)}
  <rect width="1080" height="1920" fill="#fff" filter="url(#grain)" opacity=".5"/>`, { jpg: true });
}

// ---------- 7. 第二批 UI：按钮 / 弹窗面板 / 工具栏 / 属性 / 方向 / 广告 ----------
// 按钮 240×120（九宫格 上36 右36 下48 左36，底部 12px 是按钮厚度）
const BTN = {
  normal: { top: '#fffdf6', bot: '#f4e6c9', line: '#b0906a', side: '#c8ad86', hl: true },
  primary: { top: '#8cc865', bot: '#5c9a3a', line: '#457a2a', side: '#3c6b24', hl: true },
  ad: { top: '#ffeab0', bot: '#f0c255', line: '#c99a34', side: '#b58a2b', hl: true },
  locked: { top: '#f1e9d8', bot: '#e8dcc4', line: '#cdbb9c', side: '#d9c9a8', hl: false },
};
for (const [id, c] of Object.entries(BTN)) {
  job(`common/ui/btn_${id}`, 240, 120, `
  <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.top}"/><stop offset="1" stop-color="${c.bot}"/></linearGradient>
  <rect x="3" y="15" width="234" height="102" rx="28" fill="${c.side}"/>
  <rect x="3" y="3" width="234" height="102" rx="28" fill="url(#b)" stroke="${c.line}" stroke-width="3"/>
  ${c.hl ? '<path d="M30 14 H210" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>' : ''}`);
}

// 弹窗面板 480×480（九宫格 90）
job('common/ui/panel', 480, 480, `
  <linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcf5e4"/><stop offset="1" stop-color="#f1e1bf"/></linearGradient>
  <g filter="url(#shadow)"><rect x="12" y="10" width="456" height="452" rx="28" fill="url(#p)" stroke="#c9a874" stroke-width="4"/></g>
  <rect x="12" y="10" width="456" height="452" rx="28" fill="#fff" filter="url(#grain)" opacity=".5"/>
  <rect x="28" y="26" width="424" height="420" rx="18" fill="none" stroke="#c9a874" stroke-width="2" opacity=".6"/>
  ${corners(480, 472, 22, cornerCurl('#b89a66', 0.62, 4))}`);

// 工具栏图标 128（圆角方块底 + 棕色符号）
function tool(name, glyph) {
  job(`common/icon/tool_${name}`, 128, 128, `
  <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8ead0"/><stop offset="1" stop-color="#ecd5a8"/></linearGradient>
  <rect x="6" y="6" width="116" height="116" rx="28" fill="url(#t)" stroke="#c9a874" stroke-width="3"/>
  ${glyph}`);
}
const BR = '#7a4a1f', GD = '#d99a2b';
tool('items', `<path d="M38 58 Q30 100 64 102 Q98 100 90 58 Q78 50 64 52 Q50 50 38 58Z" fill="#c4874a" stroke="${BR}" stroke-width="4"/>
  <path d="M42 52 Q64 36 86 52" fill="none" stroke="${BR}" stroke-width="5" stroke-linecap="round"/><circle cx="64" cy="52" r="6" fill="${GD}"/>`);
tool('skills', `<path d="${spiral(62, 70, 3, 28, 1.7, Math.PI / 2)}" fill="none" stroke="#5c9a3a" stroke-width="7" stroke-linecap="round"/>
  <path d="${star(94, 34, 12, 3.5, 4)}" fill="${GD}"/>`);
tool('companions', `<circle cx="48" cy="56" r="13" fill="#c4874a"/><path d="M26 98 Q26 74 48 74 Q70 74 70 98Z" fill="#c4874a"/>
  <circle cx="82" cy="50" r="15" fill="${BR}"/><path d="M58 98 Q58 70 82 70 Q106 70 106 98Z" fill="${BR}"/>`);
tool('codex', `<path d="M64 40 Q46 30 26 34 V94 Q46 90 64 100 Q82 90 102 94 V34 Q82 30 64 40Z" fill="#fbf3e1" stroke="${BR}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M64 40 V100" stroke="${BR}" stroke-width="4"/><path d="M36 50 h18 M36 62 h18 M74 50 h18 M74 62 h18 M74 74 h12" stroke="${GD}" stroke-width="3.5" stroke-linecap="round"/>`);

// 属性 / 方向：彩色圆底 + 白色符号（128，小尺寸显示）
function dot(rel, color, glyph) {
  job(rel, 128, 128, `
  <radialGradient id="c" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <circle cx="64" cy="64" r="58" fill="${color}"/><circle cx="64" cy="64" r="58" fill="url(#c)"/>
  <circle cx="64" cy="64" r="56" fill="none" stroke="#fff" stroke-width="3" opacity=".5"/>
  <g fill="#fff" stroke="#fff">${glyph}</g>`);
}
const WS = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
dot('common/icon/stat_life', '#3d8fc0', `<path d="M64 26 C64 26 40 58 40 74 A24 24 0 0 0 88 74 C88 58 64 26 64 26Z" stroke="none"/>`);
dot('common/icon/stat_down', '#8a6a3c', `<path d="M64 28 V88 M42 68 L64 92 L86 68" ${WS} stroke-width="9"/><path d="M64 56 L46 44 M64 68 L84 56" ${WS} stroke-width="5"/>`);
dot('common/icon/stat_up', '#5c9a3a', `<path d="M64 98 V40 M42 60 L64 36 L86 60" ${WS} stroke-width="9"/><path d="M64 78 C52 76 44 68 42 58 C54 60 62 66 64 78Z" stroke="none"/>`);
dot('common/icon/stat_tough', '#7d7d7d', `<path d="M64 28 L94 40 Q94 80 64 100 Q34 80 34 40Z" stroke="none"/>`);
dot('common/icon/stat_spirit', '#8e5bc9', `<path d="${star(64, 64, 36, 10, 4)}" stroke="none"/>`);
dot('common/icon/stat_energy', '#d99a2b', `<circle cx="64" cy="64" r="16" stroke="none"/>
  ${Array.from({ length: 8 }, (_, i) => `<line x1="64" y1="28" x2="64" y2="38" stroke-width="7" stroke-linecap="round" transform="rotate(${i * 45} 64 64)"/>`).join('')}`);
dot('common/icon/dir_up', '#5c9a3a', `<path d="M64 96 V36 M38 60 L64 32 L90 60" ${WS} stroke-width="11"/>`);
dot('common/icon/dir_down', '#8a6a3c', `<path d="M64 32 V92 M38 68 L64 96 L90 68" ${WS} stroke-width="11"/>`);
dot('common/icon/dir_side', '#8e5bc9', `<path d="M30 64 H98 M78 44 L100 64 L78 84 M50 44 L28 64 L50 84" ${WS} stroke-width="9"/>`);
job('common/icon/ad_video', 128, 128, `
  <rect x="10" y="26" width="108" height="76" rx="20" fill="#b58a2b"/><rect x="10" y="26" width="108" height="76" rx="20" fill="none" stroke="#fff" stroke-width="3" opacity=".5"/>
  <path d="M54 46 L84 64 L54 82Z" fill="#fff"/>`);

// ---------- 8. 标题字 / 分享图 / 小程序头像 ----------
const TITLE_FONT = `font-family="Noto Serif CJK SC, Source Han Serif SC, serif" font-weight="900"`;
const titleBlock = (cx, y, big, small) => `
  <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a4f1c"/><stop offset="1" stop-color="#4a2a10"/></linearGradient>
  <text x="${cx}" y="${y}" text-anchor="middle" ${TITLE_FONT} font-size="${big}" letter-spacing="${f(big * 0.12)}" fill="url(#tg)" stroke="#fff3d0" stroke-width="${f(big * 0.06)}" paint-order="stroke">我重生了</text>
  <text x="${cx}" y="${f(y + small * 1.9)}" text-anchor="middle" ${TITLE_FONT} font-size="${small}" letter-spacing="${f(small * 0.18)}" fill="#6b4a2a" stroke="#fff3d0" stroke-width="${f(small * 0.12)}" paint-order="stroke">这一世，我将拿回属于我的一切</text>`;
job('common/ui/logo_title', 1000, 360, `
  <radialGradient id="gl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3c4" stop-opacity=".9"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>
  <ellipse cx="500" cy="170" rx="480" ry="170" fill="url(#gl)"/>
  ${titleBlock(500, 190, 150, 44)}
  <path d="${star(120, 70, 16, 4, 4)}" fill="#e2b04a"/><path d="${star(890, 230, 12, 3, 4)}" fill="#e2b04a"/>`);

const coverBg = (W, H, r) => `
  <radialGradient id="cb" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="#fff6dc"/><stop offset=".6" stop-color="#f3d9a6"/><stop offset="1" stop-color="#d9a868"/></radialGradient>
  <radialGradient id="ry" gradientUnits="userSpaceOnUse" cx="${W / 2}" cy="${f(H * 0.62)}" r="${f(W * 0.7)}"><stop offset="0" stop-color="#fffbe8" stop-opacity=".8"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></radialGradient>
  <rect width="${W}" height="${H}" fill="url(#cb)"/>
  ${Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * 2 * Math.PI, w = 0.05, R = W, cx = W / 2, cy = H * 0.62; return `<path d="M${cx} ${f(cy)} L${f(cx + R * Math.cos(a - w))} ${f(cy + R * Math.sin(a - w))} L${f(cx + R * Math.cos(a + w))} ${f(cy + R * Math.sin(a + w))}Z" fill="url(#ry)"/>`; }).join('')}
  ${dust(r, 40, 0, 0, W, H, '#fff8e0', 2.5)}`;
const sprout = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
  <circle cx="0" cy="-40" r="70" fill="#d6f5a8" opacity=".35" filter="url(#soft)"/>
  <path d="M0 0 C-3 -30 3 -56 0 -84" stroke="#4f8a30" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M0 -44 C-28 -60 -50 -54 -60 -40 C-40 -30 -18 -32 0 -44Z" fill="#7bb556"/>
  <path d="M1 -64 C26 -84 48 -80 58 -66 C38 -54 18 -56 1 -64Z" fill="#9bd36a"/>
  <ellipse cx="0" cy="4" rx="46" ry="9" fill="#a87444" opacity=".5"/></g>`;
job('common/ui/share_cover', 500, 400, `${coverBg(500, 400, rng(8))}
  ${titleBlock(250, 120, 76, 24)}${sprout(250, 350, 1.15)}
  <rect width="500" height="400" fill="#fff" filter="url(#grain)" opacity=".4"/>`, { jpg: true });

// 小程序头像（备案 / 后台上传用，不进游戏包；路径相对 textures/）
job('../../../docs/filing/app_icon', 1024, 1024, `${coverBg(1024, 1024, rng(9))}
  <circle cx="512" cy="560" r="300" fill="none" stroke="#e2b04a" stroke-width="16" stroke-dasharray="560 80" opacity=".8" transform="rotate(-60 512 560)"/>
  ${sprout(512, 760, 3.2)}
  <text x="512" y="300" text-anchor="middle" ${TITLE_FONT} font-size="230" fill="#5a3410" stroke="#fff3d0" stroke-width="14" paint-order="stroke">重生</text>
  <rect width="1024" height="1024" fill="#fff" filter="url(#grain)" opacity=".35"/>`, { jpg: true });

// ---------- 9. 多命格：每个命格 main_bg / settle_bg / settle_bg_ending / cover ----------
// 需求单见 docs/art/requests-<命格>.md；规则同 ai-image-prompts.md §五：
// 主界面上方 4/5 留空；结算夜景底部有发光轮回象征；结局黎明有终极形象剪影。cover 512×512，不含文字。
{
  const W = 1080, H = 1920;
  const grad = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const glowDot = (x, y, R, c) => `<circle cx="${x}" cy="${y}" r="${R}" fill="${c}" opacity=".4" filter="url(#soft)"/>`;
  const cloud = (x, y, s, c, o = 1) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}" opacity="${o}"><ellipse cx="0" cy="0" rx="90" ry="34"/><ellipse cx="-60" cy="10" rx="60" ry="26"/><ellipse cx="66" cy="8" rx="70" ry="28"/><ellipse cx="10" cy="-24" rx="56" ry="34"/></g>`;
  const grain = `<rect width="100%" height="100%" fill="#fff" filter="url(#grain)" opacity=".45"/>`;
  const hills = (y, amp, color, seed) => { const r = rng(seed); let d = `M0 ${y}`; for (let x = 0; x <= W; x += 120) d += ` Q${x + 60} ${f(y - amp * (0.4 + r()))} ${x + 120} ${f(y - amp * 0.3 * r())}`; return `<path d="${d} V${H} H0Z" fill="${color}"/>`; };
  // 坐着的土狗（立耳、卷尾；原点脚底中心，约 100 高）
  const dog = (x, y, s, c, eye = null) => `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-22 0 L-20 -26 Q-24 -42 -16 -52 L-20 -68 Q-20 -78 -12 -80 L-10 -96 L-2 -82 Q8 -82 10 -72 L20 -66 Q23 -60 14 -57 L4 -57 Q2 -44 8 -36 Q24 -32 28 -16 Q30 -6 26 0Z" fill="${c}"/>
    <path d="M22 -10 Q46 -14 40 -34 Q32 -44 26 -32" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"/>
    ${eye ? `<circle cx="2" cy="-72" r="2.6" fill="${eye}"/>` : ''}</g>`;
  // 站立的神犬剪影（面朝右；原点脚底中心）
  const standDog = (x, y, s, c, flip = false) => `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})" fill="${c}">
    <ellipse cx="0" cy="-42" rx="44" ry="17"/>
    ${[-34, -22, 22, 34].map((lx) => `<rect x="${lx - 4}" y="-44" width="8" height="44" rx="3"/>`).join('')}
    <path d="M28 -50 L44 -76 Q50 -86 62 -82 L78 -76 Q82 -70 74 -67 L60 -65 Q52 -56 44 -38Z"/>
    <path d="M48 -80 L50 -98 L59 -82Z"/>
    <path d="M-42 -48 Q-64 -66 -52 -80 Q-40 -86 -44 -70" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"/></g>`;
  // 老槐树（原点树根）
  const tree = (x, y, s, trunk, leaf, o = 1) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}">
    <path d="M-18 0 Q-10 -60 -22 -120 L-6 -122 Q0 -80 8 -126 L22 -120 Q10 -70 18 0Z" fill="${trunk}"/>
    <g fill="${leaf}"><ellipse cx="0" cy="-160" rx="110" ry="60"/><ellipse cx="-80" cy="-130" rx="60" ry="40"/><ellipse cx="80" cy="-128" rx="64" ry="40"/><ellipse cx="20" cy="-200" rx="70" ry="44"/></g></g>`;
  // 柴垛（原点底部中心）
  const hay = (x, y, s, c, line) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-90 0 Q-80 -70 0 -86 Q80 -70 90 0Z" fill="${c}"/>
    <g stroke="${line}" stroke-width="3" opacity=".6">${[-60, -30, 0, 30, 60].map((dx) => `<line x1="${dx}" y1="-4" x2="${dx * 0.7}" y2="-70"/>`).join('')}</g></g>`;
  const wall = (x, y, w, h, c, line) => `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${c}"/><path d="M${x} ${y - h} h${w}" stroke="${line}" stroke-width="6"/>
    ${Array.from({ length: Math.floor(h / 26) }, (_, i) => `<line x1="${x}" y1="${y - h + 26 * (i + 1)}" x2="${x + w}" y2="${y - h + 26 * (i + 1)}" stroke="${line}" stroke-width="2" opacity=".4"/>`).join('')}`;
  const house = (x, y, w, c, roof) => `<rect x="${x}" y="${y - w * 0.5}" width="${w}" height="${w * 0.5}" fill="${c}"/><path d="M${x - 12} ${y - w * 0.5} L${x + w / 2} ${y - w * 0.85} L${x + w + 12} ${y - w * 0.5}Z" fill="${roof}"/>`;

  // —— 一只土狗 local_dog：北方小山村（麦秸黄 + 土红）——
  job('destiny/local_dog/main_bg', W, H, `${grad('s', [[0, '#fbf1dc'], [0.6, '#f7e2bc'], [1, '#efc993']])}
    <rect width="${W}" height="${H}" fill="url(#s)"/>
    <circle cx="300" cy="380" r="240" fill="#fff6dc" opacity=".55" filter="url(#soft)"/>
    ${hills(1560, 120, '#ead2a8', 11)}${hills(1640, 90, '#e2c08e', 12)}
    ${tree(860, 1760, 1.15, '#7a4a2e', '#9aa85c')}
    ${wall(-10, 1780, 560, 120, '#c98a5a', '#a86a42')}
    <path d="M0 1770 Q540 1740 1080 1780 V1920 H0Z" fill="#d9a86a"/>
    ${hay(620, 1790, 1.1, '#e8c27a', '#b5853e')}
    ${dog(470, 1796, 0.75, '#c98a3a')}
    ${grain}`, { jpg: true });
  job('destiny/local_dog/settle_bg', W, H, `${grad('s', [[0, '#121a35'], [0.6, '#24304f'], [1, '#3e3646']])}
    <rect width="${W}" height="${H}" fill="url(#s)"/>${dust(rng(502), 110, 0, 0, W, 1100, '#fff8e0', 2.2)}
    <circle cx="780" cy="420" r="80" fill="#f6ecd2" opacity=".85"/><circle cx="780" cy="420" r="150" fill="#f6ecd2" opacity=".12" filter="url(#soft)"/>
    ${hills(1560, 110, '#1c2440', 21)}${hills(1650, 80, '#232a44', 22)}
    ${tree(860, 1780, 1.15, '#1a1a28', '#202638')}
    ${wall(-10, 1790, 520, 110, '#2e2a3a', '#3a3448')}
    <path d="M0 1780 Q540 1750 1080 1790 V1920 H0Z" fill="#2a2636"/>
    ${hay(560, 1800, 1.1, '#3a3446', '#4a4258')}
    ${glowDot(540, 1846, 110, '#ffd27a')}
    <ellipse cx="540" cy="1846" rx="46" ry="14" fill="none" stroke="#b5523b" stroke-width="8"/>
    <circle cx="540" cy="1864" r="12" fill="#ffd27a"/><circle cx="540" cy="1864" r="5" fill="#fff6d6"/>
    ${dust(rng(503), 16, 420, 1720, 240, 120, '#ffe9a8', 3)}${grain}`, { jpg: true });
  job('destiny/local_dog/settle_bg_ending', W, H, `${grad('s', [[0, '#fff4da'], [0.5, '#fde0ad'], [1, '#eeb07a']])}
    <rect width="${W}" height="${H}" fill="url(#s)"/>
    <circle cx="380" cy="1180" r="150" fill="#fff6e4" opacity=".9"/><circle cx="380" cy="1180" r="300" fill="#fff6dc" opacity=".4" filter="url(#soft)"/>
    ${cloud(200, 1460, 1.6, '#fff', 0.85)}${cloud(880, 1400, 1.4, '#fff', 0.8)}
    <path d="M520 1540 L640 1330 Q700 1300 760 1340 L860 1540Z" fill="#b5523b"/>
    <path d="M0 1560 Q300 1470 540 1530 T1080 1510 V1920 H0Z" fill="#fff" opacity=".92"/>
    ${cloud(300, 1620, 2.2, '#fff', 0.95)}
    ${[180, 260, 330].map((hx, i) => house(hx, 1800 - i * 6, 70, '#d9a86a', '#b5523b')).join('')}
    ${[200, 290].map((sx) => `<path d="M${sx} 1740 q-14 -30 4 -60 q16 -30 -2 -60" fill="none" stroke="#c9b8a0" stroke-width="5" opacity=".6"/>`).join('')}
    ${standDog(700, 1338, 1.9, '#7a3e22', true)}
    ${dust(rng(504), 30, 400, 1000, 480, 300, '#fff8e0', 3)}${grain}`, { jpg: true });

  // —— 选命格封面 512×512 ——
  const coverBox = (sky, inner) => `${grad('cs', sky)}<rect width="512" height="512" fill="url(#cs)"/>${inner}
    <rect width="512" height="512" fill="#fff" filter="url(#grain)" opacity=".4"/>`;
  job('destiny/desert_grass/cover', 512, 512, coverBox([[0, '#fbe9c4'], [1, '#f1cf96']], `
    <circle cx="380" cy="130" r="70" fill="#fff3c4" opacity=".8" filter="url(#soft)"/><circle cx="380" cy="130" r="36" fill="#fff6dc"/>
    <path d="M0 360 Q140 320 280 350 T512 336 V512 H0Z" fill="#e2b877"/><path d="M0 420 Q170 390 330 412 T512 404 V512 H0Z" fill="#c99556"/>
    ${sprout(256, 420, 1.55)}
    <path d="M318 312 C318 312 306 328 306 336 A12 12 0 0 0 330 336 C330 328 318 312 318 312Z" fill="#bfe6f5" stroke="#fff" stroke-width="2"/>`), { jpg: true });
  job('destiny/local_dog/cover', 512, 512, coverBox([[0, '#2a2f52'], [0.7, '#5a4a5c'], [1, '#8a5a48']], `
    <circle cx="400" cy="110" r="44" fill="#f6ecd2" opacity=".9"/><circle cx="400" cy="110" r="90" fill="#f6ecd2" opacity=".15" filter="url(#soft)"/>
    ${dust(rng(505), 30, 0, 0, 512, 240, '#fff8e0', 1.8)}
    ${tree(110, 400, 0.85, '#3a2a28', '#4a5040')}
    ${hay(400, 420, 1.1, '#a8783e', '#6a4a2a')}
    <path d="M0 400 Q256 380 512 404 V512 H0Z" fill="#7a4a34"/>
    ${dog(236, 444, 1.8, '#f0b45a', '#3a2418')}`), { jpg: true });

  // ---------- 10. 境界形象 stage_{1..5}（512 透明，叠在通用突破光效上）+ 伙伴头像 companion_{id}（256 圆章）----------
  const halo = (c, r = 170) => `<circle cx="256" cy="270" r="${r}" fill="${c}" opacity=".35" filter="url(#soft)"/>`;
  const sparks = (seed, c) => dust(rng(seed), 26, 80, 60, 352, 360, c, 4);
  const stage = (id, lv, body) => job(`destiny/${id}/stage_${lv}`, 512, 512, body);
  const eyes = (x1, x2, y, r = 5, c = '#2a1a10') => `<circle cx="${x1}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x2}" cy="${y}" r="${r}" fill="${c}"/>`;

  // 荒漠一株草
  stage('desert_grass', 1, `${halo('#d6f5a8')}<path d="M96 430 Q256 380 416 430 L416 470 L96 470Z" fill="#d9ad6e"/>
    ${dust(rng(601), 24, 150, 360, 212, 70, '#c99556', 5)}${sprout(256, 420, 2.2)}`);
  stage('desert_grass', 2, `${halo('#c3ec8f')}<ellipse cx="256" cy="440" rx="120" ry="20" fill="#c99556" opacity=".6"/>
    <g stroke-linecap="round" fill="none"><path d="M256 440 Q240 320 200 220" stroke="#5c9a3a" stroke-width="14"/><path d="M256 440 Q262 300 268 170" stroke="#7bb556" stroke-width="16"/><path d="M256 440 Q290 330 336 240" stroke="#6aa844" stroke-width="13"/></g>`);
  stage('desert_grass', 3, `${halo('#f6e08a', 190)}${sparks(603, '#ffe9a8')}
    <path d="M256 450 Q250 320 256 140" stroke="#5c9a3a" stroke-width="14" fill="none" stroke-linecap="round"/>
    <path d="M254 330 C200 300 160 310 140 340 C180 356 220 352 254 330Z M258 260 C312 228 352 236 372 266 C334 284 294 280 258 260Z M256 190 C222 160 196 162 180 182 C206 200 232 202 256 190Z" fill="#7bb556"/>
    <path d="M250 330 Q200 330 150 340 M262 262 Q320 256 364 266 M254 190 Q220 180 186 182" stroke="#ffd27a" stroke-width="4" fill="none"/>`);
  stage('desert_grass', 4, `${halo('#9bd36a', 190)}${sparks(604, '#d6f5a8')}
    <path d="M256 110 C330 200 340 300 300 400 Q256 450 212 400 C172 300 182 200 256 110Z" fill="#6aa844"/>
    <path d="M256 130 V420 M256 220 L210 190 M256 220 L302 190 M256 300 L200 270 M256 300 L312 270" stroke="#4f8a30" stroke-width="5" fill="none"/>
    <path d="M200 300 C150 280 120 300 110 330 C150 330 180 320 200 300Z M312 300 C362 280 392 300 402 330 C362 330 332 320 312 300Z" fill="#7bb556"/>
    ${eyes(232, 280, 240, 9, '#e9ffc2')}<circle cx="232" cy="240" r="16" fill="#e9ffc2" opacity=".35"/><circle cx="280" cy="240" r="16" fill="#e9ffc2" opacity=".35"/>`);
  stage('desert_grass', 5, `${halo('#c3ec8f', 210)}
    <path d="M220 470 Q226 360 212 300 L300 300 Q288 360 296 470Z" fill="#7a4a2e"/>
    <g fill="#6aa844"><ellipse cx="256" cy="200" rx="170" ry="96"/><ellipse cx="140" cy="250" rx="90" ry="60"/><ellipse cx="372" cy="250" rx="92" ry="60"/><ellipse cx="256" cy="120" rx="110" ry="64"/></g>
    <path d="M232 360 q8 -10 16 0 M264 360 q8 -10 16 0" stroke="#3a2418" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M236 400 q20 14 40 0" stroke="#3a2418" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M220 470 Q170 476 140 490 M296 470 Q350 476 380 490" stroke="#7a4a2e" stroke-width="10" fill="none" stroke-linecap="round"/>`);

  // 一只土狗
  stage('local_dog', 1, `${halo('#ffe2a0')}${dog(256, 440, 2.6, '#e0a548', '#2a1a10')}`);
  stage('local_dog', 2, `${halo('#f6ecd2')}<path d="M380 90 A60 60 0 1 0 420 190 A48 48 0 1 1 380 90Z" fill="#f6ecd2"/>
    <g transform="rotate(-18 256 440)">${dog(256, 450, 2.7, '#d99a40', '#fff6d6')}</g>`);
  stage('local_dog', 3, `${halo('#e8e4ff', 200)}${sparks(613, '#eef0ff')}
    <g opacity=".45" filter="url(#soft)">${standDog(256, 430, 3.6, '#e8e4ff')}</g>${standDog(256, 430, 3.2, '#c98a3a')}
    <circle cx="${256 + 64 * 3.2 - 205}" cy="${430 - 76 * 3.2 + 10}" r="7" fill="#eef0ff"/>`);
  stage('local_dog', 4, `${halo('#ffd27a', 200)}<path d="M150 470 L210 360 Q256 340 302 360 L362 470Z" fill="#8a5a3a"/>
    ${standDog(256, 362, 2.4, '#a8642a')}
    <g fill="#5a3a24" opacity=".7"><ellipse cx="96" cy="470" rx="34" ry="14"/><circle cx="74" cy="458" r="10"/><ellipse cx="420" cy="470" rx="34" ry="14"/><circle cx="442" cy="458" r="10"/></g>`);
  stage('local_dog', 5, `${halo('#ffd27a', 220)}${sparks(615, '#fff1b0')}
    <g fill="#fff" opacity=".9"><ellipse cx="256" cy="440" rx="190" ry="36"/><ellipse cx="160" cy="420" rx="90" ry="30"/><ellipse cx="350" cy="424" rx="100" ry="30"/></g>
    <g opacity=".55" filter="url(#glow)">${standDog(256, 420, 3, '#ffb347')}</g>${standDog(256, 420, 2.7, '#e0a548')}
    <path d="M${256 + 76 * 2.7 - 20} ${420 - 72 * 2.7} a18 18 0 1 0 22 22 a14 14 0 1 1 -22 -22Z" fill="#fff6d6"/>`);

  // 伙伴头像：与通用图标同款圆章（深色底 + 金边），角色居中
  const comp = (id, cid, body, accent = '#f3cf7a') => job(`destiny/${id}/companion_${cid}`, 256, 256, `
    <radialGradient id="cb" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#fbf3e1"/><stop offset="1" stop-color="#ecd5a8"/></radialGradient>
    <circle cx="128" cy="128" r="120" fill="url(#cb)"/>${body}
    <circle cx="128" cy="128" r="117" fill="none" stroke="${accent}" stroke-width="7"/><circle cx="128" cy="128" r="106" fill="none" stroke="#b98a3c" stroke-width="1.5" opacity=".5"/>`);
  comp('desert_grass', 'dung_beetle', `<circle cx="170" cy="150" r="42" fill="#8a5a32"/><path d="M146 130 q10 -8 20 0" stroke="#6a4224" stroke-width="3" fill="none"/>
    <ellipse cx="100" cy="150" rx="40" ry="30" fill="#2e2a3a"/><circle cx="66" cy="134" r="16" fill="#2e2a3a"/>${eyes(60, 72, 130, 3, '#fff')}
    <path d="M80 176 l-10 18 M100 180 l0 20 M120 176 l12 18 M110 124 L140 120" stroke="#2e2a3a" stroke-width="5" stroke-linecap="round"/>`);
  comp('desert_grass', 'earthworm', `<rect x="104" y="56" width="48" height="150" rx="24" fill="#e89a9a"/>
    ${[96, 120, 144, 168].map((y) => `<path d="M106 ${y} h44" stroke="#c97676" stroke-width="3"/>`).join('')}
    ${eyes(118, 138, 80, 4)}<path d="M112 70 l10 4 M144 70 l-10 4" stroke="#2a1a10" stroke-width="3" stroke-linecap="round"/>`);
  comp('desert_grass', 'lost_bee', `<ellipse cx="96" cy="118" rx="26" ry="18" fill="#fff" opacity=".85"/><ellipse cx="160" cy="118" rx="26" ry="18" fill="#fff" opacity=".85"/>
    <ellipse cx="128" cy="150" rx="46" ry="38" fill="#f2c24a"/><path d="M104 132 v38 M128 114 v72 M152 132 v38" stroke="#3a2a1a" stroke-width="10"/>
    ${eyes(112, 144, 146, 4, '#fff')}<text x="128" y="96" text-anchor="middle" font-size="44" font-weight="900" fill="#b5523b" font-family="sans-serif">?</text>`);
  comp('desert_grass', 'fox_cub', `<path d="M74 120 L60 40 L110 96Z M182 120 L196 40 L146 96Z" fill="#e8b878"/><path d="M78 108 L70 58 L102 96Z M178 108 L186 58 L154 96Z" fill="#f6d8b0"/>
    <ellipse cx="128" cy="140" rx="58" ry="50" fill="#f0c890"/><ellipse cx="128" cy="164" rx="28" ry="20" fill="#fff4e0"/>
    ${eyes(106, 150, 134, 7)}<circle cx="128" cy="156" r="6" fill="#2a1a10"/>`);
  comp('desert_grass', 'lizard', `<path d="M70 170 Q90 120 140 120 Q190 120 196 92 Q206 120 180 140 Q150 160 110 176 Q90 200 60 196Z" fill="#7bb556"/>
    <circle cx="176" cy="104" r="8" fill="#fff"/><circle cx="178" cy="104" r="4" fill="#2a1a10"/><path d="M166 98 h20" stroke="#4f8a30" stroke-width="5" stroke-linecap="round"/>
    <path d="M100 176 l-8 18 M140 160 l6 20" stroke="#5c9a3a" stroke-width="6" stroke-linecap="round"/>`);
  comp('desert_grass', 'fungus', `<path d="M60 190 Q128 170 196 190 M80 196 Q100 160 128 170 Q160 150 180 196" stroke="#f6f0e0" stroke-width="3" fill="none" opacity=".9"/>
    ${[[96, 150, 26], [150, 128, 34], [186, 164, 20]].map(([x, y, r]) => `<rect x="${x - 6}" y="${y}" width="12" height="${190 - y}" fill="#f6efe0"/><path d="M${x - r} ${y + 4} Q${x} ${y - r} ${x + r} ${y + 4}Z" fill="#e9dcc4" stroke="#c9b48e" stroke-width="2"/>`).join('')}
    <circle cx="150" cy="118" r="40" fill="#fffbe0" opacity=".25" filter="url(#soft)"/>`);

  comp('local_dog', 'flea', `<ellipse cx="128" cy="130" rx="42" ry="32" fill="#7a4a2e"/><circle cx="92" cy="112" r="20" fill="#7a4a2e"/>
    ${eyes(86, 98, 108, 3.5, '#fff')}<path d="M84 120 q8 6 16 0" stroke="#fff" stroke-width="3" fill="none"/>
    <path d="M110 158 l-12 30 M140 160 l30 10 L150 196 M160 150 l24 -8" stroke="#5a3420" stroke-width="6" stroke-linecap="round" fill="none"/>`);
  comp('local_dog', 'sparrow', `<ellipse cx="132" cy="140" rx="56" ry="48" fill="#a8703e"/><ellipse cx="140" cy="160" rx="36" ry="26" fill="#f0dcc0"/>
    <path d="M150 116 Q190 120 200 150 Q170 150 150 140Z" fill="#7a4a2e"/><circle cx="104" cy="122" r="6" fill="#2a1a10"/>
    <path d="M76 126 L52 116 L76 136Z" fill="#e2b04a"/><path d="M76 134 L54 146" stroke="#e2b04a" stroke-width="4"/>`);
  comp('local_dog', 'old_cat', `<path d="M70 110 L76 56 L112 92Z M186 110 L180 56 L144 92Z" fill="#e8c090"/>
    <ellipse cx="128" cy="140" rx="64" ry="54" fill="#f6e8d0"/><path d="M80 112 Q100 96 120 104 L116 140 Q90 140 80 112Z" fill="#c98a3a"/><path d="M150 100 Q178 104 182 130 L156 126Z" fill="#3a2a22"/>
    <path d="M100 138 q10 8 20 0 M136 138 q10 8 20 0" stroke="#2a1a10" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M128 156 l-6 6 h12Z" fill="#c97676"/><path d="M70 150 l-26 -4 M70 160 l-26 4 M186 150 l26 -4 M186 160 l26 4" stroke="#8a7a6a" stroke-width="2"/>`);
  comp('local_dog', 'beggar', `<circle cx="128" cy="120" r="52" fill="#f2cfa4"/><path d="M76 112 Q80 64 128 64 Q176 64 180 112 Q160 88 128 92 Q96 88 76 112Z" fill="#3a2a22"/>
    ${eyes(108, 148, 120, 5)}<path d="M108 144 q20 16 40 0" stroke="#8a3a2a" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M60 220 Q70 176 128 172 Q186 176 196 220Z" fill="#8a7a5a"/><rect x="140" y="186" width="22" height="18" fill="#a8946a"/>
    <path d="M160 180 a26 26 0 0 1 52 0Z" fill="#e8b878" stroke="#b5853e" stroke-width="2"/>`);
  comp('local_dog', 'weasel', `<path d="M96 210 Q90 150 112 110 Q128 84 150 100 Q170 116 160 150 Q150 190 156 210Z" fill="#c98a4a"/>
    <ellipse cx="136" cy="96" rx="30" ry="24" fill="#c98a4a"/><path d="M116 76 l-4 -14 l12 8Z M154 76 l4 -14 l-12 8Z" fill="#c98a4a"/>
    <path d="M122 92 l10 4 M150 92 l-10 4" stroke="#2a1a10" stroke-width="4" stroke-linecap="round"/><circle cx="136" cy="108" r="4" fill="#2a1a10"/>
    <ellipse cx="136" cy="146" rx="14" ry="12" fill="#f0dcc0"/><path d="M122 140 L136 152 L150 140" stroke="#a8642a" stroke-width="4" fill="none"/>`);
  comp('local_dog', 'locust_tree', `<g fill="#8aa85c"><ellipse cx="128" cy="86" rx="80" ry="44"/><ellipse cx="70" cy="110" rx="40" ry="28"/><ellipse cx="186" cy="110" rx="40" ry="28"/></g>
    <path d="M90 230 Q100 170 92 120 L164 120 Q156 170 166 230Z" fill="#7a4a2e"/>
    <path d="M110 150 q8 -6 16 0 M134 150 q8 -6 16 0" stroke="#3a2418" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M112 176 q16 12 32 0" stroke="#3a2418" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M108 190 Q128 214 148 190" stroke="#e9dcc4" stroke-width="4" fill="none"/>`);
}

// 锁定图标（选命格界面未解锁时叠加）
job('common/icon/lock', 128, 128, `
  <circle cx="64" cy="64" r="58" fill="#3a2a1e" opacity=".85"/>
  <path d="M44 58 V46 A20 20 0 0 1 84 46 V58" fill="none" stroke="#f3cf7a" stroke-width="9" stroke-linecap="round"/>
  <rect x="36" y="56" width="56" height="42" rx="10" fill="#f3cf7a"/><circle cx="64" cy="74" r="6" fill="#3a2a1e"/><rect x="61" y="76" width="6" height="12" rx="3" fill="#3a2a1e"/>`);

run();
