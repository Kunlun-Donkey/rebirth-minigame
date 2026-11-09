/**
 * 图鉴墙（主菜单进入）：当前命格的 结局 / 死法 / 故事线 / 技能 / 道具 / 跨命格彩蛋 / 恩怨，两列卡片墙，未收集的显示「？？？」剪影。
 * 页签按命格数据生成：没有内容的页签（如没有故事线的命格）不显示。
 * 彩蛋没解锁时提示「与某命格有关」，引导去玩别的命格；技能没领悟时显示领悟提示；故事线点开看走到过的状态。
 */
import { Node } from 'cc';
import { CodexView } from '../../core';
import { CONFIG, TEX } from '../config';
import type { Game } from '../game';
import { box, chip, clampText, COLOR, fadeIn, image, onTap, rect, sizeOf, text } from '../ui/kit';
import { showInfo } from './popups';

type Tab = 'endings' | 'deaths' | 'lines' | 'skills' | 'items' | 'cameos' | 'feuds';
const TABS: { id: Tab; name: string }[] = [
    { id: 'endings', name: '结局' },
    { id: 'deaths', name: '死法' },
    { id: 'lines', name: '故事' },
    { id: 'skills', name: '技能' },
    { id: 'items', name: '道具' },
    { id: 'cameos', name: '彩蛋' },
    { id: 'feuds', name: '恩怨' },
];
const CARD_H = 176;
const GAP = 16;

interface Cell { title: string; body: string; foot?: string; got: boolean; color: string; onTap?: () => void }

export function showCodex(g: Game, tab: Tab = 'endings', page = 0): void {
    const e = g.engine;
    const v = e.codexView();
    const root = box(g.screen, 0, 0, g.W, g.H, 'codex');
    rect(root, { fill: COLOR.bg });
    image(root, TEX.mainBg, 0, 0, g.W, g.H, { cover: true });
    fadeIn(root, 0.12);

    text(root, '图  鉴', 0, CONFIG.safeTop + 10, g.W, { size: 52, color: COLOR.ochreD, align: 'center', bold: true });
    onTap(chip(root, '‹ 返回', 30, CONFIG.safeTop + 22, COLOR.ochreD, false, 22), () => g.goMenu());
    const tabs = TABS.filter(t => t.id === 'endings' || t.id === 'deaths' || v[t.id].length);
    const all = tabs.map(t => v[t.id] as { got: boolean }[]);
    const got = all.reduce((n, l) => n + l.filter(x => x.got).length, 0);
    const total = all.reduce((n, l) => n + l.length, 0);
    const sum = `${e.data.meta.name} · 已收集 ${got}/${total}${v.tianhu ? ` · 天胡 ${v.tianhu} 次` : ''}`;
    text(root, sum, 0, CONFIG.safeTop + 90, g.W, { size: 24, color: COLOR.ink2, align: 'center' });

    // 页签：名字 + 收集数两行，页签多时也放得下
    const ty = CONFIG.safeTop + 136;
    const TAB_H = 82;
    const tg = tabs.length > 5 ? 8 : 12;
    const tabW = (g.W - 60 - tg * (tabs.length - 1)) / tabs.length;
    tabs.forEach((t, i) => {
        const on = t.id === tab;
        const list = v[t.id] as { got: boolean }[];
        const b = box(root, 30 + i * (tabW + tg), ty, tabW, TAB_H, `tab_${t.id}`);
        rect(b, on ? { fill: COLOR.ochreD, radius: 18 } : { fill: COLOR.btn, fillAlpha: 200, stroke: COLOR.btnEdge, strokeAlpha: 120, radius: 18 });
        text(b, t.name, 0, 6, tabW, { size: 24, color: on ? COLOR.white : COLOR.ochreD, align: 'center', bold: on, lineHeight: 34 });
        text(b, `${list.filter(x => x.got).length}/${list.length}`, 0, 44, tabW, { size: 18, color: on ? COLOR.white : COLOR.ink2, align: 'center', lineHeight: 26 });
        if (!on) onTap(b, () => { g.reset(); showCodex(g, t.id, 0); });
    });

    // 卡片墙：两列，按可用高度分页
    const cells = toCells(g, v, tab);
    const top = ty + TAB_H + 20;
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
        // 垫一条纸色底：底部常是深色地面，直接放字看不清
        rect(box(root, 30, py - 8, g.W - 60, 56, 'pager'), { fill: COLOR.paper, fillAlpha: 215, radius: 28 });
        text(root, `${p + 1} / ${pages}`, 0, py + 6, g.W, { size: 26, color: COLOR.ink2, align: 'center' }, 40);
        if (p > 0) onTap(chip(root, '‹ 上一页', 40, py, COLOR.ochreD, false, 26), () => { g.reset(); showCodex(g, tab, p - 1); });
        if (p + 1 < pages) {
            const nx = chip(root, '下一页 ›', 0, py, COLOR.ochreD, false, 26);
            nx.setPosition(g.W - 40 - sizeOf(nx).w, -py, 0);
            onTap(nx, () => { g.reset(); showCodex(g, tab, p + 1); });
        }
    }
}

/** 已收集的排前面（保持原顺序） */
const gotFirst = <T extends { got: boolean }>(list: T[]) => [...list.filter(x => x.got), ...list.filter(x => !x.got)];

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
        case 'lines':
            return gotFirst(v.lines).map(x => {
                if (!x.got) return { title: '？？？', body: '还有一段故事，没遇见。', got: false, color: COLOR.ink2 };
                const n = x.states.filter(s => s.got).length;
                return {
                    title: x.name, body: x.summary, foot: x.states.length ? `走到过 ${n}/${x.states.length} 个结果 ›` : undefined, got: true, color: COLOR.ochreD,
                    onTap: () => showInfo(g, x.name, [x.summary, '', ...x.states.map(s => (s.got ? `✓ ${s.text}` : '· ？？？'))]),
                };
            });
        case 'skills':
            return gotFirst(v.skills).map(x => x.got
                ? { title: x.name, body: x.desc, got: true, color: COLOR.skill }
                : { title: '？？？', body: x.hint || '还没有领悟。', got: false, color: COLOR.ink2 });
        case 'items':
            return gotFirst(v.items).map(x => x.got
                ? { title: x.name, body: x.desc, got: true, color: COLOR.legacy }
                : { title: '？？？', body: '还没见过这件东西。', got: false, color: COLOR.ink2 });
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
        : { fill: '#ddcfb3', fillAlpha: 235, stroke: COLOR.ink2, strokeAlpha: 80, lineWidth: 2, radius: 18 });
    text(n, clampText(c.title, w - 36, 28, 36, 36), 18, 16, w - 36, { size: 28, color: c.got ? c.color : COLOR.ink2, bold: true });
    const bodyH = CARD_H - 70 - (c.foot ? 34 : 12);
    text(n, clampText(c.body, w - 36, 22, 32, bodyH), 18, 62, w - 36, { size: 22, color: c.got ? COLOR.ink : COLOR.ink2, wrap: true, lineHeight: 32 }, bodyH);
    if (c.foot) text(n, c.foot, 18, CARD_H - 42, w - 36, { size: 20, color: COLOR.ochre });
    if (c.onTap) onTap(n, c.onTap);
}
