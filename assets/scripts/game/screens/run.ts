/** 局内主界面：HUD + 事件卡 + 选项 + 底部工具栏（布局对照 docs/filing/mock/1-event.html） */
import { Node } from 'cc';
import { ChoiceView, DirOption } from '../../core';
import { CONFIG, TEX } from '../config';
import type { Game } from '../game';
import {
    box, button, ButtonOpts, chip, COLOR, image, onTap, rect, sizeOf, text, textHeight,
} from '../ui/kit';
import { soundToggle } from './draft';
import { ListEntry, showInfo, showList } from './popups';

const DIR_ICON: Record<string, string> = { up: '▲', down: '▼', side: '◆' };
const SEASONS = ['春', '夏', '秋', '冬'];
const TOOLBAR_H = 120;

export function showRun(g: Game): void {
    const root = box(g.screen, 0, 0, g.W, g.H, 'run');
    rect(root, { fill: COLOR.bg });
    image(root, TEX.mainBg, 0, 0, g.W, g.H, { cover: true });
    const y = hud(g, root);
    const bottom = g.H - TOOLBAR_H - 20;
    if (g.engine.run.phase === 'event') eventArea(g, root, y, bottom);
    else directionArea(g, root, y, bottom);
    toolbar(g, root);
}

// ───────────── HUD ─────────────

function hud(g: Game, root: Node): number {
    const e = g.engine;
    const r = e.run;
    const top = CONFIG.safeTop;
    text(root, `第 ${r.life} 世`, 30, top, 200, { size: 36, color: COLOR.ochreD, bold: true });
    text(root, e.data.meta.name, 170, top + 6, 260, { size: 26, color: COLOR.ink2 });
    const stage = e.stageName(r.stage);
    const tag = box(root, g.W - 30 - 140, top, 140, 46, 'stage');
    rect(tag, { fill: COLOR.leaf, radius: 23 });
    text(tag, stage, 0, 0, 140, { size: 26, color: COLOR.white, align: 'center', valign: 'center' }, 46);

    // 水分条
    const wy = top + 66;
    text(root, '水分', 30, wy - 6, 70, { size: 24, color: COLOR.ink2 });
    const barW = g.W - 30 - 100 - 110;
    const bar = box(root, 100, wy, barW, 18, 'water');
    rect(bar, { fill: COLOR.waterBg, radius: 9 });
    const ratio = Math.max(0, Math.min(1, r.attrs.water / Math.max(1, r.attrs.waterMax)));
    if (ratio > 0) {
        const fillN = box(bar, 0, 0, Math.max(18, barW * ratio), 18, 'fill');
        rect(fillN, { fill: ratio <= 0.25 ? COLOR.bad : COLOR.water, radius: 9 });
    }
    text(root, `${r.attrs.water}/${r.attrs.waterMax}`, g.W - 30 - 100, wy - 6, 100, { size: 24, color: COLOR.ink2, align: 'right' });

    // 属性
    const attrs: [string, string, string][] = [['root', '根', '#8a6a3c'], ['stem', '叶', COLOR.leaf], ['tough', '韧', '#7d7d7d'], ['spirit', '灵', COLOR.epic], ['qi', '气', '#d99a2b']];
    const ay = wy + 40;
    const cw = (g.W - 60 - 4 * 10) / 5;
    attrs.forEach(([id, ic, color], i) => {
        const c = box(root, 30 + i * (cw + 10), ay, cw, 56, `attr_${id}`);
        rect(c, { fill: COLOR.btn, fillAlpha: 190, stroke: COLOR.btnEdge, strokeAlpha: 90, radius: 12 });
        const dot = box(c, 14, 12, 32, 32, 'ic');
        rect(dot, { fill: color, radius: 16 });
        const ch = text(dot, ic, 0, 0, 32, { size: 20, color: COLOR.white, align: 'center', valign: 'center' }, 32);
        const stat = e.data.meta.attrs.find(a => a.id === id)?.stat;
        image(dot, TEX.stat(stat), 0, 0, 32, 32, { onLoaded: () => { ch.active = false; } });
        text(c, String(r.attrs[id] ?? 0), 52, 8, cw - 60, { size: 30, bold: true, valign: 'center' }, 40);
        onTap(c, () => showInfo(g, e.attrName(id), [attrHelp(id)]), false);
    });

    // 位置
    const ly = ay + 76;
    const dir = r.dir ?? null;
    const loc = dir
        ? `${DIR_ICON[dir]} ${e.data.dirs.find(d => d.id === dir)?.name ?? ''} · ${e.data.layersByDir[dir][r.pos[dir]]?.name ?? ''}`
        : `第 ${r.season} 季 · ${SEASONS[(r.season - 1) % 4]}`;
    chip(root, loc, 30, ly, COLOR.ochreD, false, 24);
    const st = soundToggle(g, root, 0, ly);
    st.setPosition(g.W - 30 - sizeOf(st).w, -ly, 0);
    return ly + 60;
}

