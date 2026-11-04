/** 剧本静态校验：引用完整性、可达性、可选性、文本长度 */
import { walkCond } from '../assets/scripts/core/condition';
import { buildDestiny, DataError } from '../assets/scripts/core/data';
import { Cond, Destiny, DestinyIndex, Effect, RARITIES, RawDestiny } from '../assets/scripts/core/types';

/** 引擎自己读取的 flag（不需要剧本条件检查） */
const ENGINE_FLAGS = ['tianhu'];

export const TEXT_LIMITS = { text: 60, choice: 14, result: 40, teaser: 18, feud: 16 };

export interface Report {
    errors: string[];
    warnings: string[];
    stats: Record<string, number>;
}

/** 所有命格的结局 id（跨命格条件 xend / xstage / xlives 校验用） */
export type World = Record<string, { endings: string[] }>;

export function validateDestiny(raw: RawDestiny, world?: World): Report {
    const errors: string[] = [];
    const warnings: string[] = [];
    let d: Destiny;
    try {
        d = buildDestiny(raw);
    } catch (e) {
        if (e instanceof DataError) return { errors: [e.message], warnings, stats: {} };
        throw e;
    }

    const flagsSet = new Set<string>();
    const flagsChecked = new Map<string, string>();
    const referencedEvents = new Set<string>();
    const skillsReferenced = new Set<string>();
    const skillSources = new Map<string, string[]>();
    const skillUses = new Set<string>();
    const addSource = (id: string, src: string) => {
        if (!d.skills.has(id)) errors.push(`${src}: 引用了不存在的技能 ${id}`);
        skillSources.set(id, [...(skillSources.get(id) ?? []), src]);
    };

    /** xend 的 id：命格id 或 命格id/结局id；未提供 world 时只检查格式 */
    const checkWorld = (id: string): boolean => {
        const [did, eid] = id.split('/');
        if (!world) return !!did;
        const w = world[did];
        return !!w && (!eid || w.endings.includes(eid));
    };
    /** 文本占位 {died:x} 必须是本命格的死法 */
    const checkText = (s: string | undefined, where: string) => {
        for (const m of (s ?? '').matchAll(/\{died:(\w+)\}/g)) if (!d.deaths.has(m[1])) errors.push(`${where}: 文本占位 {died:${m[1]}} 不是本命格的死法`);
    };
    /** 线路引用：线路id 或 线路id.状态（状态必须在 states 里导出） */
    const statesRead = new Set<string>();
    const statesSet = new Set<string>();
    const checkLineRef = (id: string, where: string, mode: 'read' | 'set'): boolean => {
        const [line, state] = id.split('.');
        const l = d.lines.get(line);
        if (!l) return false;
        if (state === undefined) return mode === 'read';
        if (!(state in l.states)) {
            errors.push(`${where}: 线路 ${line} 没有导出状态「${state}」（在 states 里登记）`);
            return true;
        }
        (mode === 'read' ? statesRead : statesSet).add(id);
        return true;
    };
    const checkCond = (c: Cond | undefined, where: string) => {
        if (!c) return;
        walkCond(c.ast, leaf => {
            if (leaf.t === 'has') {
                const id = leaf.id;
                const ok =
                    leaf.kind === 'flag' ? (flagsChecked.set(id, where), true) :
                    leaf.kind === 'talent' ? d.talents.has(id) :
                    leaf.kind === 'item' ? d.items.has(id) :
                    leaf.kind === 'companion' ? d.companions.has(id) :
                    leaf.kind === 'skill' ? (skillsReferenced.add(id), d.skills.has(id)) :
                    leaf.kind === 'seen' ? d.events.has(id) :
                    leaf.kind === 'dead' ? d.deaths.has(id) :
                    leaf.kind === 'xend' ? checkWorld(id) :
                    leaf.kind === 'line' || leaf.kind === 'ever' ? checkLineRef(id, where, 'read') :
                    leaf.kind === 'system' ? id === 'any' || !!d.companions.get(id)?.system :
                    leaf.kind === 'career' ? id === 'any' || d.careers.has(id) :
                    leaf.kind === 'pastcareer' ? d.careers.has(id) :
                    d.endings.has(id);
                if (!ok) errors.push(`${where}: 条件引用了不存在的 ${leaf.kind}:${id}`);
            } else if (leaf.left.kind === 'legacy' && !d.legacies.has(leaf.left.id!)) {
                errors.push(`${where}: 条件引用了不存在的传承 legacy:${leaf.left.id}`);
            } else if (leaf.left.kind === 'died' && !d.deaths.has(leaf.left.id!)) {
                errors.push(`${where}: 条件引用了不存在的死法 died:${leaf.left.id}`);
            } else if ((leaf.left.kind === 'xstage' || leaf.left.kind === 'xlives') && !checkWorld(leaf.left.id!)) {
                errors.push(`${where}: 条件引用了不存在的命格 ${leaf.left.kind}:${leaf.left.id}`);
            } else if ((leaf.left.kind === 'xstage' || leaf.left.kind === 'xlives') && leaf.left.id === d.meta.id) {
                errors.push(`${where}: ${leaf.left.kind} 用于跨命格，本命格请用 stage / life`);
            }
        });
    };

    const endingsUsed = new Set<string>();
    const followed = new Set<string>();
    const checkEffect = (e: Effect, where: string) => {
        e.flags.forEach(f => flagsSet.add(f));
        for (const it of [...e.items, ...e.loseItems]) if (!d.items.has(it)) errors.push(`${where}: 效果引用了不存在的道具 ${it}`);
        if (e.death && !d.deaths.has(e.death)) errors.push(`${where}: 不存在的死法 ${e.death}`);
        if (e.ending) {
            endingsUsed.add(e.ending);
            if (!d.endings.has(e.ending)) errors.push(`${where}: 不存在的结局 ${e.ending}`);
        }
        if (e.back && !['up', 'down', 'side'].includes(e.back)) errors.push(`${where}: back 只能是 up/down/side`);
        for (const st of e.states) {
            if (!st.includes('.')) errors.push(`${where}: 线路外的 state 要写成「线路id.状态」：${st}`);
            else if (!checkLineRef(st, where, 'set')) errors.push(`${where}: state 引用了不存在的线路 ${st}`);
        }
        if (e.career && !d.careers.has(e.career)) errors.push(`${where}: career 引用了不存在的职业 ${e.career}`);
        if (e.bind && !d.companions.get(e.bind)?.system) errors.push(`${where}: bind 的 ${e.bind} 不是系统（companions 里需 system: true）`);
        for (const sk of e.skills) addSource(sk, where);
        for (const f of e.follows) {
            referencedEvents.add(f.id);
            followed.add(f.id);
            if (!d.events.has(f.id)) errors.push(`${where}: follow 指向不存在的事件 ${f.id}`);
            if (f.delay < 0 || f.ttl < 1) errors.push(`${where}: follow ${f.id} 的 delay 需 ≥0、ttl 需 ≥1`);
        }
    };

    // {died:x} 占位渲染后只有一两位数字
    const len = (s: string | undefined) => (s ? [...s.replace(/\{died:\w+\}/g, '9')].length : 0);

    // 命格元数据
    // 命格规则：引用的属性 / 死法必须存在
    const R = d.meta.rules;
    if (!R) errors.push('destiny.json 缺少 rules');
    else {
        for (const [k, id] of [['life', R.life], ['lifeMax', R.lifeMax], ['regen.from', R.regen?.from], ['growth', R.growth], ['yield.from', R.yield?.from]] as const) {
            if (!id || !d.attrNames[id]) errors.push(`rules.${k} 引用了不存在的属性「${id}」`);
        }
        for (const [k, id] of [['lifeDeath', R.lifeDeath], ['oldAgeDeath', R.oldAgeDeath]] as const) {
            if (!d.deaths.has(id)) errors.push(`rules.${k} 引用了不存在的死法「${id}」`);
        }
        if (!(R.regen?.per > 0) || !(R.yield?.per > 0)) errors.push('rules.regen.per / rules.yield.per 必须大于 0');
        if (!R.startLog) errors.push('rules.startLog 不能为空');
        if (R.careerEvent) {
            referencedEvents.add(R.careerEvent);
            const ce = d.events.get(R.careerEvent);
            if (!ce) errors.push(`rules.careerEvent 指向不存在的事件 ${R.careerEvent}`);
            else if (ce.choices.some(c => !c.success.effect.career)) errors.push(`rules.careerEvent ${R.careerEvent}: 每个选项都要写 career`);
            if (!d.careers.size) errors.push('rules.careerEvent 需要 meta.careers');
        }
        if (R.lastStand) {
            referencedEvents.add(R.lastStand);
            if (!d.events.has(R.lastStand)) errors.push(`rules.lastStand 指向不存在的事件 ${R.lastStand}`);
        }
    }
    for (const death of d.deaths.values()) {
        if (death.legacy && !d.legacies.has(death.legacy)) errors.push(`死法 ${death.id}: 传承 ${death.legacy} 不存在`);
        if (!death.legacy) warnings.push(`死法 ${death.id} 没有传承（违背「死亡即成长」）`);
        for (const sc of death.skillConds) {
            addSource(sc.id, `死法 ${death.id}`);
            checkCond(sc.cond, `死法 ${death.id}.skills`);
        }
        death.variantConds.forEach((v, i) => checkCond(v.cond, `死法 ${death.id}.variants[${i}]`));
    }
    for (const dir of ['up', 'down', 'side'] as const) if (!d.layersByDir[dir].length) errors.push(`方向 ${dir} 没有任何层`);
    for (const l of d.layers.values()) {
        checkCond(l.cond, `层 ${l.id}`);
        if (l.enterEvent) {
            referencedEvents.add(l.enterEvent);
            if (!d.events.has(l.enterEvent)) errors.push(`层 ${l.id}: enterEvent ${l.enterEvent} 不存在`);
        }
    }
    for (const s of d.stages) {
        checkCond(s.cond, `境界 ${s.level}`);
        for (const sk of s.skillPool ?? []) addSource(sk, `境界 ${s.level}.skillPool`);
        if (s.bonusEffect) checkEffect(s.bonusEffect, `境界 ${s.level}.bonus`);
        for (const e of s.oldAgeEndingConds ?? []) {
            endingsUsed.add(e.id);
            checkCond(e.cond, `境界 ${s.level}.oldAgeEndings`);
            if (!d.endings.has(e.id)) errors.push(`境界 ${s.level}: 寿终结局 ${e.id} 不存在`);
        }
        (s.endingConds ?? []).forEach((e, i, all) => {
            endingsUsed.add(e.id);
            checkCond(e.cond, `境界 ${s.level}.endings`);
            if (!d.endings.has(e.id)) errors.push(`境界 ${s.level}: 结局 ${e.id} 不存在`);
            if (!e.cond && i < all.length - 1) errors.push(`境界 ${s.level}: 无条件结局 ${e.id} 不是最后一个，后面的结局永远达不成`);
        });
    }
    for (const dd of d.dirs) checkCond(dd.cond, `方向 ${dd.id}`);

    // 三池
    for (const [name, pool] of [['天赋', d.talents], ['道具', d.items], ['伴生物', d.companions]] as const) {
        if (pool.size < 3) errors.push(`${name}池少于 3 个`);
        for (const x of pool.values()) if (!RARITIES.includes(x.rarity)) errors.push(`${name} ${x.id}: 未知稀有度 ${x.rarity}`);
    }
    for (const c of d.companions.values()) if (c.everyEffect) checkEffect(c.everyEffect, `伴生物 ${c.id}`);

    // 天命之子（天胡通道）
    const B = d.meta.blessed;
    if (B) {
        if (!(B.chance > 0 && B.chance <= 0.05)) warnings.push(`blessed.chance=${B.chance}，建议 0~5%（天胡要稀有）`);
        if (d.blessedStart) checkEffect(d.blessedStart, '天命之子');
        if (B.chain) {
            referencedEvents.add(B.chain);
            if (!d.events.has(B.chain)) errors.push(`blessed.chain 指向不存在的事件 ${B.chain}`);
        }
    }

    // 出生地图
    for (const m of d.maps.values()) {
        if (m.startEffect) checkEffect(m.startEffect, `地图 ${m.id}`);
        for (const lid of Object.keys(m.layers ?? {})) if (!d.layers.has(lid)) errors.push(`地图 ${m.id}: 覆盖了不存在的层 ${lid}`);
    }

    // 职业
    for (const c of d.careers.values()) {
        if (c.startEffect) checkEffect(c.startEffect, `职业 ${c.id}`);
        for (const lid of Object.keys(c.layers ?? {})) if (!d.layers.has(lid)) errors.push(`职业 ${c.id}: 覆盖了不存在的层 ${lid}`);
    }

    // 事件
    for (const ev of d.events.values()) {
        const w = `事件 ${ev.id}`;
        checkCond(ev.require, `${w}.require`);
        for (const m of ev.maps ?? []) if (!d.maps.has(m)) errors.push(`${w}: 地图 ${m} 不存在`);
        for (const c of ev.careers ?? []) if (!d.careers.has(c)) errors.push(`${w}: 职业 ${c} 不存在`);
        for (const l of ev.layers ?? []) {
            const layer = d.layers.get(l);
            if (!layer) errors.push(`${w}: 层 ${l} 不存在`);
            else if (ev.dir !== 'any' && layer.dir !== ev.dir) errors.push(`${w}: 层 ${l} 不属于方向 ${ev.dir}`);
        }
        if (len(ev.text) > TEXT_LIMITS.text) warnings.push(`${w}: 正文 ${len(ev.text)} 字，超过 ${TEXT_LIMITS.text}`);
        checkText(ev.text, w);
        checkText(ev.teaser, `${w}.teaser`);
        if (ev.cameo) {
            let cross = false;
            if (ev.require) walkCond(ev.require.ast, l => { if ((l.t === 'has' && l.kind === 'xend') || (l.t === 'cmp' && (l.left.kind === 'xstage' || l.left.kind === 'xlives'))) cross = true; });
            if (!cross) warnings.push(`${w}: cameo 彩蛋事件的 require 里没有跨命格条件（xend / xstage / xlives）`);
        }
        const selectable = ev.choices.some(c => !c.require && !c.showIf);
        if (!selectable) errors.push(`${w}: 没有无条件可选的选项，玩家可能卡死`);
        ev.choices.forEach((c, i) => {
            const cw = `${w}.choices[${i}]`;
            checkCond(c.require, `${cw}.require`);
            checkCond(c.showIf, `${cw}.showIf`);
            if (len(c.text) > TEXT_LIMITS.choice) warnings.push(`${cw}: 选项「${c.text}」${len(c.text)} 字，超过 ${TEXT_LIMITS.choice}`);
            checkText(c.text, cw);
            if (c.absurd && c.chance === undefined) warnings.push(`${cw}: 离谱选项建议带成功率（chance + fail）`);
            if (c.easy && (c.chance === undefined || !c.chanceAttr)) warnings.push(`${cw}: easy 碾压文案只在成功率可溢出（chanceAttr）时生效`);
            if (len(c.easy) > TEXT_LIMITS.result) warnings.push(`${cw}: 碾压文案 ${len(c.easy)} 字，超过 ${TEXT_LIMITS.result}`);
            for (const o of [c.success, c.fail]) {
                if (!o) continue;
                checkEffect(o.effect, cw);
                if (len(o.result) > TEXT_LIMITS.result) warnings.push(`${cw}: 结果 ${len(o.result)} 字，超过 ${TEXT_LIMITS.result}`);
                checkText(o.result, cw);
                for (const f of o.effect.feuds) if (len(f) > TEXT_LIMITS.feud) warnings.push(`${cw}: 恩怨「${f}」${len(f)} 字，超过 ${TEXT_LIMITS.feud}`);
                if (o.next) {
                    referencedEvents.add(o.next);
                    if (!d.events.has(o.next)) errors.push(`${cw}: next 指向不存在的事件 ${o.next}`);
                }
                if (!o.next && !o.result) warnings.push(`${cw}: 没有结果文本`);
            }
            if (c.useSkill) {
                skillUses.add(c.useSkill);
                if (!d.skills.has(c.useSkill)) errors.push(`${cw}: useSkill 不存在的技能 ${c.useSkill}`);
                if (!c.showIf && !c.require) warnings.push(`${cw}: 技能选项建议加 showIf: "skill:${c.useSkill}"`);
            }
            if (c.chance !== undefined && !c.fail) errors.push(`${cw}: 有 chance 但没有 fail`);
            if (c.fail && c.chance === undefined) errors.push(`${cw}: 有 fail 但没有 chance`);
        });
        if (ev.chainOnly && !referencedEvents.has(ev.id)) {
            // 二次检查在循环后
        }
    }
    for (const ev of d.events.values()) {
        if (ev.chainOnly && !referencedEvents.has(ev.id)) errors.push(`事件 ${ev.id}: chainOnly 但没有任何 next/enterEvent/follow 指向它`);
        if (followed.has(ev.id) && !ev.teaser) warnings.push(`事件 ${ev.id}: 作为后续事件，建议写 teaser 预告`);
        if (len(ev.teaser) > TEXT_LIMITS.teaser) warnings.push(`事件 ${ev.id}: teaser ${len(ev.teaser)} 字，超过 ${TEXT_LIMITS.teaser}`);
    }

    // 技能：每个技能都要有获得途径；交互型技能必须有事件用到
    for (const s of d.skills.values()) {
        if (s.useEffect) checkEffect(s.useEffect, `技能 ${s.id}`);
        if (!skillSources.has(s.id)) errors.push(`技能 ${s.id}「${s.name}」没有任何解锁途径（死法/境界/选择）`);
        if (!s.use && !skillUses.has(s.id)) errors.push(`技能 ${s.id}「${s.name}」是交互型，但没有任何事件选项 useSkill 它`);
        if (s.cd < 1) errors.push(`技能 ${s.id}: cd 至少为 1`);
    }
    if (d.meta.settings.skillSlots === undefined) errors.push('settings 缺少 skillSlots');

    // flag 一致性
    for (const id of d.endings.keys()) if (!endingsUsed.has(id)) errors.push(`结局 ${id} 没有任何触发途径（境界 endings / 事件效果 ending）`);
    for (const [f, where] of flagsChecked) if (!flagsSet.has(f)) errors.push(`${where}: 检查了 flag:${f}，但没有任何效果设置它`);
    for (const f of flagsSet) if (!flagsChecked.has(f) && !ENGINE_FLAGS.includes(f)) warnings.push(`flag:${f} 被设置了，但没有任何条件用到它`);

    // 线路：要有入口；读到的状态要有地方设置；导出了没人读的给提示
    for (const l of raw.lines ?? []) {
        if (!l.events?.some(ev => ev.entry || !ev.chainOnly)) errors.push(`线路 ${l.id}: 没有入口事件（entry: true 或非 chainOnly）`);
        if (!Object.keys(l.states ?? {}).length) warnings.push(`线路 ${l.id}: 没有导出任何状态，别的线路无法和它交叉`);
        for (const st of Object.keys(l.states ?? {})) {
            const id = `${l.id}.${st}`;
            if (!statesSet.has(id)) warnings.push(`线路 ${l.id}: 导出状态「${st}」没有任何效果设置它`);
            else if (!statesRead.has(id)) warnings.push(`线路 ${l.id}: 导出状态「${st}」没有被任何条件用到`);
        }
    }
    for (const id of statesRead) if (!statesSet.has(id)) errors.push(`条件用到了线路状态 ${id}，但没有任何效果设置它`);
    for (const ev of d.events.values()) {
        if (!ev.cross) continue;
        const lines = new Set<string>();
        // 职业（career / pastcareer）也算一条线
        if (ev.require) walkCond(ev.require.ast, l => {
            if (l.t === 'has' && (l.kind === 'line' || l.kind === 'ever')) lines.add(l.id.split('.')[0]);
            if (l.t === 'has' && (l.kind === 'career' || l.kind === 'pastcareer')) lines.add(`@${l.id}`);
        });
        if (lines.size < 2) warnings.push(`事件 ${ev.id}: 交叉事件的 require 只引用了 ${lines.size} 条线路/职业`);
    }

    // 层覆盖：每层（不算兜底/any）至少 2 个专属事件
    for (const l of d.layers.values()) {
        const n = [...d.events.values()].filter(e => !e.sudden && !e.chainOnly && e.layers?.includes(l.id)).length;
        if (n < 2) warnings.push(`层 ${l.id}「${l.name}」只有 ${n} 个专属事件`);
    }
    // 兜底：每个方向（有职业时：每个职业 × 方向）都要有无层、无条件、全境界的事件，否则抽不到事件会卡死
    const careerIds = d.careers.size ? [...d.careers.keys()] : [undefined];
    for (const cid of careerIds) {
        for (const dir of ['up', 'down', 'side'] as const) {
            const hasFallback = [...d.events.values()].some(e => e.dir === dir && !e.layers && !e.maps && !e.require && !e.sudden && !e.chainOnly && e.stage[0] === 0 && e.stage[1] >= 99
                && (!e.careers || (!!cid && e.careers.includes(cid))));
            if (!hasFallback) errors.push(`${cid ? `职业 ${cid} ` : ''}方向 ${dir} 缺少兜底事件（无层、无条件、全境界）`);
        }
    }
    // 职业层覆盖：每个职业每层至少 2 个可抽的专属事件（含通用事件）
    for (const cid of careerIds) {
        if (!cid) break;
        for (const l of d.layers.values()) {
            const n = [...d.events.values()].filter(e => !e.sudden && !e.chainOnly && e.layers?.includes(l.id) && (!e.careers || e.careers.includes(cid))).length;
            if (n < 2) warnings.push(`职业 ${cid} 层 ${l.id} 只有 ${n} 个专属事件`);
        }
    }

    const evs = [...d.events.values()];
    return {
        errors,
        warnings,
        stats: {
            事件: evs.length,
            突发: evs.filter(e => e.sudden).length,
            金色: evs.filter(e => e.gold).length,
            选项: evs.reduce((n, e) => n + e.choices.length, 0),
            天赋: d.talents.size,
            道具: d.items.size,
            伴生物: d.companions.size,
            技能: d.skills.size,
            技能交互: evs.reduce((n, e) => n + e.choices.filter(c => c.useSkill).length, 0),
            死法: d.deaths.size,
            传承: d.legacies.size,
            结局: d.endings.size,
            地图: d.maps.size,
            职业: d.careers.size,
            彩蛋: evs.filter(e => e.cameo).length,
            离谱: evs.reduce((n, e) => n + e.choices.filter(c => c.absurd).length, 0),
            线路: d.lines.size,
            交叉: evs.filter(e => e.cross).length,
            系统: [...d.companions.values()].filter(c => c.system).length,
        },
    };
}

/** 命格索引校验：id 唯一且有对应目录、解锁条件引用合法、至少一个默认开放 */
export function validateIndex(index: DestinyIndex, dirs: string[]): string[] {
    const errors: string[] = [];
    const ids = index.destinies.map(d => d.id);
    if (!ids.length) errors.push('index.json 没有任何命格');
    if (new Set(ids).size !== ids.length) errors.push('index.json 里有重复的命格 id');
    for (const d of index.destinies) {
        if (!dirs.includes(d.id)) errors.push(`index.json 的命格 ${d.id} 没有对应的剧本目录`);
        const b = d.unlock?.bestStage;
        if (b && !ids.includes(b.destiny)) errors.push(`命格 ${d.id} 的解锁条件引用了不存在的命格 ${b.destiny}`);
        if (d.unlock && !d.unlock.text) errors.push(`命格 ${d.id} 的解锁条件缺少说明 text`);
    }
    if (!index.destinies.some(d => !d.unlock)) errors.push('至少要有一个默认开放（无 unlock）的命格');
    for (const dir of dirs) if (!ids.includes(dir)) errors.push(`剧本目录 ${dir} 没有登记到 index.json，游戏里选不到`);
    return errors;
}
