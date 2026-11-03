/**
 * 命格选择（从轮回殿进入）：所有命格并列，未解锁的显示解锁条件。
 * 封面图 textures/destiny/<id>/cover（1:1），缺图时显示命格名的最后一个字。
 * 「随缘投胎」转盘：已解锁 ≥2 个命格时出现，每天首次免费、之后看视频；转出的命格本世轮回点 +30%。
 * 新命格解锁时也用同一个转盘揭晓（停在新命格上）。
 */
import { tween } from 'cc';
import { destinyStates, SPIN_BONUS } from '../../core';
import { CONFIG, TEX } from '../config';
import type { Game } from '../game';
import { Platform } from '../platform';
import { box, button, chip, clear, COLOR, estimateWidth, fadeIn, image, modal, onTap, pop, rect, text, textHeight } from '../ui/kit';

const MAX_CARD_H = 240;
const GAP = 20;
/** 简介字号候选 [字号, 行高]：放不下就往小一档 */
const DESC_FONTS: [number, number][] = [[21, 30], [20, 28], [18, 25], [17, 23]];

export function showDestinySelect(g: Game, from: 'draft' | 'menu' = 'draft'): void {
    const back = () => (from === 'menu' ? g.goMenu() : g.goDraft());
    const root = box(g.screen, 0, 0, g.W, g.H, 'destiny');
    rect(root, { fill: COLOR.bg });
    image(root, TEX.mainBg, 0, 0, g.W, g.H, { cover: true });
    fadeIn(root, 0.12);
    text(root, '选  择  命  格', 0, CONFIG.safeTop + 10, g.W, { size: 48, color: COLOR.ochreD, align: 'center', bold: true });
    text(root, '每个命格的传承、技能、命盘各自独立；轮回点通用。', 0, CONFIG.safeTop + 86, g.W, { size: 22, color: COLOR.ink2, align: 'center' });

    const cur = g.data.meta.id;
    const cardW = g.W - 60;
    let y = CONFIG.safeTop + 140;
    const states = destinyStates(g.index, g.save.profile);
    // 命格多了自动压缩卡片高度，保证全部放得下且不压住底部按钮
    const avail = g.H - 160 - y;
    const CARD_H = Math.min(MAX_CARD_H, Math.floor((avail - GAP * (states.length - 1)) / Math.max(1, states.length)));
    const ART = CARD_H - 44;
    for (const st of states) {
        const { entry } = st;
        const isCur = entry.id === cur;
        const card = box(root, 30, y, cardW, CARD_H, `destiny_${entry.id}`);
        rect(card, {
            fill: COLOR.paper, stroke: isCur ? COLOR.legacy : COLOR.paperEdge, strokeAlpha: 200,
            lineWidth: isCur ? 6 : 3, radius: 20, shadow: COLOR.btnShadow, shadowOffset: 8,
        });

        // 封面：缺图时显示名字最后一个字
        const art = box(card, 22, (CARD_H - ART) / 2, ART, ART, 'art');
        rect(art, { fill: COLOR.ochre, fillAlpha: 40, radius: 16 });
        const ch = text(art, entry.name.slice(-1), 0, 0, ART, { size: 96, color: COLOR.ochreD, align: 'center', valign: 'center', bold: true }, ART);
        image(art, TEX.cover(entry.id), 0, 0, ART, ART, { onLoaded: () => { ch.active = false; } });

        const tx = 22 + ART + 24;
        const tw = cardW - tx - 24;
        // 命格多、卡片矮时整体收紧：标题上移、状态行贴底，简介按剩余高度挑字号
        const compact = CARD_H < 200;
        const nameY = compact ? 16 : 26;
        const descY = compact ? 62 : 76;
        const status = st.unlocked ? (st.lives ? `已轮回 ${st.lives} 世` : '尚未投胎') : `🔒 ${st.lockText ?? '未解锁'}`;
        const statusH = textHeight(status, tw, 20, 28);
        const statusY = CARD_H - (compact ? 12 : 22) - statusH;
        const room = statusY - descY - 4;
        // 估算留 1.5 个字的余量：破折号、标点在真机上的宽度和估算有出入
        const fit = DESC_FONTS.find(([fs, lh]) => textHeight(entry.desc, tw - fs * 1.5, fs, lh) <= room) ?? DESC_FONTS[DESC_FONTS.length - 1];
        text(card, entry.name, tx, nameY, tw, { size: compact ? 32 : 36, bold: true, color: st.unlocked ? COLOR.ink : COLOR.ink2 });
        text(card, entry.desc, tx, descY, tw, { size: fit[0], color: COLOR.ink2, wrap: true, lineHeight: fit[1] }, room);
        text(card, status, tx, statusY, tw, { size: 20, color: st.unlocked ? COLOR.ochre : COLOR.bad, wrap: true, lineHeight: 28 });
        if (isCur) {
            const label = '当前';
            chip(card, label, cardW - 24 - (estimateWidth(label, 20) + 20), 24, COLOR.legacy, true);
        }

        if (!st.unlocked) {
            const mask = box(card, 0, 0, cardW, CARD_H, 'lock');
            rect(mask, { fill: COLOR.mask, fillAlpha: 40, radius: 20 });
            image(mask, TEX.lock, 22 + (ART - 88) / 2, (CARD_H - 88) / 2, 88, 88);
        }
        onTap(card, () => {
            if (!st.unlocked) { Platform.toast(`解锁条件：${st.lockText ?? ''}`); return; }
            if (isCur) { back(); return; }
            g.audio.play('card');
            g.switchDestiny(entry.id, from);
        });
        y += CARD_H + GAP;
    }

    if (states.filter(s => s.unlocked).length < 2) {
        button(root, 60, g.H - 140, g.W - 120, { label: '返  回', style: 'ghost', size: 28, onClick: back });
        return;
    }
    const half = (g.W - 120 - 20) / 2;
    const free = g.canFreeSpin();
    let busy = false;
    button(root, 60, g.H - 140, half, {
        label: free ? '随缘投胎 · 免费' : '随缘投胎 · 视频', style: free ? 'primary' : 'ad', size: 26, align: 'center',
        onClick: async () => {
            if (busy) return;
            busy = true;
            const id = await g.rollSpin().finally(() => { busy = false; });
            if (!id) return;
            spinWheel(g, states.filter(s => s.unlocked).map(s => s.entry.id), id, {
                title: '随  缘  投  胎',
                lines: name => [`这一世，你是「${name}」。`, `本世结算轮回点 +${Math.round(SPIN_BONUS * 100)}%`],
                okText: '投  胎',
                onOk: () => (id === g.data.meta.id ? g.goDraft() : g.switchDestiny(id, 'draft')),
            });
        },
    });
    button(root, 60 + half + 20, g.H - 140, half, { label: '返  回', style: 'ghost', size: 28, align: 'center', onClick: back });
}