function attrHelp(id: string): string {
    return {
        root: '向下扎根获得。每 8 点根系，每季自动吸 1 点水；也是深入地下的门槛。',
        stem: '向上生长获得。茎叶越高，每季光合产出的灵气越多；也是长高的门槛。',
        tough: '抵抗灾难与啃咬，提高许多冒险选项的成功率。',
        spirit: '悟性与运气。解锁对话、遗迹与奇遇相关的选项。',
        qi: '成长货币。积累到一定程度就会突破境界。',
    }[id] ?? '';
}

// ───────────── 事件 ─────────────

function eventArea(g: Game, root: Node, y: number, bottom: number): void {
    const e = g.engine;
    const v = e.eventView();
    const cardW = g.W - 60;
    const textW = cardW - 80;
    const textH = textHeight(v.text, textW, 34, 60);
    const cardH = Math.max(260, 100 + textH + 70);
    const tex = v.gold ? TEX.eventCardGold : v.sudden ? TEX.eventCardSudden : TEX.eventCard;

    const card = box(root, 30, y, cardW, cardH, 'event');
    rect(card, {
        fill: v.gold ? '#fbefcf' : v.sudden ? '#f6e1cf' : COLOR.paper,
        stroke: v.gold ? COLOR.legend : v.sudden ? COLOR.bad : COLOR.paperEdge, strokeAlpha: 180, lineWidth: 3,
        radius: 20, shadow: COLOR.btnShadow, shadowOffset: 8,
    });
    image(card, tex, 0, 0, cardW, cardH, { maxAspectDiff: 1.2 });
    const r = e.run;
    const head = v.gold ? '✦ 奇遇' : v.sudden ? '⚡ 突发' : `第 ${r.season} 季 · ${SEASONS[(r.season - 1) % 4]}`;
    text(card, head, 40, 30, 300, { size: 24, color: v.gold ? COLOR.legacy : v.sudden ? COLOR.bad : COLOR.ink2 });
    text(card, `${e.stageName(r.stage)}`, cardW - 240, 30, 200, { size: 24, color: COLOR.ink2, align: 'right' });
    text(card, v.text, 40, 80, textW, { size: 34, wrap: true, lineHeight: 60 });

    // 窥探天命（看视频）
    const left = CONFIG.peekPerRun - g.save.peekUsed;
    if (left > 0 && !r.revealAll && v.choices.some(c => c.enabled)) {
        const peek = chip(card, `窥探天命 · 看视频（${left}/${CONFIG.peekPerRun}）`, 0, cardH - 54, COLOR.adD, false, 20);
        peek.setPosition(cardW - 30 - sizeOf(peek).w, -(cardH - 54), 0);
        onTap(peek, () => g.peekByAd());
    }

    // 选项
    let cy = y + cardH + 28;
    for (const c of v.choices) {
        const n = button(root, 30, cy, cardW, choiceOpts(g, c));
        cy += sizeOf(n).h + 18;
    }
    // 事件中可施展的技能
    const skills = e.skillViews().filter(s => s.usable);
    if (skills.length && cy < bottom - 70) {
        let x = 30;
        for (const s of skills) {
            const n = chip(root, `✧ ${s.name}`, x, cy + 4, COLOR.skill, true, 24);
            onTap(n, () => g.act(() => e.useSkill(s.id)));
            x += sizeOf(n).w + 14;
        }
    }
}

