/**
 * 轮回殿：天赋 / 道具 / 伙伴 各 N 选 1（默认 3，命盘·慧眼 4）→（技能超过上限时）选择携带技能 → 重生
 * 顶部：命盘（花轮回点永久升级）、今日天命（可看视频换一次）
 */
import { Label, Node } from 'cc';
import { destinyStates, DraftPick, randomSeed, Rarity } from '../../core';
import { CONFIG, TEX } from '../config';
import type { Game } from '../game';
import { Platform } from '../platform';
import {
    box, button, chip, clampText, clear, COLOR, note, estimateWidth, fadeIn, image, onTap, RARITY_COLOR, RARITY_TEXT, rect, sizeOf, text, textHeight,
} from '../ui/kit';
import { ListEntry, showInfo, showList } from './popups';

type PoolKey = 'talents' | 'items' | 'companions';
const STEPS: { key: PoolKey; type: 'talent' | 'item' | 'companion'; title: string }[] = [
    { key: 'talents', type: 'talent', title: '选择天赋' },
    { key: 'items', type: 'item', title: '选择道具' },
    { key: 'companions', type: 'companion', title: '选择伙伴' },
];

export function showDraft(g: Game): void {
    const e = g.engine;
    const draft: DraftPick = e.rollDraft(randomSeed());
    const picks: Partial<Record<PoolKey, string>> = {};
    const needLoadout = e.needSkillLoadout();
    const loadout: string[] = [];
    let step = 0;
    // 本命格第一世：天道替你挑好（每组取稀有度最高的一张），一键开局；想自己挑也可以
    let quick = e.dp.lives === 0 && !needLoadout;
    if (quick) {
        const order: Rarity[] = ['legend', 'epic', 'rare', 'common'];
        for (const s of STEPS) {
            picks[s.key] = [...draft[s.key]].sort((a, b) => order.indexOf(poolDef(g, s.type, a).rarity) - order.indexOf(poolDef(g, s.type, b).rarity))[0];
        }
    }

    const render = () => {
        clear(g.screen);
        const root = box(g.screen, 0, 0, g.W, g.H, 'draft');
        rect(root, { fill: COLOR.bg });
        image(root, TEX.mainBg, 0, 0, g.W, g.H, { cover: true });
        fadeIn(root, 0.12);
        header(g, root, render);

        if (quick) renderQuick(root);
        else if (step < STEPS.length) renderPool(root);
        else if (needLoadout && step === STEPS.length) renderLoadout(root);
        else renderConfirm(root);
    };

    const renderPool = (root: Node) => {
        const s = STEPS[step];
        text(root, `${s.title}（${step + 1}/3）`, 0, 330, g.W, { size: 34, color: COLOR.ochreD, align: 'center', bold: true });
        const ids = draft[s.key];
        const gap = ids.length > 3 ? 14 : 20;
        const cw = Math.min(214, Math.floor((g.W - 40 - gap * (ids.length - 1)) / ids.length));
        const ch = ids.length > 3 ? 390 : 360;
        const x0 = (g.W - cw * ids.length - gap * (ids.length - 1)) / 2;
        ids.forEach((id, i) => {
            const n = card(g, root, s.type, id, x0 + i * (cw + gap), 400, cw, ch);
            onTap(n, () => {
                g.audio.play('card');
                picks[s.key] = id;
                step += 1;
                render();
            }, false);
        });
        summary(root, 400 + ch + 40);
        const freeLeft = e.freeRerolls() - g.save.freeRerollUsed;
        if (freeLeft > 0) {
            button(root, 60, g.H - 240, g.W - 120, {
                label: `天机重演 · 免费刷新这一组（剩 ${freeLeft} 次）`, size: 26,
                onClick: () => {
                    g.save.freeRerollUsed += 1;
                    g.persist();
                    draft[s.key] = e.rollDraft(randomSeed())[s.key];
                    render();
                },
            });
        } else if (CONFIG.adsEnabled && !g.save.rerollUsed) {
            button(root, 60, g.H - 240, g.W - 120, {
                label: '天机重演 · 看视频刷新这一组', style: 'ad', size: 26,
                onClick: async () => {
                    if (!(await g.watchAd('reroll'))) return;
                    g.save.rerollUsed = true;
                    g.persist();
                    draft[s.key] = e.rollDraft(randomSeed())[s.key];
                    render();
                },
            });
        }
        if (step > 0) button(root, 60, g.H - 130, g.W - 120, { label: '上一步', style: 'ghost', size: 26, onClick: () => { step -= 1; render(); } });
    };

    const renderLoadout = (root: Node) => {
        const slots = e.data.meta.settings.skillSlots;
        text(root, `携带技能（${loadout.length}/${slots}）`, 0, 330, g.W, { size: 34, color: COLOR.ochreD, align: 'center', bold: true });
        let y = 400;
        for (const id of e.dp.skills) {
            const s = e.data.skills.get(id);
            if (!s) continue;
            const on = loadout.includes(id);
            const n = button(root, 40, y, g.W - 80, {
                label: s.name, sub: s.desc, size: 28,
                tags: [{ text: on ? '已携带' : s.use === 'direction' ? '方向' : s.use === 'event' ? '事件' : '交互', color: on ? COLOR.good : COLOR.skill, filled: on }],
                onClick: () => {
                    if (on) loadout.splice(loadout.indexOf(id), 1);
                    else if (loadout.length < slots) loadout.push(id);
                    render();
                },
            });
            y += sizeOf(n).h + 12;
            if (y > g.H - 280) break;
        }
        button(root, 60, g.H - 150, g.W - 120, {
            label: loadout.length ? '就 带 这 些' : '不带技能', style: 'primary',
            onClick: () => { step += 1; render(); },
        });
    };

    const renderQuick = (root: Node) => {
        text(root, '第一世，天道随手给你抓了三样：', 0, 330, g.W, { size: 32, color: COLOR.ochreD, align: 'center', bold: true });
        let y = 400;
        for (const s of STEPS) {
            const def = poolDef(g, s.type, picks[s.key]!);
            const n = button(root, 40, y, g.W - 80, {
                label: def.name, sub: def.desc, size: 30,
                tags: [{ text: RARITY_TEXT[def.rarity], color: RARITY_COLOR[def.rarity], filled: true }],
            });
            y += sizeOf(n).h + 14;
        }
        note(root, '死了不要紧：每一种死法，都会变成下一世的本事。', y + 10, g.W, { size: 24, color: COLOR.memory });
        button(root, 60, g.H - 260, g.W - 120, { label: '重   生', style: 'primary', size: 36, onClick: () => g.startRun({
            talent: picks.talents!, item: picks.items!, companion: picks.companions!,
        }) });
        button(root, 60, g.H - 140, g.W - 120, { label: '我要自己挑', style: 'ghost', size: 26, onClick: () => {
            quick = false;
            step = 0;
            for (const s of STEPS) delete picks[s.key];
            render();
        } });
    };

    const renderConfirm = (root: Node) => {
        text(root, '这一世，你将带着：', 0, 330, g.W, { size: 32, color: COLOR.ochreD, align: 'center' });
        let y = 400;
        for (const s of STEPS) {
            const id = picks[s.key]!;
            const def = poolDef(g, s.type, id);
            const n = button(root, 40, y, g.W - 80, {
                label: def.name, sub: def.desc, size: 30,
                tags: [{ text: RARITY_TEXT[def.rarity], color: RARITY_COLOR[def.rarity], filled: true }],
            });
            y += sizeOf(n).h + 14;
        }
        if (loadout.length) {
            text(root, `技能：${loadout.map(id => e.skillName(id)).join('、')}`, 40, y + 6, g.W - 80, { size: 26, color: COLOR.skill, wrap: true });
        }
        button(root, 60, g.H - 260, g.W - 120, { label: '重   生', style: 'primary', size: 36, onClick: () => g.startRun({
            talent: picks.talents!, item: picks.items!, companion: picks.companions!,
            skills: needLoadout ? loadout : undefined,
        }) });
        button(root, 60, g.H - 140, g.W - 120, { label: '重新选择', style: 'ghost', size: 26, onClick: () => { step = 0; render(); } });
    };

    const summary = (root: Node, y: number) => {
        const got = STEPS.filter(s => picks[s.key]).map(s => poolDef(g, s.type, picks[s.key]!).name);
        if (got.length) text(root, `已选：${got.join(' · ')}`, 0, y, g.W, { size: 26, color: COLOR.ink2, align: 'center' });
    };

    render();
}

