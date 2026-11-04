/** 局内主界面：HUD + 事件卡 + 选项 + 底部工具栏（布局对照 docs/filing/mock/1-event.html） */
import { Node } from 'cc';
import { ChoiceView, DirOption } from '../../core';
import { CONFIG, TEX } from '../config';
import type { Game } from '../game';
import {
    box, button, ButtonOpts, chip, clampText, COLOR, image, note, onTap, rect, sizeOf, text, textHeight,
} from '../ui/kit';
import { ListEntry, showInfo, showList } from './popups';

const DIR_ICON: Record<string, string> = { up: '▲', down: '▼', side: '◆' };
const SEASONS = ['春', '夏', '秋', '冬'];
const TOOLBAR_H = 120;
/** 特殊标签配色（其余：技能紫、传承/天赋/道具金） */
const TAG_COLOR: Record<string, string> = { 前世今生: COLOR.skill, 宿怨: COLOR.bad };

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
    const map = e.mapDef();
    const label = r.blessed ? `✦ ${e.data.meta.blessed?.name ?? e.data.meta.name}` : e.data.meta.name;
    const career = e.careerDef();
    const sub = [map?.name, career?.name].filter(Boolean).join(' · ');
    const where = text(root, clampText(sub ? `${label} · ${sub}` : label, g.W - 170 - 190, 26, 34, 34), 170, top + 6, g.W - 170 - 190, { size: 26, color: r.blessed ? COLOR.legacy : COLOR.ink2, bold: !!r.blessed });
    // 点按看本世的出生地 / 职业 / 系统 / 今日天命
    const sys = e.data.companions.get(e.systemId() ?? '');
    const fate = e.data.fates.get(r.fate ?? '');
    const about = [
        map ? `出生地 · ${map.name}：${map.desc}` : '',
        career ? `职业 · ${career.name}：${career.desc}` : '',
        sys ? `系统 · ${sys.name}：${sys.desc}` : '',
        fate ? `今日天命 · ${fate.name}：${fate.desc}` : '',
    ].filter(Boolean);
    if (about.length) onTap(where, () => showInfo(g, `第 ${r.life} 世`, about), false);
    const stage = e.stageName(r.stage);
    const tag = box(root, g.W - 30 - 140, top, 140, 46, 'stage');
    rect(tag, { fill: COLOR.leaf, radius: 23 });
    text(tag, stage, 0, 0, 140, { size: 26, color: COLOR.white, align: 'center', valign: 'center' }, 46);

    // 生命条（剧本 rules.life / rules.lifeMax，如水分、体力）
    const meta = e.data.meta;
    const R = meta.rules;
    const lifeDef = meta.attrs.find(a => a.id === R.life);
    const life = r.attrs[R.life] ?? 0;
    const lifeMax = Math.max(1, r.attrs[R.lifeMax] ?? 1);
    const wy = top + 66;
    text(root, lifeDef?.name ?? R.life, 30, wy - 6, 70, { size: 24, color: COLOR.ink2 });
    const barW = g.W - 30 - 100 - 110;
    const bar = box(root, 100, wy, barW, 18, 'life');
    rect(bar, { fill: COLOR.waterBg, radius: 9 });
    const ratio = Math.max(0, Math.min(1, life / lifeMax));
    if (ratio > 0) {
        const fillN = box(bar, 0, 0, Math.max(18, barW * ratio), 18, 'fill');
        rect(fillN, { fill: ratio <= 0.25 ? COLOR.bad : lifeDef?.color ?? COLOR.water, radius: 9 });
    }
    text(root, `${life}/${lifeMax}`, g.W - 30 - 100, wy - 6, 100, { size: 24, color: COLOR.ink2, align: 'right' });

    // 属性（剧本 attrs 中非隐藏、非生命的属性，按声明顺序）
    const attrs = meta.attrs.filter(a => !a.hidden && a.id !== R.life);
    const ay = wy + 40;
    const n = Math.max(1, attrs.length);
    const cw = (g.W - 60 - (n - 1) * 10) / n;
    attrs.forEach((a, i) => {
        const color = a.color ?? COLOR.ochre;
        const c = box(root, 30 + i * (cw + 10), ay, cw, 56, `attr_${a.id}`);
        rect(c, { fill: COLOR.btn, fillAlpha: 190, stroke: COLOR.btnEdge, strokeAlpha: 90, radius: 12 });
        const dot = box(c, 14, 12, 32, 32, 'ic');
        rect(dot, { fill: color, radius: 16 });
        const ch = text(dot, a.short ?? a.name.slice(0, 1), 0, 0, 32, { size: 20, color: COLOR.white, align: 'center', valign: 'center' }, 32);
        image(dot, TEX.stat(a.stat), 0, 0, 32, 32, { onLoaded: () => { ch.active = false; } });
        text(c, String(r.attrs[a.id] ?? 0), 52, 8, cw - 60, { size: 30, bold: true, valign: 'center' }, 40);
        onTap(c, () => showInfo(g, a.name, [a.desc ?? '']), false);
    });

    // 位置
    const ly = ay + 76;
    const dir = r.dir ?? null;
    const loc = dir
        ? `${DIR_ICON[dir]} ${e.data.dirs.find(d => d.id === dir)?.name ?? ''} · ${e.layerName(dir, r.pos[dir])}`
        : `第 ${r.season} 季 · ${SEASONS[(r.season - 1) % 4]}`;
    chip(root, loc, 30, ly, COLOR.ochreD, false, 24);
    const menu = chip(root, '☰ 菜单', 0, ly, COLOR.ochreD, false, 24);
    menu.setPosition(g.W - 30 - sizeOf(menu).w, -ly, 0);
    onTap(menu, () => { g.persist(); g.goMenu(); });

    // 距离下一境界（只列「属性 ≥ N」条件；已满足的项打勾）
    const pg = e.stageProgress();
    if (pg && pg.parts.length) {
        const parts = pg.parts.map(p => (p.cur >= p.need ? `${p.label} ✓` : `${p.label} ${p.cur}/${p.need}`));
        const done = pg.parts.every(p => p.cur >= p.need);
        text(root, `距「${pg.name}」：${parts.join(' · ')}`, 30, ly + 50, g.W - 60,
            { size: 22, color: done ? COLOR.good : COLOR.ochre, bold: done });
        return ly + 92;
    }
    return ly + 60;
}