function choiceOpts(g: Game, c: ChoiceView): ButtonOpts {
    const tags: ButtonOpts['tags'] = [];
    if (c.tag) tags.push({ text: c.tag, color: c.tag.startsWith('技能') ? COLOR.skill : COLOR.legacy, filled: true });
    if (c.memory) tags.push({ text: c.memory, color: COLOR.memory });
    let sub: string | undefined;
    let subColor: string | undefined;
    if (!c.enabled) sub = `需要：${c.lockText}`;
    else if (c.preview) { sub = c.preview; subColor = COLOR.good; }
    return {
        label: c.text,
        style: c.enabled ? 'normal' : 'locked',
        tags, sub, subColor,
        onClick: c.enabled ? () => g.act(() => g.engine.choose(c.index)) : undefined,
    };
}

// ───────────── 方向 ─────────────

function directionArea(g: Game, root: Node, y: number, _bottom: number): void {
    const e = g.engine;
    const r = e.run;
    const cardW = g.W - 60;
    const lines = [`你是一株${e.stageName(r.stage)}。`, '这一季，往哪儿长？'];
    const card = box(root, 30, y, cardW, 230, 'prompt');
    rect(card, { fill: COLOR.paper, stroke: COLOR.paperEdge, strokeAlpha: 180, lineWidth: 3, radius: 20, shadow: COLOR.btnShadow, shadowOffset: 8 });
    image(card, TEX.eventCard, 0, 0, cardW, 230, { maxAspectDiff: 1.2 });
    text(card, `第 ${r.season} 季 · ${SEASONS[(r.season - 1) % 4]}`, 40, 30, 300, { size: 24, color: COLOR.ink2 });
    text(card, lines.join('\n'), 40, 80, cardW - 80, { size: 34, wrap: true, lineHeight: 60 });

    let cy = y + 230 + 28;
    for (const o of e.directionOptions()) {
        const n = button(root, 30, cy, cardW, dirOpts(g, o));
        cy += sizeOf(n).h + 18;
    }
    // 可用的方向技能 / 道具 提示
    const skills = e.skillViews().filter(s => s.usable);
    const items = e.usableItems();
    if (skills.length || items.length) {
        const hint = [skills.length ? `${skills.length} 个技能可施展` : '', items.length ? `${items.length} 件道具可使用` : ''].filter(Boolean).join(' · ');
        text(root, `${hint}（见下方工具栏）`, 0, cy + 6, g.W, { size: 24, color: COLOR.skill, align: 'center' });
    }
}

function dirOpts(g: Game, o: DirOption): ButtonOpts {
    if (!o.enabled) return { label: o.name, icon: TEX.dir(o.dir), style: 'locked', sub: `需要：${o.lockText}` };
    const next = o.nextLayer ? `下一层：${o.nextLayer.name}${o.nextLayer.lockText ? `（需${o.nextLayer.lockText}）` : ''}` : '已是最深处';
    return {
        label: o.name,
        icon: TEX.dir(o.dir),
        tags: [{ text: o.layerName, color: COLOR.ochreD }],
        sub: next,
        onClick: () => {
            g.engine.chooseDirection(o.dir);
            g.persist();
            g.reset();
            showRun(g);
        },
    };
}

// ───────────── 工具栏 ─────────────

