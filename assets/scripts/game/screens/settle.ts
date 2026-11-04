/** 轮回结算页（布局对照 docs/filing/mock/5-settle.html） */
import { Node } from 'cc';
import { SettleResult, tiandao } from '../../core';
import { CONFIG, TEX } from '../config';
import type { Game } from '../game';
import { Platform } from '../platform';
import { box, button, chip, COLOR, fadeIn, image, onTap, rect, sizeOf, text, textHeight } from '../ui/kit';
import { showInfo, showList } from './popups';
import { GAME_NAME } from './splash';
import { danmaku } from '../ui/danmaku';
import { brandTitle, encodeShare, rarityOf } from '../brag';

/** settle_panel.png 的九宫格（贴图像素：上 右 下 左）与显示缩放 */
const PANEL_SLICE: [number, number, number, number] = [350, 280, 360, 280];
const PANEL_SLICE_SCALE = 0.36;

export function showSettle(g: Game): void {
    const e = g.engine;
    const s = e.settle();
    const isEnd = s.kind === 'ending';
    const root = box(g.screen, 0, 0, g.W, g.H, 'settle');
    rect(root, { fill: isEnd ? '#e9cf98' : COLOR.night });
    image(root, isEnd ? TEX.settleBgEnding : TEX.settleBg, 0, 0, g.W, g.H, { cover: true });
    fadeIn(root, 0.3);

    const light = isEnd ? COLOR.ochreD : COLOR.cream;
    const head = s.tianhu ? '✦ 天 胡 ✦' : isEnd ? '这 一 世 圆 满 了' : '这 一 世 结 束 了';
    text(root, head, 0, CONFIG.safeTop - (s.tianhu ? 46 : 40), g.W, { size: s.tianhu ? 48 : 40, color: s.tianhu ? COLOR.legacy : light, align: 'center', bold: true });
    text(root, `${e.data.meta.name} · 轮回结算`, 0, CONFIG.safeTop + (s.tianhu ? 22 : 14), g.W, { size: 24, color: light, alpha: 200, align: 'center' });
    // 回主菜单前也要走完遗物封存，避免白白丢掉本世遗物
    const menu = chip(root, '‹ 菜单', 30, CONFIG.safeTop + 22, light, false, 22);
    onTap(menu, () => sealThenRebirth(g, s, 'menu'));
    const bio = chip(root, '生平 ›', 0, CONFIG.safeTop + 22, light, false, 22);
    bio.setPosition(g.W - 30 - sizeOf(bio).w, -(CONFIG.safeTop + 22), 0);
    onTap(bio, () => showBio(g, s));

    let y = stone(g, root, s, CONFIG.safeTop + 70);
    y = panel(g, root, s, y + 20);
    actions(g, root, s, Math.max(y + 24, g.H - 330));
    if (isEnd) danmaku(g, e.danmaku(s.tianhu ? 'tianhu' : 'ending'));
}

/** 墓志铭石板（分享卡主体） */
function stone(g: Game, root: Node, s: SettleResult, y: number): number {
    const w = g.W - 60;
    // 结局卡（ending_card）边框花饰更宽、顶部有叶形徽记：内容整体内缩，避免压在花边上
    const P = s.kind === 'ending' ? 22 : 0;
    const ix = 214 + P, iw = w - ix - 28 - P;
    // 墓志铭较长（结局文案常 3 行）时石板加高，避免压到底部足迹行
    const h = Math.max(300, 132 + P + textHeight(s.epitaph, iw, 28, 44) + 84 + P);
    const n = box(root, 30, y, w, h, 'stone');
    rect(n, { fill: '#e6d3ad', stroke: '#b89a6a', lineWidth: 2, radius: 22, shadow: '#00000055', shadowOffset: 10 });
    // 命格版优先、回落通用版；比例不合（如竖版图）会自动跳过，改用画出来的石板
    image(n, s.kind === 'ending' ? TEX.endingCard : TEX.epitaphCard, 0, 0, w, h, { maxAspectDiff: 0.5 });

    const pic = box(n, 28 + P, 28 + P, 160, 160, 'pic');
    rect(pic, { fill: '#f8efdb', stroke: '#c9ad7d', radius: 16 });
    text(pic, s.title.slice(0, 1), 0, 0, 160, { size: 80, color: COLOR.ochre, align: 'center', valign: 'center', bold: true }, 160);
    if (s.kind === 'death') {
        const icon = g.engine.data.deaths.get(s.id)?.icon;
        if (icon) image(pic, TEX.icon('death', icon), 10, 10, 140, 140);
    }

    text(n, `第 ${s.life} 世 · ${s.stageName}`, ix, 30 + P, iw, { size: 24, color: COLOR.ink2 });
    text(n, s.title, ix, 66 + P, iw, { size: 40, color: COLOR.ochreD, bold: true }, 56);
    if (s.firstTime) chip(n, '首次', w - 28 - 70 - P, 76 + P, COLOR.bad, true, 20);
    if (s.tianhu) tianhuSeal(pic);
    text(n, s.epitaph, ix, 132 + P, iw, { size: 28, wrap: true, lineHeight: 44 });

    const meta = s.explore.map(x => `${x.name.slice(-2)} · ${x.layer || '—'}`).join('    ');
    rect(box(n, 28 + P, h - 70 - P, w - 56 - 2 * P, 2, 'line'), { fill: '#7a4a1f', fillAlpha: 70 });
    text(n, meta, 28 + P, h - 56 - P, w - 56 - 2 * P, { size: 22, color: COLOR.ink2, align: 'center' });
    return y + h;
}