// ───────────── 事件 ─────────────

/** 排版档位：选项太多放不下时，依次缩小正文字号与间距 */
const COMPACT: { size: number; lh: number; minH: number; gap: number; compact?: boolean }[] = [
    { size: 34, lh: 60, minH: 260, gap: 18 },
    { size: 30, lh: 50, minH: 220, gap: 12 },
    { size: 26, lh: 42, minH: 190, gap: 8 },
    // 选项 6~7 个时（如打工人选职业）：选项按钮也压矮
    { size: 26, lh: 42, minH: 170, gap: 6, compact: true },
];

function eventArea(g: Game, parent: Node, y: number, bottom: number, level = 0): void {
    const e = g.engine;
    const v = e.eventView();
    const L = COMPACT[level];
    // 本档的全部节点放在一个容器里，放不下时整体销毁、换更紧凑的档位重排
    const root = box(parent, 0, 0, g.W, g.H, 'eventArea');
    const cardW = g.W - 60;
    const textW = cardW - 80;
    const textH = textHeight(v.text, textW - L.size * 1.5, L.size, L.lh);
    const cardH = Math.max(L.minH, 100 + textH + 70);
    const tex = v.gold ? TEX.eventCardGold : v.sudden ? TEX.eventCardSudden : TEX.eventCard;

    const card = box(root, 30, y, cardW, cardH, 'event');
    rect(card, {
        fill: v.gold ? '#fbefcf' : v.sudden ? '#f6e1cf' : COLOR.paper,
        stroke: v.gold ? COLOR.legend : v.sudden ? COLOR.bad : COLOR.paperEdge, strokeAlpha: 180, lineWidth: 3,
        radius: 20, shadow: COLOR.btnShadow, shadowOffset: 8,
    });
    image(card, tex, 0, 0, cardW, cardH, { maxAspectDiff: 1.2 });
    const r = e.run;
    const head = v.cross ? '✕ 命运交汇' : v.cameo ? '◈ 似曾相识' : v.gold ? '✦ 奇遇' : v.sudden ? '⚡ 突发' : `第 ${r.season} 季 · ${SEASONS[(r.season - 1) % 4]}`;
    // 金卡边框带花饰：卡头内缩，避免压在边框线上
    const hx = v.gold ? 60 : 40, hy = v.gold ? 42 : 30;
    text(card, head, hx, hy, 300, { size: 24, color: v.cross ? COLOR.rare : v.cameo ? COLOR.skill : v.gold ? COLOR.legacy : v.sudden ? COLOR.bad : COLOR.ink2, bold: v.cameo || v.cross });
    text(card, `${e.stageName(r.stage)}`, cardW - hx - 200, hy, 200, { size: 24, color: COLOR.ink2, align: 'right' });
    text(card, v.text, 40, v.gold ? 88 : 80, textW, { size: L.size, wrap: true, lineHeight: L.lh });

    // 窥探天命（看视频）
    const left = CONFIG.peekPerRun - g.save.peekUsed;
    if (CONFIG.adsEnabled && left > 0 && !r.revealAll && v.choices.some(c => c.enabled)) {
        const peek = chip(card, `窥探天命 · 看视频（${left}/${CONFIG.peekPerRun}）`, 0, cardH - 54, COLOR.adD, false, 20);
        peek.setPosition(cardW - 30 - sizeOf(peek).w, -(cardH - 54), 0);
        onTap(peek, () => g.peekByAd());
    }

    // 选项
    let cy = y + cardH + 28 - L.gap;
    for (const c of v.choices) {
        const n = button(root, 30, cy + L.gap, cardW, { ...choiceOpts(g, c), compact: L.compact, size: L.compact ? 26 : undefined });
        cy += sizeOf(n).h + L.gap;
    }
    if (cy > bottom && level < COMPACT.length - 1) {
        root.destroy();
        eventArea(g, parent, y, bottom, level + 1);
        return;
    }
    cy += L.gap;
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
    if (c.sure) tags.push({ text: '稳', color: COLOR.good, filled: true });
    if (c.absurd) tags.push({ text: '离谱', color: COLOR.ink2, filled: true });
    if (c.tag) tags.push({ text: c.tag, color: TAG_COLOR[c.tag] ?? (c.tag.startsWith('技能') ? COLOR.skill : COLOR.legacy), filled: true });
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
    const career = e.careerDef();
    const prompt = (e.data.meta.rules.dirPrompt ?? '你是{stage}。\n这一季，往哪儿去？')
        .replace('{stage}', e.stageName(r.stage))
        .replace(/[，,]?\{career\}/, career ? `，${career.title}` : '');
    // 不限方向的待续剧情：预告写在提示卡里（限方向的写在对应方向按钮上）
    const anyTeaser = e.threadTeasers().find(t => t.dir === 'any');
    const card = box(root, 30, y, cardW, 230, 'prompt');
    rect(card, { fill: COLOR.paper, stroke: COLOR.paperEdge, strokeAlpha: 180, lineWidth: 3, radius: 20, shadow: COLOR.btnShadow, shadowOffset: 8 });
    image(card, TEX.eventCard, 0, 0, cardW, 230, { maxAspectDiff: 1.2 });
    text(card, `第 ${r.season} 季 · ${SEASONS[(r.season - 1) % 4]}`, 40, 30, 300, { size: 24, color: COLOR.ink2 });
    if (anyTeaser) {
        text(card, prompt.split('\n')[0], 40, 80, cardW - 80, { size: 34, wrap: true, lineHeight: 60 });
        text(card, `未完的事：${anyTeaser.text}`, 40, 146, cardW - 80, { size: 28, color: COLOR.legacy, wrap: true, lineHeight: 40 });
    } else {
        text(card, prompt, 40, 80, cardW - 80, { size: 34, wrap: true, lineHeight: 60 });
    }

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
        note(root, `${hint}（见下方工具栏）`, cy + 6, g.W, { size: 24, color: COLOR.skill });
    }
}

