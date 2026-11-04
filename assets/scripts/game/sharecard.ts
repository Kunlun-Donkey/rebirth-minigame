/**
 * 动态墓志铭分享卡：用 2D Canvas 现画一张 5:4 的卡（微信分享卡比例），内容是这一世的结局。
 * 只用标准 Canvas 2D API（不依赖 cc），微信里用 wx.createCanvas()，测试/预览时用浏览器 canvas。
 */

export interface ShareCardData {
    /** 游戏名 */
    game: string;
    /** 命格名，如「一条鳄鱼」 */
    destiny: string;
    life: number;
    kind: 'death' | 'ending';
    tianhu?: boolean;
    /** 死法 / 结局名 */
    title: string;
    epitaph: string;
    stageName: string;
    seasons: number;
    /** 本世恩怨（最多显示 2 条） */
    feuds: string[];
    /** 稀有度：标签（传说/史诗/稀有/常见）与一句话 */
    rarity?: { tier: string; text: string };
}

export const CARD_W = 1000;
export const CARD_H = 800;

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';

type Ctx = CanvasRenderingContext2D;

/** 按宽度折行（中文逐字；行首不放标点） */
function wrap(ctx: Ctx, s: string, w: number, maxLines: number): string[] {
    const lines: string[] = [];
    let cur = '';
    for (const ch of s) {
        if (ctx.measureText(cur + ch).width > w && cur && !'，。、！？：；）」』…—'.includes(ch)) {
            lines.push(cur);
            cur = ch;
        } else cur += ch;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
        lines.length = maxLines;
        lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
    }
    return lines;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

export function drawShareCard(ctx: Ctx, d: ShareCardData): void {
    const W = CARD_W, H = CARD_H;
    const end = d.kind === 'ending';
    const gold = d.tianhu;
    // 配色：寿终/死亡 = 夜色墓碑；结局 = 暖金纸；天胡 = 金上加金
    const bg = end ? (gold ? '#f3d27a' : '#efdcae') : '#1b2238';
    const paper = end ? '#fbf3df' : '#f6ecd2';
    const ink = '#3b2a1a';
    const accent = gold ? '#c0392b' : end ? '#b5793a' : '#7a4a1f';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // 背景斜纹
    ctx.save();
    ctx.globalAlpha = end ? 0.12 : 0.08;
    ctx.strokeStyle = end ? '#7a4a1f' : '#ffffff';
    ctx.lineWidth = 2;
    for (let x = -H; x < W; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + H, 0);
        ctx.stroke();
    }
    ctx.restore();

    // 石板
    const px = 50, py = 46, pw = W - 100, ph = H - 92;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, px, py, pw, ph, 36);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, px + 14, py + 14, pw - 28, ph - 28, 26);
    ctx.lineWidth = 4;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const ix = px + 60, iw = pw - 120;
    ctx.textBaseline = 'top';

    // 顶行：命格 · 第 N 世
    ctx.fillStyle = accent;
    ctx.font = `bold 34px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${d.destiny} · 第 ${d.life} 世`, ix, py + 56);
    const rareTag = d.rarity && d.rarity.tier !== '常见' ? d.rarity.tier : '';
    if (gold || end || rareTag) {
        const tag = gold ? '天 胡' : rareTag || '圆 满';
        ctx.font = `bold 30px ${FONT}`;
        const tw = ctx.measureText(tag).width + 40;
        roundRect(ctx, ix + iw - tw, py + 50, tw, 50, 25);
        ctx.fillStyle = gold ? '#c0392b' : rareTag === '传说' ? '#d68a00' : rareTag === '史诗' ? '#8e44ad' : rareTag ? '#2e7dbf' : '#3c8a2a';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(tag, ix + iw - tw / 2, py + 58);
        ctx.textAlign = 'left';
    }

    // 大标题：死法 / 结局名
    ctx.fillStyle = ink;
    ctx.font = `bold 76px ${FONT}`;
    const title = wrap(ctx, d.title, iw, 1)[0];
    ctx.fillText(title, ix, py + 128);

    // 分隔线
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(ix, py + 232, iw, 3);
    ctx.globalAlpha = 1;

    // 墓志铭
    ctx.fillStyle = ink;
    ctx.font = `40px ${FONT}`;
    let y = py + 262;
    const feuds = d.feuds.slice(0, 2);
    // 墓志铭能用的行数 = 恩怨行与稀有度行之外剩下的高度（墓志铭末尾常带这一世的高光，尽量放全）
    const bottom = py + ph - 86 - (d.rarity ? 52 : 0) - 10;
    const room = bottom - y - (feuds.length ? 10 + feuds.length * 46 : 0);
    const epiLines = wrap(ctx, d.epitaph, iw, Math.max(2, Math.floor(room / 58)));
    for (const l of epiLines) {
        ctx.fillText(l, ix, y);
        y += 58;
    }

    // 本世恩怨
    if (feuds.length) {
        y += 10;
        ctx.font = `bold 32px ${FONT}`;
        ctx.fillStyle = '#c0392b';
        for (const f of feuds) {
            ctx.fillText(wrap(ctx, `✓ ${f}`, iw, 1)[0], ix, y);
            y += 46;
        }
    }

    // 底栏：境界 · 享年 ｜ 游戏名
    const by = py + ph - 86;
    if (d.rarity) {
        ctx.fillStyle = accent;
        ctx.font = `bold 30px ${FONT}`;
        ctx.fillText(wrap(ctx, d.rarity.text, iw, 1)[0], ix, by - 52);
    }
    ctx.fillStyle = '#6b5136';
    ctx.font = `30px ${FONT}`;
    ctx.fillText(`${d.stageName} · ${end ? '历' : '享年'} ${d.seasons} 季`, ix, by);
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillText(`《${d.game}》`, ix + iw, by);
    ctx.textAlign = 'left';
}