/** 收获面板：传承 / 技能 / 轮回点明细 / 图鉴 / 下一世目标 */
function panel(g: Game, root: Node, s: SettleResult, y: number): number {
    const w = g.W - 40;
    const innerX = 70, innerW = w - innerX * 2;
    const rows: { kind: 'sec' | 'line' | 'goal'; l: string; r?: string; color?: string; rColor?: string }[] = [];
    // 好友挑战、稀有度、天道评语、本世恩怨放最前（面板放不下时从末尾截断）
    const vs = versus(g, s);
    if (vs) {
        rows.push({ kind: 'sec', l: '好友挑战' });
        rows.push({ kind: 'goal', l: vs.line, color: vs.win ? COLOR.good : COLOR.bad });
    }
    const rar = rarityOf(g.rarity, g.data.meta.id, s.kind, s.id);
    if (rar && rar.tier !== '常见') rows.push({ kind: 'goal', l: `【${rar.tier}】${rar.text}`, color: COLOR[rar.color] });
    if (s.remark) rows.push({ kind: 'goal', l: tiandao(s.remark), color: COLOR.ochreD });
    if (s.feuds.length) {
        rows.push({ kind: 'sec', l: '本世恩怨' });
        for (const f of s.feuds) rows.push({ kind: 'goal', l: `✓ ${f}`, color: COLOR.bad });
    }
    rows.push({ kind: 'sec', l: '轮回收获' });
    if (s.legacy) {
        const desc = g.engine.data.legacies.get(s.legacy.id)?.desc ?? '';
        rows.push({ kind: 'line', l: `传承 · ${s.legacy.name}`, r: `Lv${s.legacy.level}/${s.legacy.max}${s.legacy.isNew ? '' : ' 满级'}`, rColor: COLOR.good });
        rows.push({ kind: 'goal', l: desc, color: COLOR.ink2 });
    }
    if (s.skill) rows.push({ kind: 'line', l: `领悟技能 · ${s.skill.name}`, r: '已加入技能图鉴', rColor: COLOR.skill });
    const learnedAlive = s.learned.filter(x => x.id !== s.skill?.id);
    if (learnedAlive.length) rows.push({ kind: 'line', l: `本世领悟 · ${learnedAlive.map(x => x.name).join('、')}`, rColor: COLOR.skill });
    for (const b of s.breakdown) rows.push({ kind: 'line', l: b.label, r: `+${b.value}` });
    rows.push({ kind: 'line', l: '轮回点', r: `+${s.points}  累计 ${g.save.profile.points}`, color: COLOR.ink, rColor: COLOR.legacy });
    rows.push({ kind: 'sec', l: '图鉴' });
    const c = s.codex;
    rows.push({ kind: 'line', l: `死法 ${c.deaths[0]}/${c.deaths[1]}  技能 ${c.skills[0]}/${c.skills[1]}  道具 ${c.items[0]}/${c.items[1]}  结局 ${c.endings[0]}/${c.endings[1]}` });
    if (s.goals.length) {
        rows.push({ kind: 'sec', l: '下一世的目标' });
        for (const goal of s.goals) {
            rows.push(goal.ready
                ? { kind: 'goal', l: `· 「${goal.text}」下一世可选！（${goal.lock}）`, color: COLOR.good }
                : { kind: 'goal', l: `· 「${goal.text}」需要 ${goal.lock}`, color: COLOR.ink2 });
        }
    }

    const rowH = (r: typeof rows[number]) => r.kind === 'sec' ? 52 : r.kind === 'goal' ? textHeight(r.l, innerW, 22, 34) + 4 : 40;
    const contentH = rows.reduce((n, r) => n + rowH(r), 0);
    const maxH = g.H - y - 360;
    const h = Math.min(contentH + 110, Math.max(maxH, 360));
    const n = box(root, 20, y, w, h, 'panel');
    rect(n, { fill: COLOR.paper, stroke: COLOR.paperEdge, lineWidth: 2, radius: 24, shadow: '#00000055', shadowOffset: 10 });
    image(n, TEX.settlePanel, 0, 0, w, h, { slice: PANEL_SLICE, sliceScale: PANEL_SLICE_SCALE });

    let cy = 50;
    for (const r of rows) {
        if (cy + rowH(r) > h - 40) break;
        if (r.kind === 'sec') {
            text(n, r.l, innerX, cy + 8, innerW, { size: 26, color: COLOR.ochreD, bold: true });
            rect(box(n, innerX + 130, cy + 26, innerW - 130, 2, 'rule'), { fill: COLOR.ochreD, fillAlpha: 60 });
        } else if (r.kind === 'goal') {
            text(n, r.l, innerX, cy, innerW, { size: 22, color: r.color ?? COLOR.ink2, wrap: true, lineHeight: 34 });
        } else {
            text(n, r.l, innerX, cy, innerW - (r.r ? 220 : 0), { size: 24, color: r.color ?? COLOR.ink2 });
            if (r.r) text(n, r.r, innerX + innerW - 300, cy, 300, { size: 24, color: r.rColor ?? COLOR.ink, align: 'right' });
        }
        cy += rowH(r);
    }
    return y + h;
}

