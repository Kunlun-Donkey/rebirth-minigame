/** 弹窗：事件结果、濒死、通用列表、说明 */
import { StepResult } from '../../core';
import type { Game } from '../game';
import { Platform } from '../platform';
import { box, button, ButtonOpts, chip, COLOR, image, modal, onTap, pop, sizeOf, text, textHeight } from '../ui/kit';
import { CONFIG, TEX } from '../config';
import { danmaku } from '../ui/danmaku';

/** 结果弹窗：文本 + 属性变化 + 消息（突破/领悟/层推进）；点「继续」回调 */
export function showStep(g: Game, s: StepResult, then: () => void): void {
    const e = g.engine;
    const innerW = g.W - 60 - 80;
    const breakthrough = s.messages.find(m => m.startsWith('【突破·'));
    const deltas = Object.entries(s.deltas).filter(([k, v]) => k !== g.engine.data.meta.rules.lifeMax || v);
    const chipsText = [
        ...deltas.map(([k, v]) => ({ t: `${e.attrName(k)} ${v > 0 ? '+' : ''}${v}`, c: v > 0 ? COLOR.good : COLOR.bad })),
        ...s.gained.map(i => ({ t: `获得 ${e.itemName(i)}`, c: COLOR.legacy })),
        ...s.lost.map(i => ({ t: `失去 ${e.itemName(i)}`, c: COLOR.ink2 })),
    ];

    // 估算高度
    let h = 60;
    if (s.success !== undefined) h += 56;
    if (s.text) h += textHeight(s.text, innerW, 32, 52) + 20;
    if (chipsText.length) h += Math.ceil(chipsText.length / 2) * 50 + 10;
    for (const m of s.messages) h += textHeight(m, innerW, 26, 40) + 12;
    if (breakthrough) h += 220;
    h += 130;

    const { panel, close, panelW } = modal(g.overlay, g.W, g.H, Math.min(h, g.H - 160), { onClose: then });
    pop(panel);
    let y = 40;
    if (breakthrough) {
        image(panel, TEX.stage(e.run.stage), (panelW - 150) / 2, y, 150, 150);
        const name = breakthrough.slice(4, breakthrough.indexOf('】'));
        text(panel, `— ${name} —`, 0, y + 150, panelW, { size: 44, color: COLOR.legacy, align: 'center', bold: true });
        y += 220;
    }
    if (s.success !== undefined) {
        chip(panel, s.success ? '成  功' : '失  败', 40, y, s.success ? COLOR.good : COLOR.bad, true, 24);
        y += 56;
    }
    if (s.text) {
        const n = text(panel, s.text, 40, y, innerW, { size: 32, wrap: true, lineHeight: 52 });
        y += sizeOf(n).h + 20;
    }
    if (chipsText.length) {
        let x = 40;
        for (const c of chipsText) {
            const n = chip(panel, c.t, x, y, c.c, false, 22);
            x += sizeOf(n).w + 12;
            if (x > panelW - 200) { x = 40; y += 50; }
        }
        y += 60;
    }
    for (const m of s.messages) {
        const color = m.startsWith('【领悟') || m.startsWith('【想起') ? COLOR.skill
            : m.startsWith('【天道') || m.startsWith('【连胜断了') ? COLOR.ochreD
            : m.startsWith('【恩怨') || m.startsWith('【碾压') ? COLOR.bad
            : m.startsWith('【') ? COLOR.legacy : COLOR.ink2;
        const n = text(panel, m, 40, y, innerW, { size: 26, wrap: true, color, lineHeight: 40, bold: m.startsWith('【') });
        y += sizeOf(n).h + 12;
    }
    if (breakthrough || s.crit || s.hype === 'feud' || s.hype === 'crush') Platform.vibrate();
    if (s.hype) danmaku(g, e.danmaku(s.hype));
    // 按钮始终在面板内（内容超出估算时宁可压住最后一行，也不能出屏）
    const ph = sizeOf(panel).h;
    button(panel, 40, Math.min(Math.max(y + 10, ph - 120), ph - 110), innerW, { label: '继  续', style: 'primary', onClick: close });
}

/** 濒死：看视频复活 / 接受命运 */
export function showDying(g: Game): void {
    const e = g.engine;
    const def = e.data.deaths.get(e.run.dying ?? '');
    const { panel, panelW, close } = modal(g.overlay, g.W, g.H, 520, { dark: true });
    pop(panel);
    text(panel, '你 要 死 了', 0, 50, panelW, { size: 44, color: COLOR.bad, align: 'center', bold: true });
    text(panel, `死因：${def?.name ?? '未知'}`, 0, 130, panelW, { size: 30, color: COLOR.ink2, align: 'center' });
    const boost = [...e.data.upgrades.values()].find(u => u.kind === 'reviveBoost' && e.upgradeLevel(u.id) > 0);
    // 广告未开通时只能接受命运（道具/天赋保命在引擎里已自动生效）
    const canAd = CONFIG.adsEnabled && e.canReviveByAd();
    const hint = !canAd ? '这一世到头了。带着记忆，下一世再来。' : boost ? `命盘·${boost.name}：${boost.desc}` : '天道打了个盹，也许你还有一次机会。';
    text(panel, hint, 40, 190, panelW - 80, { size: 26, color: boost ? COLOR.legacy : COLOR.ink2, align: 'center', wrap: true });
    const bw = panelW - 80;
    if (canAd) {
        button(panel, 40, 270, bw, { label: '看视频 · 逆天改命', style: 'ad', onClick: () => { close(); g.reviveByAd(); } });
    }
    button(panel, 40, canAd ? 390 : 300, bw, { label: '接受命运', style: 'ghost', align: 'left', onClick: () => { close(); g.acceptDeath(); } });
}