function header(g: Game, root: Node, rerender: () => void): void {
    const e = g.engine;
    const dp = e.dp;
    text(root, '轮  回  殿', 0, CONFIG.safeTop + 10, g.W, { size: 52, color: COLOR.ochreD, align: 'center', bold: true });
    const menu = chip(root, '‹ 菜单', 30, CONFIG.safeTop + 22, COLOR.ochreD, false, 22);
    onTap(menu, () => g.goMenu());
    if (e.data.upgrades.size) {
        const label = upgradeViews(g).some(v => v.affordable) ? '命盘 · 可升级' : '命盘';
        const n = chip(root, label, g.W - 30 - (estimateWidth(label, 22) + 20), CONFIG.safeTop + 22, COLOR.legacy, true, 22);
        onTap(n, () => showUpgrades(g, rerender));
    }
    const fate = e.data.fates.get(dp.daily?.fate ?? '');
    if (fate) {
        const first = dp.daily?.first ? ' · 今日首世轮回点 +50%' : '';
        const n = text(root, `今日天命·${fate.name}${first}  ›`, 0, CONFIG.safeTop + 184, g.W, { size: 24, color: COLOR.ochreD, align: 'center', bold: true });
        onTap(n, () => showFate(g, rerender), false);
    }
    const multi = g.index.destinies.length > 1;
    const states = multi ? destinyStates(g.index, g.save.profile) : [];
    const fresh = states.some(s => s.unlocked && !s.lives && s.entry.id !== e.data.meta.id);
    const nameLine = `第 ${dp.lives + 1} 世 · ${e.data.meta.name}${multi ? (fresh ? ' ⇄ 新命格!' : ' ⇄') : ''} · 轮回点 ${g.save.profile.points}`;
    const nameN = text(root, nameLine, 0, CONFIG.safeTop + 90, g.W, { size: 26, color: fresh ? COLOR.bad : COLOR.ink2, align: 'center' });
    if (multi) onTap(nameN, () => g.goDestinySelect());
    const legacies = Object.entries(dp.legacy).map(([id, lv]) => `${e.data.legacies.get(id)?.name ?? id} Lv${lv}`);
    const kept = dp.keptSystem ? e.data.companions.get(dp.keptSystem) : undefined;
    const line2 = [
        legacies.length ? `传承 ${legacies.length}` : '尚无传承',
        `技能 ${dp.skills.length}/${e.data.skills.size}`,
        kept ? `系统·${kept.name}` : '',
        dp.sealed.length ? `封存：${dp.sealed.map(i => e.itemName(i)).join('、')}` : '',
    ].filter(Boolean).join('  ·  ');
    const info = text(root, clampText(line2, g.W - 60, 24, 34, 34), 30, CONFIG.safeTop + 140, g.W - 60, { size: 24, color: COLOR.ochre, align: 'center' });
    if (legacies.length || kept) {
        onTap(info, () => showInfo(g, '带进这一世的', [
            ...Object.entries(dp.legacy).map(([id, lv]) => {
                const l = e.data.legacies.get(id);
                return `${l?.name ?? id}  Lv${lv}/${l?.max ?? '?'}\n${l?.desc ?? ''}`;
            }),
            ...(kept ? [`【系统·${kept.name}】已认主，每一世开局自动绑定\n${kept.desc}`] : []),
        ]), false);
    }
}