/** 生平：最终属性、职业、故事线、生平大事 */
function showBio(g: Game, s: SettleResult): void {
    const e = g.engine;
    const careers = (e.run.careers ?? []).map(id => e.data.careers.get(id)?.name ?? id);
    const lines = e.lineViews();
    showInfo(g, `第 ${s.life} 世 · 生平`, [
        s.attrs.map(a => `${a.name} ${a.value}`).join('　'),
        ...(careers.length ? [`干过：${careers.join(' → ')}`] : []),
        ...(lines.length ? ['', '【这一世的故事】', ...lines.map(l => `· ${l.name}${l.state ? `：${l.state}` : ''}`)] : []),
        ...(s.log.length ? ['', '【生平大事】', ...s.log] : []),
    ]);
}

/** 天胡金印：盖在石板左上的图上 */
function tianhuSeal(pic: Node): void {
    const seal = box(pic, 84, 96, 84, 84, 'tianhu');
    rect(seal, { fill: COLOR.legend, stroke: '#ffffff', lineWidth: 4, radius: 42, shadow: '#00000044', shadowOffset: 4 });
    text(seal, '天胡', 0, 0, 84, { size: 28, color: COLOR.white, align: 'center', valign: 'center', bold: true }, 84);
}

/** 分享文案：称号 + 稀有度 + 一句挑衅；接了好友挑战的带上胜负 */
function shareText(g: Game, s: SettleResult): string {
    const brand = brandTitle(g.data.meta.name, s.life, s.kind, s.title);
    const rar = rarityOf(g.rarity, g.data.meta.id, s.kind, s.id);
    const tail = rar && rar.tier !== '常见' ? `（${rar.tier}，${rar.text.split('：')[1]}）` : '';
    const vs = versus(g, s);
    if (vs?.win) return `我接了好友的挑战，${vs.short}！${brand}。不服来比？`;
    if (s.tianhu) return `天胡！${brand}${tail}`;
    if (s.kind === 'ending') return `${brand}${tail}，你能更快吗？`;
    return `${brand}${tail}。你会死得更离谱吗？`;
}