export interface ListEntry {
    title: string;
    desc?: string;
    tag?: { text: string; color: string };
    disabled?: boolean;
    onPick?: () => void;
}

/** 通用列表弹窗（道具 / 技能 / 伙伴 / 图鉴 / 封存遗物） */
export function showList(g: Game, title: string, entries: ListEntry[], opts: { emptyText?: string; closeText?: string; onClose?: () => void } = {}): () => void {
    // 行高随描述换行变化：先量出每行高度，据此定面板高度；仍放不下就分页（关闭按钮上方出现翻页条）
    const panelW = g.W - 60;
    const rowW = panelW - 60;
    const opt = (en: ListEntry, close?: () => void): ButtonOpts => ({
        label: en.title, sub: en.desc, tags: en.tag ? [{ text: en.tag.text, color: en.tag.color }] : [], size: 28,
        style: en.disabled ? 'locked' : 'normal',
        onClick: close && en.onPick && !en.disabled ? () => { en.onPick!(); close(); } : undefined,
    });
    const probe = box(null, 0, 0, rowW, 0, 'probe');
    const heights = entries.map(en => sizeOf(button(probe, 0, 0, rowW, opt(en))).h);
    probe.destroy();
    const contentH = entries.length ? heights.reduce((a, b) => a + b + 14, -14) : 120;
    const h = Math.min(g.H - 200, 110 + contentH + 150);
    const { panel, close } = modal(g.overlay, g.W, g.H, h, { onClose: opts.onClose });
    pop(panel);
    text(panel, title, 0, 36, panelW, { size: 36, color: COLOR.ochreD, align: 'center', bold: true });
    if (!entries.length) {
        text(panel, opts.emptyText ?? '空空如也', 40, 130, panelW - 80, { size: 28, color: COLOR.ink2, align: 'center', wrap: true, lineHeight: 42 });
    }
    const paginate = (limit: number) => {
        const pages: number[][] = [[]];
        let y = 110;
        heights.forEach((rh, i) => {
            if (y + rh > limit && pages[pages.length - 1].length) { pages.push([]); y = 110; }
            pages[pages.length - 1].push(i);
            y += rh + 14;
        });
        return pages;
    };
    let pages = paginate(h - 140);
    if (pages.length > 1) pages = paginate(h - 140 - 66);
    const rowsBox = box(panel, 0, 0, panelW, h, 'rows');
    const render = (page: number) => {
        rowsBox.destroyAllChildren();
        let y = 110;
        for (const i of pages[page]) {
            button(rowsBox, 30, y, rowW, opt(entries[i], close));
            y += heights[i] + 14;
        }
        if (pages.length < 2) return;
        const py = h - 196;
        text(rowsBox, `${page + 1} / ${pages.length}`, 0, py + 12, panelW, { size: 24, color: COLOR.ink2, align: 'center' }, 36);
        if (page > 0) onTap(chip(rowsBox, '‹ 上一页', 40, py + 8, COLOR.ochreD, false, 24), () => render(page - 1));
        if (page + 1 < pages.length) {
            const nx = chip(rowsBox, '下一页 ›', 0, py + 8, COLOR.ochreD, false, 24);
            nx.setPosition(panelW - 40 - sizeOf(nx).w, -(py + 8), 0);
            onTap(nx, () => render(page + 1));
        }
    };
    render(0);
    button(panel, 30, h - 120, panelW - 60, { label: opts.closeText ?? '关  闭', style: 'ghost', align: 'left', size: 28, onClick: close });
    return close;
}

/** 纯文字说明弹窗 */
export function showInfo(g: Game, title: string, lines: string[]): void {
    const innerW = g.W - 140;
    const body = lines.join('\n');
    const h = Math.min(g.H - 200, 200 + textHeight(body, innerW, 26, 42) + 130);
    const { panel, close, panelW } = modal(g.overlay, g.W, g.H, h, { tapToClose: false });
    pop(panel);
    text(panel, title, 0, 36, panelW, { size: 36, color: COLOR.ochreD, align: 'center', bold: true });
    text(panel, body, 40, 110, innerW, { size: 26, color: COLOR.ink2, wrap: true, lineHeight: 42 });
    button(panel, 30, h - 120, panelW - 60, { label: '关  闭', style: 'ghost', align: 'left', size: 28, onClick: close });
}