function poolDef(g: Game, type: 'talent' | 'item' | 'companion', id: string): { name: string; desc: string; rarity: Rarity; icon?: string } {
    const d = g.engine.data;
    const def = type === 'talent' ? d.talents.get(id) : type === 'item' ? d.items.get(id) : d.companions.get(id);
    return def ?? { name: id, desc: '', rarity: 'common' };
}

/** 抽卡卡牌：卡框贴图 + 插图（缺图时画兜底） */
function card(g: Game, parent: Node, type: 'talent' | 'item' | 'companion', id: string, x: number, y: number, w: number, h: number): Node {
    const def = poolDef(g, type, id);
    const color = RARITY_COLOR[def.rarity];
    const n = box(parent, x, y, w, h, `card_${id}`);
    rect(n, { fill: COLOR.paper, stroke: color, lineWidth: def.rarity === 'common' ? 3 : 6, radius: 18, shadow: COLOR.btnShadow, shadowOffset: 8 });
    image(n, TEX.frame(def.rarity), 0, 0, w, h);

    // 插图窗口：伙伴用命格头像，天赋/道具用通用符号图标；都缺时显示名字首字
    const art = box(n, 16, 16, w - 32, 128, 'art');
    rect(art, { fill: color, fillAlpha: 40, radius: 12 });
    text(art, def.name.slice(0, 1), 0, 0, w - 32, { size: 64, color, align: 'center', valign: 'center', bold: true }, 128);
    const pic = type === 'companion' ? TEX.companion(id) : TEX.icon(type, def.icon);
    if (pic.length) image(art, pic, (w - 32 - 128) / 2, 0, 128, 128);
    image(n, TEX.badge(type), (w - 48) / 2, -14, 48, 48);

    text(n, def.name, 10, 156, w - 20, { size: 30, align: 'center', bold: true });
    const label = RARITY_TEXT[def.rarity];
    chip(n, label, (w - estimateWidth(label, 20) - 20) / 2, 200, color, true);
    // 描述放不下时依次缩小字号，保证不压出卡框底边
    const room = h - 244 - 30;
    const fit = [[22, 32], [20, 28], [18, 25], [16, 22]].find(([fs, lh]) => textHeight(def.desc, w - 32, fs, lh) <= room) ?? [16, 22];
    text(n, def.desc, 16, 244, w - 32, { size: fit[0], color: COLOR.ink2, wrap: true, lineHeight: fit[1] });
    return n;
}

