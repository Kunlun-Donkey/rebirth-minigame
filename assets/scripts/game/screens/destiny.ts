/**
 * 命格选择（从轮回殿进入）：所有命格并列，未解锁的显示解锁条件。
 * 封面图 textures/destiny/<id>/cover（1:1），缺图时显示命格名的最后一个字。
 */
import { destinyStates } from '../../core';
import { CONFIG, TEX } from '../config';
import type { Game } from '../game';
import { Platform } from '../platform';
import { box, button, chip, COLOR, estimateWidth, fadeIn, image, onTap, rect, text, textHeight } from '../ui/kit';

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
        text(card, entry.desc, tx, descY, tw, { size: fit[0], color: COLOR.ink2, wrap: true, lineHeight: fit[1] });
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

    button(root, 60, g.H - 140, g.W - 120, { label: '返  回', style: 'ghost', size: 28, onClick: back });
}
