/** 把剧本原始 JSON 归一化为引擎数据：解析条件、解析效果、属性中文名 → id。 */
import { parseCond } from './condition';
import type {
    Choice, Cond, Destiny, Dir, Effect, GameEvent, Outcome, RawChoice, RawDestiny, RawEffect, RawEvent, RawFollow, RawLine, RawOutcome,
} from './types';

/** 效果中的保留键，其余键视为属性增量 */
export const RESERVED_EFFECT_KEYS = ['flag', 'unflag', 'item', 'loseItem', 'skill', 'death', 'ending', 'back', 'follow', 'stageUp', 'feud', 'state', 'bind', 'unbind', 'keepSystem', 'career'] as const;

/** 线路内的事件 / flag 引用：不带「/」的 id 加上线路前缀 */
const localId = (line: string, id: string) => (id.includes('/') ? id : `${line}/${id}`);

/** 改写线路内条件：flag:x / seen:x → flag:线路/x（已带「/」的不动） */
function localCond(line: string, src: string | undefined): string | undefined {
    if (!src) return src;
    return src.replace(/(^|[\s()&|!])(flag|seen):([^\s()&|!<>=]+)/g, (_m, pre: string, k: string, id: string) => `${pre}${k}:${localId(line, id)}`);
}

function localEffect(line: string, e: RawEffect | undefined): RawEffect | undefined {
    if (!e) return e;
    const out: RawEffect = { ...e };
    const list = (v: unknown) => (Array.isArray(v) ? v : [v]).map(x => localId(line, String(x)));
    if (e.flag !== undefined) out.flag = list(e.flag);
    if (e.unflag !== undefined) out.unflag = list(e.unflag);
    if (e.state !== undefined) out.state = (Array.isArray(e.state) ? e.state : [e.state]).map(x => (String(x).includes('.') ? String(x) : `${line}.${x}`));
    if (e.follow !== undefined) {
        const fs = Array.isArray(e.follow) ? e.follow : [e.follow];
        out.follow = (fs as RawFollow[]).map(f => (typeof f === 'string' ? localId(line, f) : { ...f, id: localId(line, f.id) }));
    }
    return out;
}

/** 把线路展开成普通事件（加命名空间、入口条件、默认 maps / stage） */
export function flattenLine(l: RawLine): (RawEvent & { line: string })[] {
    const L = l.id;
    const outcome = <T extends RawOutcome>(o: T): T => ({ ...o, effect: localEffect(L, o.effect), next: o.next && localId(L, o.next) });
    return l.events.map(ev => {
        const require = localCond(L, ev.require);
        return {
            ...ev,
            id: localId(L, ev.id),
            line: L,
            maps: ev.maps ?? l.maps,
            careers: ev.careers ?? l.careers,
            stage: ev.stage ?? (ev.entry ? l.stage : undefined),
            require: ev.entry ? (require ? `!line:${L} & (${require})` : `!line:${L}`) : require,
            choices: ev.choices.map(c => ({
                ...outcome(c),
                require: localCond(L, c.require),
                showIf: localCond(L, c.showIf),
                fail: c.fail && outcome(c.fail),
            })),
        };
    });
}

export class DataError extends Error {}

