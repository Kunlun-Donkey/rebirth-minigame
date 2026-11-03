/**
 * 图鉴墙（主菜单进入）：当前命格的 结局 / 死法 / 跨命格彩蛋 / 恩怨，两列卡片墙，未收集的显示「？？？」剪影。
 * 彩蛋没解锁时提示「与某命格有关」，引导去玩别的命格。
 */
import { Node } from 'cc';
import { CodexView } from '../../core';
import { CONFIG, TEX } from '../config';
import type { Game } from '../game';
import { box, chip, COLOR, fadeIn, image, onTap, rect, sizeOf, text, textHeight } from '../ui/kit';

type Tab = 'endings' | 'deaths' | 'cameos' | 'feuds';
const TABS: { id: Tab; name: string }[] = [
    { id: 'endings', name: '结局' },
    { id: 'deaths', name: '死法' },
    { id: 'cameos', name: '彩蛋' },
    { id: 'feuds', name: '恩怨' },
];
const CARD_H = 176;
const GAP = 16;

interface Cell { title: string; body: string; foot?: string; got: boolean; color: string }

export function showCodex(g: Game, tab: Tab = 'endings', page = 0): void {
    const e = g.engine;
    const v = e.codexView();
    const root = box(g.screen, 0, 0, g.W, g.H, 'codex');
    rect(root, { fill: COLOR.bg });
    image(root, TEX.mainBg, 0, 0, g.W, g.H, { cover: true });
    fadeIn(root, 0.12);

    text(root, '图  鉴', 0, CONFIG.safeTop + 10, g.W, { size: 52, color: COLOR.ochreD, align: 'center', bold: true });
    onTap(chip(root, '‹ 返回', 30, CONFIG.safeTop + 22, COLOR.ochreD, false, 22), () => g.goMenu());
    const n = (list: { got: boolean }[]) => `${list.filter(x => x.got).length}/${list.length}`;
    const sum = `${e.data.meta.name} · 结局 ${n(v.endings)} · 死法 ${n(v.deaths)} · 彩蛋 ${n(v.cameos)}${v.tianhu ? ` · 天胡 ${v.tianhu} 次` : ''}`;
    text(root, sum, 0, CONFIG.safeTop + 90, g.W, { size: 24, color: COLOR.ink2, align: 'center' });

    // 页签
    const ty = CONFIG.safeTop + 140;
    const tabW = (g.W - 60 - 12 * (TABS.length - 1)) / TABS.length;
    TABS.forEach((t, i) => {
        const on = t.id === tab;
        const list = v[t.id] as { got: boolean }[];
        const b = box(root, 30 + i * (tabW + 12), ty, tabW, 56, `tab_${t.id}`);
        rect(b, on ? { fill: COLOR.ochreD, radius: 28 } : { fill: COLOR.btn, fillAlpha: 200, stroke: COLOR.btnEdge, strokeAlpha: 120, radius: 28 });
        text(b, `${t.name} ${n(list)}`, 0, 0, tabW, { size: 24, color: on ? COLOR.white : COLOR.ochreD, align: 'center', valign: 'center', bold: on }, 56);
        if (!on) onTap(b, () => { g.reset(); showCodex(g, t.id, 0); });
    });

    // 卡片墙：两列，按可用高度分页
    const cells = toCells(g, v, tab);
    const top = ty + 80;
    const bottom = g.H - 110;
    const rows = Math.max(1, Math.floor((bottom - top + GAP) / (CARD_H + GAP)));
    const per = rows * 2;
    const pages = Math.max(1, Math.ceil(cells.length / per));
    const p = Math.min(page, pages - 1);
    const cw = (g.W - 60 - GAP) / 2;
    cells.slice(p * per, p * per + per).forEach((c, i) => {
        cell(root, c, 30 + (i % 2) * (cw + GAP), top + Math.floor(i / 2) * (CARD_H + GAP), cw);
    });
    if (!cells.length) text(root, '这里还空着。', 0, top + 40, g.W, { size: 28, color: COLOR.ink2, align: 'center' });

    // 翻页
    if (pages > 1) {
        const py = g.H - 90;
        text(root, `${p + 1} / ${pages}`, 0, py + 6, g.W, { size: 26, color: COLOR.ink2, align: 'center' }, 40);
        if (p > 0) onTap(chip(root, '‹ 上一页', 40, py, COLOR.ochreD, false, 26), () => { g.reset(); showCodex(g, tab, p - 1); });
        if (p + 1 < pages) {
            const nx = chip(root, '下一页 ›', 0, py, COLOR.ochreD, false, 26);
            nx.setPosition(g.W - 40 - sizeOf(nx).w, -py, 0);
            onTap(nx, () => { g.reset(); showCodex(g, tab, p + 1); });
        }
    }
}

function toCells(g: Game, v: CodexView, tab: Tab): Cell[] {
    const destinyName = (id: string) => g.index.destinies.find(d => d.id === id)?.name ?? id;
    switch (tab) {
        case 'endings':
            return v.endings.map(x => x.got
                ? { title: x.name, body: x.epitaph, got: true, color: COLOR.legacy }
                : { title: '？？？', body: '还没有走到这一步。', got: false, color: COLOR.ink2 });
        case 'deaths':
            return v.deaths.map(x => x.got
                ? { title: x.name, body: x.epitaph, foot: [x.count ? `死过 ${x.count} 次` : '', x.legacy ? `传承·${x.legacy}` : ''].filter(Boolean).join(' · '), got: true, color: COLOR.bad }
                : { title: '？？？', body: '这种死法，你还没试过。', got: false, color: COLOR.ink2 });
        case 'cameos':
            return v.cameos.map(x => x.got
                ? { title: '◈ 似曾相识', body: x.text, got: true, color: COLOR.skill }
                : { title: '？？？', body: x.hint.length ? `和「${x.hint.map(destinyName).join('」「')}」有关` : '某一世的你，会在这里出现。', got: false, color: COLOR.ink2 });
        case 'feuds':
            return v.feuds.map(x => x.got
                ? { title: '✓ 恩怨了结', body: x.text, got: true, color: COLOR.bad }
                : { title: '？？？', body: '还有一笔账没算。', got: false, color: COLOR.ink2 });
    }
}

function cell(parent: Node, c: Cell, x: number, y: number, w: number): void {
    const n = box(parent, x, y, w, CARD_H, 'cell');
    rect(n, c.got
        ? { fill: COLOR.paper, stroke: c.color, strokeAlpha: 200, lineWidth: 3, radius: 18, shadow: COLOR.btnShadow, shadowOffset: 6 }
        : { fill: COLOR.ink, fillAlpha: 40, stroke: COLOR.ink2, strokeAlpha: 80, lineWidth: 2, radius: 18 });
    text(n, c.title, 18, 16, w - 36, { size: 28, color: c.got ? c.color : COLOR.ink2, bold: true });
    const bodyH = CARD_H - 70 - (c.foot ? 34 : 12);
    text(n, fit(c.body, w - 36, 22, 32, bodyH), 18, 62, w - 36, { size: 22, color: c.got ? COLOR.ink : COLOR.ink2, wrap: true, lineHeight: 32 }, bodyH);
    if (c.foot) text(n, c.foot, 18, CARD_H - 42, w - 36, { size: 20, color: COLOR.ochre });
}

/** 文字超出高度时截断加省略号 */
function fit(s: string, w: number, size: number, lh: number, h: number): string {
    if (textHeight(s, w, size, lh) <= h) return s;
    let t = s;
    while (t.length > 1 && textHeight(`${t}…`, w, size, lh) > h) t = t.slice(0, -1);
    return `${t}…`;
}