/** 声音开关（局内 HUD 也复用） */
export function soundToggle(g: Game, parent: Node, x: number, y: number): Node {
    const n = chip(parent, g.audio.isMuted ? '♪ 声音：关' : '♪ 声音：开', x, y, g.audio.isMuted ? COLOR.ink2 : COLOR.ochreD, false, 22);
    onTap(n, () => {
        const muted = g.toggleMute();
        // 只更新文字，不重建整个界面
        const label = n.children.find(c => c.name === 'text')?.getComponent(Label);
        if (label) label.string = muted ? '♪ 声音：关' : '♪ 声音：开';
    });
    return n;
}

/** 命盘条目；广告未开通时隐藏只对看视频生效的「续命」 */
function upgradeViews(g: Game) {
    const e = g.engine;
    return e.upgradeViews().filter(v => CONFIG.adsEnabled || e.data.upgrades.get(v.id)?.kind !== 'reviveBoost');
}

/** 命盘：花轮回点永久升级（按下后刷新列表，方便连续购买） */
function showUpgrades(g: Game, rerender: () => void): void {
    const e = g.engine;
    showList(g, `命盘 · 轮回点 ${g.save.profile.points}`, upgradeViews(g).map(v => ({
        title: `${v.name}  Lv${v.level}/${v.max}`,
        desc: v.desc,
        tag: v.cost === undefined
            ? { text: '已满级', color: COLOR.ink2 }
            : { text: `${v.cost} 点`, color: v.affordable ? COLOR.legacy : COLOR.ink2 },
        disabled: !v.affordable,
        onPick: () => {
            if (g.buyUpgrade(v.id)) {
                g.audio.play('success');
                Platform.toast(`${v.name} 升到 Lv${v.level + 1}`);
            }
            rerender();
            showUpgrades(g, rerender);
        },
    })), { closeText: '返  回' });
}

/** 今日天命：说明 + 看视频换一个（每天一次） */
function showFate(g: Game, rerender: () => void): void {
    const e = g.engine;
    const daily = e.dp.daily;
    const fate = e.data.fates.get(daily?.fate ?? '');
    if (!daily || !fate) return;
    const entries: ListEntry[] = [{
        title: `今日天命 · ${fate.name}`,
        desc: `${fate.desc}${daily.first ? '\n今天第一世结算时轮回点 +50%。' : ''}`,
        tag: { text: '今日生效', color: COLOR.legacy },
    }];
    if (CONFIG.adsEnabled && e.canSwapFate()) {
        entries.push({
            title: '看视频 · 换一个天命',
            desc: '每天一次，换成另一个随机天命。',
            tag: { text: '视频', color: COLOR.adD },
            onPick: async () => {
                if (await g.swapFateByAd()) {
                    Platform.toast(`天命已改为「${e.data.fates.get(e.dp.daily!.fate)?.name}」`);
                    rerender();
                }
            },
        });
    }
    showList(g, '天  命', entries, { closeText: '知道了' });
}