function dirOpts(g: Game, o: DirOption): ButtonOpts {
    if (!o.enabled) return { label: o.name, icon: TEX.dir(o.dir), style: 'locked', sub: `需要：${o.lockText}` };
    const next = o.nextLayer ? `下一层：${o.nextLayer.name}${o.nextLayer.lockText ? `（需${o.nextLayer.lockText}）` : ''}` : '已是最深处';
    return {
        label: o.name,
        icon: TEX.dir(o.dir),
        tags: o.thread
            ? [{ text: '后续', color: COLOR.legacy, filled: true }, { text: o.layerName, color: COLOR.ochreD }]
            : [{ text: o.layerName, color: COLOR.ochreD }],
        sub: o.thread ? `后续：${o.thread}` : o.preview ? `探路：${o.preview}` : next,
        subColor: o.thread ? COLOR.legacy : o.preview ? COLOR.skill : undefined,
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
    const tools: { id: 'items' | 'skills' | 'companions' | 'lines' | 'codex'; ic: string; label: string; badge: number; fn: () => void }[] = [
        { id: 'items', ic: '囊', label: '道具', badge: usableItems, fn: () => itemsPopup(g) },
        { id: 'skills', ic: '技', label: '技能', badge: usableSkills, fn: () => skillsPopup(g) },
        { id: 'companions', ic: '伴', label: '伙伴', badge: 0, fn: () => companionsPopup(g) },
        { id: 'codex', ic: '鉴', label: '图鉴', badge: 0, fn: () => codexPopup(g) },
    ];
    // 有故事线的命格才显示「故事」
    if (e.data.lines.size) tools.splice(3, 0, { id: 'lines', ic: '缘', label: '故事', badge: 0, fn: () => linesPopup(g) });
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
    showList(g, '道  具', entries, { emptyText: e.data.meta.rules.emptyItems ?? '你身边什么都没有。' });
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
        if (c) lines.push(`【${c.system ? '系统' : '伙伴'}】${c.name}\n${c.desc}`);
    }
    showInfo(g, '伙  伴', lines.length ? lines : ['这一世，你孤身一人。']);
}

function linesPopup(g: Game): void {
    const e = g.engine;
    const entries: ListEntry[] = e.lineViews().map(l => ({
        title: l.name, desc: `${l.state ? `眼下：${l.state}。` : ''}${l.summary}`,
        tag: l.state ? { text: '有进展', color: COLOR.legacy } : { text: '刚开始', color: COLOR.ink2 },
    }));
    showList(g, '这一世的故事', entries, { emptyText: '这一世的故事，还没有开始。' });
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
        ...(dp.codex.tianhu ? [`天胡 ${dp.codex.tianhu} 次`] : []),
        '',
        `传承：${legacies.length ? legacies.join('、') : '暂无'}`,
        `技能：${dp.skills.length ? dp.skills.map(id => e.skillName(id)).join('、') : '暂无'}`,
    ]);
}
