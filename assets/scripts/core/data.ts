/** 把剧本原始 JSON 归一化为引擎数据：解析条件、解析效果、属性中文名 → id。 */
import { parseCond } from './condition';
import type {
    Choice, Cond, Destiny, Dir, Effect, GameEvent, Outcome, RawChoice, RawDestiny, RawEffect, RawEvent, RawOutcome,
} from './types';

/** 效果中的保留键，其余键视为属性增量 */
export const RESERVED_EFFECT_KEYS = ['flag', 'unflag', 'item', 'loseItem', 'skill', 'death', 'ending', 'back', 'follow'] as const;

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
        const e: Effect = { attrs: {}, flags: [], unflags: [], items: [], loseItems: [], skills: [], follows: [] };
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
                case 'follow': e.follows = toFollows(v, where); break;
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
    });

    function fail(msg: string): never { throw new DataError(msg); }

    const events = new Map<string, GameEvent>();
    for (const ev of raw.events) {
        if (events.has(ev.id)) fail(`事件 id 重复：${ev.id}`);
        events.set(ev.id, normEvent(ev));
    }
    function normEvent(ev: RawEvent): GameEvent {
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
            teaser: ev.teaser,
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
        })),
        deaths: new Map(meta.deaths.map(d => [d.id, {
            ...d,
            skillConds: (d.skills ?? []).map(sc => ({ id: sc.id, chance: sc.chance ?? 1, cond: cond(sc.require, `死法 ${d.id}.skills`) })),
        }])),
        skills: new Map((raw.skills ?? []).map(s => [s.id, { ...s, useEffect: s.effect ? effect(s.effect, `技能 ${s.id}`) : undefined }])),
        legacies: new Map(meta.legacies.map(l => [l.id, { ...l, levelEffects: (l.levels ?? []).map((e, i) => effect(e, `传承 ${l.id}[${i}]`)) }])),
        endings: new Map(meta.endings.map(e => [e.id, e])),
        upgrades: new Map((meta.upgrades ?? []).map(u => {
            if (!u.costs?.length) fail(`命盘 ${u.id}: costs 不能为空`);
            return [u.id, { ...u, kind: u.kind ?? 'start', startEffect: u.start ? effect(u.start, `命盘 ${u.id}`) : undefined }];
        })),
        fates: new Map((meta.fates ?? []).map(f => [f.id, { ...f, startEffect: f.start ? effect(f.start, `天命 ${f.id}`) : undefined }])),
        maps: new Map((meta.maps ?? []).map(m => [m.id, { ...m, startEffect: m.start ? effect(m.start, `地图 ${m.id}`) : undefined }])),
    };
}