/** 好友挑战对比：仅当本世是接挑战的那个命格、且还没对比过 */
function versus(g: Game, s: SettleResult): { line: string; win: boolean; short: string } | null {
    const c = g.save.challenge;
    if (!c || c.d !== g.data.meta.id || (c.done && c.at !== s.life)) return null;
    const def = c.k === 'ending' ? g.data.endings.get(c.id) : g.data.deaths.get(c.id);
    if (!def) return null;
    const them = c.k === 'ending' ? `TA 第 ${c.l} 世成了「${def.name}」` : `TA 第 ${c.l} 世${def.name}`;
    let verdict: string;
    let win = false;
    if (s.kind === 'ending' && (c.k === 'death' || s.life <= c.l)) {
        win = true;
        verdict = c.k === 'ending' ? `你只用了 ${s.life} 世，赢了！` : '你修成了正果，赢了！';
    } else if (s.kind === c.k && s.id === c.id) verdict = '你们掉进了同一个坑。';
    else if (s.kind === 'ending') verdict = `你用了 ${s.life} 世，比 TA 慢了一点。`;
    else verdict = c.k === 'ending' ? '这一世没追上，下一世再来。' : '各有各的命。';
    return { line: `${them}；${verdict}`, win, short: c.k === 'ending' ? `只用 ${s.life} 世就比 TA 快` : '比 TA 活得更明白' };
}

/** 分享图：优先现画本世的墓志铭卡，失败时用命格静态分享图 */
function shareImage(g: Game, s: SettleResult): string {
    const rar = rarityOf(g.rarity, g.data.meta.id, s.kind, s.id);
    return Platform.renderShareCard({
        game: GAME_NAME, destiny: g.data.meta.name, life: s.life, kind: s.kind, tianhu: s.tianhu,
        title: s.title, epitaph: s.epitaph, stageName: s.stageName, seasons: s.seasons, feuds: s.feuds,
        rarity: rar ? { tier: rar.tier, text: rar.text } : undefined,
    }) ?? TEX.share(g.data.meta.id);
}

function actions(g: Game, root: Node, s: SettleResult, y: number): void {
    const w = g.W - 60;
    let cy = y;
    if (CONFIG.adsEnabled) {
        const dbl = button(root, 30, cy, w, {
            label: '看视频 · 轮回点翻倍', style: 'ad', size: 30,
            onClick: async () => {
                if (await g.doublePointsByAd()) {
                    dbl.destroy();
                    Platform.toast(`轮回点翻倍！本世 +${s.points}`);
                }
            },
        });
        cy += sizeOf(dbl).h + 16;
    }
    const half = (w - 16) / 2;
    button(root, 30, cy, half, {
        label: '分享墓志铭', style: 'ghost', size: 28, align: 'center',
        onClick: () => {
            Platform.report('share_life', { kind: s.kind, cause: s.id });
            Platform.share(shareText(g, s), encodeShare({ d: g.data.meta.id, l: s.life, k: s.kind, id: s.id, t: s.tianhu }), shareImage(g, s));
        },
    });
    button(root, 30 + half + 16, cy, half, {
        label: '再次重生', style: 'primary', size: 30,
        onClick: () => sealThenRebirth(g, s),
    });
}

/** 有可封存的遗物时逐格挑选（命盘·藏宝可多封存），再回到轮回殿 */
function sealThenRebirth(g: Game, s: SettleResult, then: 'draft' | 'menu' = 'draft'): void {
    const chosen: string[] = [];
    const finish = () => {
        g.engine.sealRelics(chosen);
        g.persist();
        if (then === 'menu') g.goMenu();
        else g.goDraft();
    };
    const ask = () => {
        const left = s.relicCandidates.filter(id => !chosen.includes(id));
        if (!left.length || chosen.length >= s.relicSlots) return finish();
        let picked = false;
        showList(g, `封存遗物（${chosen.length + 1}/${s.relicSlots}）`, left.map(id => {
            const def = g.engine.data.items.get(id)!;
            return {
                title: def.name, desc: def.desc, tag: { text: '封存', color: COLOR.legacy },
                onPick: () => { picked = true; chosen.push(id); ask(); },
            };
        }), {
            closeText: chosen.length ? '就带这些' : '什么都不带',
            onClose: () => { if (!picked) finish(); },
        });
    };
    ask();
}