export function buildDestiny(raw: RawDestiny): Destiny {
    const { meta } = raw;
    const attrNames: Record<string, string> = {};
    const alias = new Map<string, string>();
    for (const a of meta.attrs) {
        attrNames[a.id] = a.name;
        alias.set(a.id, a.id);
        alias.set(a.name, a.id);
    }
    const resolveAttr = (n: string) => alias.get(n);

    const cond = (src: string | undefined, where: string): Cond | undefined => {
        if (!src) return undefined;
        try {
            return { src, ast: parseCond(src, resolveAttr) };
        } catch (e) {
            throw new DataError(`${where}: ${(e as Error).message}`);
        }
    };

    /** follow: "id" | ["id", …] | { id, delay?, ttl? } | [{…}] */
    const toFollows = (v: unknown, where: string) => (Array.isArray(v) ? v : [v]).map(x => {
        if (typeof x === 'string') return { id: x, delay: 1, ttl: 4 };
        const o = x as { id?: string; delay?: number; ttl?: number };
        if (!o || typeof o.id !== 'string') throw new DataError(`${where}: follow 格式应为 "事件id" 或 { "id": "...", "delay": 1, "ttl": 4 }`);
        return { id: o.id, delay: o.delay ?? 1, ttl: o.ttl ?? 4 };
    });
    const toList = (v: unknown): string[] => (v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

    const effect = (r: RawEffect | undefined, where: string): Effect => {
        const e: Effect = { attrs: {}, flags: [], unflags: [], items: [], loseItems: [], skills: [], follows: [], feuds: [], states: [] };
        if (!r) return e;
        for (const [k, v] of Object.entries(r)) {
            switch (k) {
                case 'flag': e.flags = toList(v); break;
                case 'unflag': e.unflags = toList(v); break;
                case 'item': e.items = toList(v); break;
                case 'loseItem': e.loseItems = toList(v); break;
                case 'skill': e.skills = toList(v); break;
                case 'death': e.death = String(v); break;
                case 'ending': e.ending = String(v); break;
                case 'back': e.back = String(v) as Dir; break;
                case 'stageUp': e.stageUp = Number(v); break;
                case 'follow': e.follows = toFollows(v, where); break;
                case 'feud': e.feuds = toList(v); break;
                case 'state': e.states = toList(v); break;
                case 'bind': e.bind = String(v); break;
                case 'unbind': e.unbind = !!v; break;
                case 'keepSystem': e.keepSystem = !!v; break;
                case 'career': e.career = String(v); break;
                default: {
                    const id = resolveAttr(k);
                    if (!id) throw new DataError(`${where}: 效果中未知属性「${k}」`);
                    if (typeof v !== 'number') throw new DataError(`${where}: 属性「${k}」的值必须是数字`);
                    e.attrs[id] = (e.attrs[id] ?? 0) + v;
                }
            }
        }
        return e;
    };

    const outcome = (r: RawOutcome | undefined, where: string): Outcome => ({
        effect: effect(r?.effect, where),
        result: r?.result,
        next: r?.next,
    });

    const choice = (c: RawChoice, where: string): Choice => ({
        text: c.text,
        require: cond(c.require, `${where}.require`),
        showIf: cond(c.showIf, `${where}.showIf`),
        success: outcome(c, where),
        chance: c.chance,
        chanceAttr: c.chanceAttr ? resolveAttr(c.chanceAttr) ?? fail(`${where}: chanceAttr 未知属性「${c.chanceAttr}」`) : undefined,
        chanceStep: c.chanceStep,
        fail: c.fail ? outcome(c.fail, `${where}.fail`) : undefined,
        useSkill: c.useSkill,
        easy: c.easy,
        absurd: c.absurd,
    });

    function fail(msg: string): never { throw new DataError(msg); }

    const events = new Map<string, GameEvent>();
    const all: (RawEvent & { line?: string; cross?: boolean })[] = [
        ...raw.events,
        ...(raw.lines ?? []).flatMap(flattenLine),
        ...(raw.crossings ?? []).map(ev => ({ ...ev, cross: true })),
    ];
    for (const ev of all) {
        if (events.has(ev.id)) fail(`事件 id 重复：${ev.id}`);
        events.set(ev.id, normEvent(ev));
    }
    const lineIds = new Set<string>();
    for (const l of raw.lines ?? []) {
        if (lineIds.has(l.id)) fail(`线路 id 重复：${l.id}`);
        if (l.id.includes('/') || l.id.includes('.')) fail(`线路 id 不能含「/」「.」：${l.id}`);
        lineIds.add(l.id);
    }
    function normEvent(ev: RawEvent & { line?: string; cross?: boolean }): GameEvent {
        const where = `事件 ${ev.id}`;
        if (!ev.choices?.length) fail(`${where}: 没有选项`);
        return {
            id: ev.id,
            dir: ev.dir,
            layers: ev.layers,
            stage: ev.stage ?? [0, 99],
            weight: ev.weight ?? 10,
            once: ev.once ?? false,
            sudden: ev.sudden ?? false,
            gold: ev.gold ?? false,
            chainOnly: ev.chainOnly ?? false,
            maps: ev.maps,
            careers: ev.careers,
            teaser: ev.teaser,
            cameo: ev.cameo ?? false,
            line: ev.line,
            cross: ev.cross ?? false,
            require: cond(ev.require, `${where}.require`),
            text: ev.text,
            choices: ev.choices.map((c, i) => choice(c, `${where}.choices[${i}]`)),
        };
    }

    const layers = new Map(meta.layers.map(l => [l.id, { ...l, cond: cond(l.require, `层 ${l.id}`) }]));
    const layersByDir = { up: [], down: [], side: [] } as Destiny['layersByDir'];
    for (const l of layers.values()) layersByDir[l.dir].push(l);

    return {
        meta,
        attrNames,
        talents: new Map(raw.talents.map(t => [t.id, { ...t, startEffect: t.start ? effect(t.start, `天赋 ${t.id}`) : undefined }])),
        items: new Map(raw.items.map(t => [t.id, { ...t, useEffect: t.use ? effect(t.use, `道具 ${t.id}`) : undefined }])),
        companions: new Map(raw.companions.map(t => [t.id, {
            ...t,
            startEffect: t.start ? effect(t.start, `伴生物 ${t.id}`) : undefined,
            everyEffect: t.every ? effect(t.every.effect, `伴生物 ${t.id}.every`) : undefined,
        }])),
        events,
        layers,
        layersByDir,
        dirs: meta.dirs.map(d => ({ ...d, cond: cond(d.require, `方向 ${d.id}`) })),
        stages: [...meta.stages].sort((a, b) => a.level - b.level).map(s => ({
            ...s,
            cond: cond(s.require, `境界 ${s.level}`),
            bonusEffect: s.bonus ? effect(s.bonus, `境界 ${s.level}.bonus`) : undefined,
            endingConds: s.endings?.map(e => ({ id: e.id, cond: cond(e.require, `境界 ${s.level}.endings`) })),
            oldAgeEndingConds: s.oldAgeEndings?.map(e => ({ id: e.id, cond: cond(e.require, `境界 ${s.level}.oldAgeEndings`) })),
        })),
        deaths: new Map(meta.deaths.map(d => [d.id, {
            ...d,
            skillConds: (d.skills ?? []).map(sc => ({ id: sc.id, chance: sc.chance ?? 1, cond: cond(sc.require, `死法 ${d.id}.skills`) })),
            variantConds: (d.variants ?? []).map((v, i) => ({ name: v.name, epitaph: v.epitaph, cond: cond(v.require, `死法 ${d.id}.variants[${i}]`) })),
        }])),
        skills: new Map((raw.skills ?? []).map(s => [s.id, { ...s, useEffect: s.effect ? effect(s.effect, `技能 ${s.id}`) : undefined }])),
        legacies: new Map(meta.legacies.map(l => [l.id, { ...l, levelEffects: (l.levels ?? []).map((e, i) => effect(e, `传承 ${l.id}[${i}]`)) }])),
        endings: new Map(meta.endings.map(e => [e.id, e])),
        upgrades: new Map((meta.upgrades ?? []).map(u => {
            if (!u.costs?.length) fail(`命盘 ${u.id}: costs 不能为空`);
            return [u.id, { ...u, kind: u.kind ?? 'start', startEffect: u.start ? effect(u.start, `命盘 ${u.id}`) : undefined }];
        })),
        fates: new Map((meta.fates ?? []).map(f => [f.id, { ...f, startEffect: f.start ? effect(f.start, `天命 ${f.id}`) : undefined }])),
        blessedStart: meta.blessed?.start ? effect(meta.blessed.start, '天命之子') : undefined,
        maps: new Map((meta.maps ?? []).map(m => [m.id, { ...m, startEffect: m.start ? effect(m.start, `地图 ${m.id}`) : undefined }])),
        careers: new Map((meta.careers ?? []).map(c => [c.id, { ...c, startEffect: c.start ? effect(c.start, `职业 ${c.id}`) : undefined }])),
        lines: new Map((raw.lines ?? []).map(l => [l.id, { id: l.id, name: l.name, summary: l.summary, states: l.states ?? {} }])),
    };
}