function toolbar(g: Game, root: Node): void {
    const e = g.engine;
    const bar = box(root, 0, g.H - TOOLBAR_H, g.W, TOOLBAR_H, 'toolbar');
    rect(bar, { fill: COLOR.paper, fillAlpha: 230, stroke: COLOR.paperEdge, strokeAlpha: 120, lineWidth: 2 });
    const usableItems = e.run.phase === 'direction' ? e.usableItems().length : 0;
    const usableSkills = e.skillViews().filter(s => s.usable).length;
    const tools: { id: 'items' | 'skills' | 'companions' | 'codex'; ic: string; label: string; badge: number; fn: () => void }[] = [
        { id: 'items', ic: '囊', label: '道具', badge: usableItems, fn: () => itemsPopup(g) },
        { id: 'skills', ic: '技', label: '技能', badge: usableSkills, fn: () => skillsPopup(g) },
        { id: 'companions', ic: '伴', label: '伙伴', badge: 0, fn: () => companionsPopup(g) },
        { id: 'codex', ic: '鉴', label: '图鉴', badge: 0, fn: () => codexPopup(g) },
    ];
    const tw = g.W / tools.length;
    tools.forEach((t, i) => {
        const n = box(bar, i * tw, 0, tw, TOOLBAR_H, `tool_${t.label}`);
        const ic = box(n, (tw - 56) / 2, 14, 56, 56, 'ic');
        rect(ic, { fill: COLOR.ochre, fillAlpha: 45, radius: 14 });
        const ch = text(ic, t.ic, 0, 0, 56, { size: 28, color: COLOR.ochreD, align: 'center', valign: 'center' }, 56);
        image(ic, TEX.tool(t.id), 0, 0, 56, 56, { onLoaded: () => { ch.active = false; } });
        text(n, t.label, 0, 74, tw, { size: 22, color: COLOR.ink2, align: 'center' });
        if (t.badge > 0) {
            const b = box(n, (tw + 56) / 2 - 16, 6, 30, 30, 'badge');
            rect(b, { fill: COLOR.bad, radius: 15 });
            text(b, String(t.badge), 0, 0, 30, { size: 18, color: COLOR.white, align: 'center', valign: 'center' }, 30);
        }
        onTap(n, t.fn);
    });
}

function itemsPopup(g: Game): void {
    const e = g.engine;
    const usable = new Set(e.run.phase === 'direction' ? e.usableItems() : []);
    const entries: ListEntry[] = e.run.items.map(id => {
        const def = e.data.items.get(id)!;
        const can = usable.has(id);
        return {
            title: def.name, desc: def.desc,
            tag: can ? { text: '使用', color: COLOR.good } : def.useEffect ? { text: '选方向时可用', color: COLOR.ink2 } : { text: '被动', color: COLOR.ink2 },
            onPick: can ? () => g.act(() => e.useItem(id)) : undefined,
        };
    });
    showList(g, '道  具', entries, { emptyText: '你的根边什么都没有。' });
}

function skillsPopup(g: Game): void {
    const e = g.engine;
    const entries: ListEntry[] = e.skillViews().map(s => {
        const kind = s.use === 'direction' ? '选方向时施展' : s.use === 'event' ? '事件中施展' : '特定事件中出现';
        return {
            title: s.name, desc: `${s.desc}（${kind}）`,
            tag: s.usable ? { text: '施展', color: COLOR.skill } : s.cdLeft ? { text: `冷却 ${s.cdLeft} 季`, color: COLOR.ink2 } : { text: '就绪', color: COLOR.good },
            onPick: s.usable ? () => g.act(() => e.useSkill(s.id)) : undefined,
        };
    });
    showList(g, '技  能', entries, { emptyText: '还没有领悟任何技能。死亡、突破、做出选择，都可能领悟。' });
}

function companionsPopup(g: Game): void {
    const e = g.engine;
    const lines: string[] = [];
    for (const id of e.run.talents) {
        const t = e.data.talents.get(id);
        if (t) lines.push(`【天赋】${t.name}\n${t.desc}`);
    }
    for (const id of e.run.companions) {
        const c = e.data.companions.get(id);
        if (c) lines.push(`【伙伴】${c.name}\n${c.desc}`);
    }
    showInfo(g, '伙  伴', lines.length ? lines : ['这一世，你孤身一人。']);
}

function codexPopup(g: Game): void {
    const e = g.engine;
    const dp = e.dp;
    const d = e.data;
    const legacies = Object.entries(dp.legacy).map(([id, lv]) => `${d.legacies.get(id)?.name ?? id} Lv${lv}`);
    showInfo(g, '图  鉴', [
        `死法 ${dp.codex.deaths.length}/${d.deaths.size}　结局 ${dp.codex.endings.length}/${d.endings.size}`,
        `技能 ${dp.skills.length}/${d.skills.size}　道具 ${dp.codex.items.length}/${d.items.size}`,
        `事件 ${dp.codex.events.length}/${d.events.size}　最高境界 ${e.stageName(dp.bestStage)}`,
        '',
        `传承：${legacies.length ? legacies.join('、') : '暂无'}`,
        `技能：${dp.skills.length ? dp.skills.map(id => e.skillName(id)).join('、') : '暂无'}`,
    ]);
}