/** 新命格解锁：转盘在已解锁命格间滚动，停在新命格上 */
export function showUnlockReveal(g: Game, fresh: string[]): void {
    const all = destinyStates(g.index, g.save.profile).filter(s => s.unlocked).map(s => s.entry.id);
    const more = fresh.slice(1).map(id => g.index.destinies.find(e => e.id === id)?.name ?? id);
    const desc = g.index.destinies.find(e => e.id === fresh[0])?.desc ?? '';
    spinWheel(g, all, fresh[0], {
        title: '新  命  格  解  锁',
        lines: name => [`「${name}」已解锁，可在轮回殿切换。`, desc, ...(more.length ? [`同时解锁：${more.join('、')}`] : [])],
        okText: '知  道  了',
        onOk: () => undefined,
    });
}

/** 转盘：在 ids 间依次高亮、逐渐减速，最后停在 target 上，再显示结果和按钮 */
function spinWheel(g: Game, ids: string[], target: string,
    o: { title: string; lines: (name: string) => string[]; okText: string; onOk: () => void }): void {
    const nameOf = (id: string) => g.index.destinies.find(e => e.id === id)?.name ?? id;
    const PH = 760;
    const S = 260;
    const { panel, close, panelW } = modal(g.overlay, g.W, g.H, PH, { dark: true });
    pop(panel);
    text(panel, o.title, 0, 36, panelW, { size: 38, color: COLOR.ochreD, align: 'center', bold: true });
    const slot = box(panel, (panelW - S) / 2, 110, S, S + 60, 'slot');
    const draw = (id: string, final: boolean) => {
        clear(slot);
        const art = box(slot, 0, 0, S, S, 'art');
        rect(art, { fill: COLOR.ochre, fillAlpha: final ? 70 : 40, radius: 20, stroke: final ? COLOR.legend : COLOR.paperEdge, lineWidth: final ? 6 : 3 });
        const ch = text(art, nameOf(id).slice(-1), 0, 0, S, { size: 120, color: COLOR.ochreD, align: 'center', valign: 'center', bold: true }, S);
        image(art, TEX.cover(id), 8, 8, S - 16, S - 16, { onLoaded: () => { ch.active = false; } });
        text(slot, nameOf(id), 0, S + 14, S, { size: 32, bold: true, align: 'center', color: final ? COLOR.legacy : COLOR.ink });
    };
    const start = Math.floor(Math.random() * ids.length);
    const total = ids.length * 3 + ((ids.indexOf(target) - start + ids.length) % ids.length);
    const tick = (i: number) => {
        if (!panel.isValid) return;
        const last = i >= total;
        draw(last ? target : ids[(start + i) % ids.length], last);
        if (!last) {
            g.audio.play('click');
            const p = i / total;
            tween(panel).delay(0.05 + 0.3 * p * p).call(() => tick(i + 1)).start();
            return;
        }
        g.audio.play('breakthrough');
        Platform.vibrate();
        pop(slot);
        const body = o.lines(nameOf(target)).filter(Boolean).join('\n');
        text(panel, body, 40, 110 + S + 80, panelW - 80, { size: 26, color: COLOR.ink2, align: 'center', wrap: true, lineHeight: 40 }, PH - 120 - (110 + S + 80) - 10);
        button(panel, 30, PH - 120, panelW - 60, { label: o.okText, style: 'primary', size: 30, align: 'center', onClick: () => { close(); o.onOk(); } });
    };
    tick(0);
}
