import { describe, expect, it } from 'vitest';
import { buildDestiny, createProfile, Engine, RawDestiny, RawEvent } from '../assets/scripts/core';

/** 最小测试命格：只有向下方向，两层，第二层入口是必死门槛（需传承才能过） */
function fixture(extraEvents: RawEvent[] = []): RawDestiny {
    return {
        meta: {
            id: 'test', name: '测试', desc: '',
            attrs: [
                { id: 'water', name: '水分', init: 3 },
                { id: 'waterMax', name: '水分上限', init: 3, hidden: true },
                { id: 'root', name: '根系', init: 0 },
                { id: 'stem', name: '茎叶', init: 0 },
                { id: 'qi', name: '灵气', init: 0 },
            ],
            dirs: [{ id: 'down', name: '向下' }, { id: 'up', name: '向上', require: 'stage>=9' }, { id: 'side', name: '向旁', require: 'stage>=9' }],
            layers: [
                { id: 'D1', dir: 'down', name: '一层', span: 1, enterText: '', blockedText: '' },
                { id: 'D2', dir: 'down', name: '二层', span: 1, require: '根系>=1', enterText: '到了二层', blockedText: '挡住了', enterEvent: 'gate' },
                { id: 'U1', dir: 'up', name: '上', span: 1, enterText: '', blockedText: '' },
                { id: 'L1', dir: 'side', name: '旁', span: 1, enterText: '', blockedText: '' },
            ],
            stages: [
                { level: 0, name: '籽', narration: '', lifespan: 50 },
                { level: 1, name: '芽', require: '灵气>=50', narration: '破土', lifespan: 50, skillPool: ['burst'] },
                { level: 2, name: '树', require: '灵气>=100', narration: '成树', lifespan: 50, endings: [{ id: 'win' }] },
            ],
            deaths: [
                { id: 'thirst', name: '渴死', epitaph: '渴', legacy: 'cells', skills: [{ id: 'nap' }] },
                { id: 'old_age', name: '寿终', epitaph: '老' },
                { id: 'lava', name: '烤熟', epitaph: '熟', legacy: 'fire', skills: [{ id: 'lava_walk', require: 'legacy:fire>=2' }] },
            ],
            legacies: [
                { id: 'cells', name: '储水', desc: '', max: 2, levels: [{ 水分上限: 2 }, { 水分上限: 1 }] },
                { id: 'fire', name: '耐火', desc: '', max: 3 },
            ],
            endings: [{ id: 'win', name: '胜利', epitaph: '赢了' }],
            settings: { suddenChance: 0, rarityWeights: { common: 1, rare: 0, epic: 0, legend: 0 }, qiBase: 0, qiPerStem: 99, waterPerRoot: 99, skillSlots: 2 },
        },
        skills: [
            { id: 'burst', name: '爆发', desc: '', cd: 3, use: 'direction', effect: { 灵气: 10 }, hint: '' },
            { id: 'nap', name: '休眠', desc: '', cd: 2, use: 'direction', effect: { 水分: 2 }, hint: '' },
            { id: 'eye', name: '天眼', desc: '', cd: 2, use: 'event', reveal: true, hint: '' },
            { id: 'bind', name: '藤缚', desc: '', cd: 2, use: 'event', skip: true, useText: '捆了', hint: '' },
            { id: 'lava_walk', name: '熔岩行走', desc: '', cd: 2, hint: '' },
        ],
        talents: ['t1', 't2', 't3'].map(id => ({ id, name: id, rarity: 'common' as const, desc: '' })),
        items: [
            { id: 'shell', name: '壳', rarity: 'common', desc: '', saveFromDeath: true },
            { id: 'dew', name: '露', rarity: 'common', desc: '', use: { 水分: 2 } },
            { id: 'rock', name: '石', rarity: 'common', desc: '' },
        ],
        companions: ['c1', 'c2', 'c3'].map(id => ({ id, name: id, rarity: 'common' as const, desc: '' })),
        events: [
            { id: 'dig', dir: 'down', layers: ['D1'], text: '挖', choices: [{ text: '挖', effect: { 根系: 1 }, result: '挖了' }] },
            { id: 'deep', dir: 'down', layers: ['D2'], text: '深', choices: [{ text: '吸', effect: { 灵气: 100 }, result: '吸了' }] },
            { id: 'gate', dir: 'down', chainOnly: true, text: '热', choices: [
                { text: '冲', effect: { death: 'lava' } },
                { text: '耐火冲', require: 'legacy:fire>=1', effect: { 灵气: 1 }, result: '过了' },
                { text: '熔岩行走', showIf: 'skill:lava_walk', useSkill: 'lava_walk', effect: { 灵气: 5 }, result: '走过去了' },
            ] },
            { id: 'up_fb', dir: 'up', text: '.', choices: [{ text: '.', result: '.' }] },
            { id: 'side_fb', dir: 'side', text: '.', choices: [{ text: '.', result: '.' }] },
            ...extraEvents,
        ],
    };
}

const pick = { talent: 't1', item: 'rock', companion: 'c1' };

describe('引擎', () => {
    it('层推进触发门槛事件，必死后获得传承，下一世出现前世记忆并可通过', () => {
        const data = buildDestiny(fixture());
        const profile = createProfile();
        const e = new Engine(data, profile);

        e.startRun(pick, 1);
        expect(e.run.season).toBe(1);
        e.chooseDirection('down');
        expect(e.eventView().id).toBe('dig');
        const s1 = e.choose(0);
        expect(s1.messages).toContain('到了二层');
        expect(e.eventView().id).toBe('gate');
        // 传承不足：锁定的选项显示条件
        const locked = e.eventView().choices[1];
        expect(locked.enabled).toBe(false);
        expect(locked.lockText).toBe('传承·耐火≥1');
        e.choose(0);
        expect(e.run.phase).toBe('dying');
        const r1 = e.settle();
        expect(r1.title).toBe('烤熟');
        expect(r1.legacy).toMatchObject({ id: 'fire', level: 1, isNew: true });
        expect(r1.firstTime).toBe(true);
        expect(profile.points).toBeGreaterThan(0);

        // 第二世
        e.startRun(pick, 2);
        expect(e.run.life).toBe(2);
        e.chooseDirection('down');
        e.choose(0);
        const v = e.eventView();
        expect(v.choices[0].memory).toBe('前世：你在这里烤熟');
        expect(v.choices[1]).toMatchObject({ enabled: true, tag: '传承·耐火' });
        e.choose(1);
        expect(e.run.phase).toBe('direction');
        expect(e.run.pos.down).toBe(1);
    });

    it('结算页：明细、足迹、图鉴、下一世目标（因本次传承解锁的标记 ready）', () => {
        const data = buildDestiny(fixture());
        const e = new Engine(data, createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        e.choose(0);           // 挖 → 进入二层 → 门槛
        e.choose(0);           // 冲 → 烤熟；「耐火冲」被锁住 → 记为目标
        const s = e.settle();
        expect(s.breakdown.reduce((n, b) => n + b.value, 0)).toBe(s.points);
        expect(s.breakdown.map(b => b.label)).toContain('首次解锁死法');
        expect(s.explore.find(x => x.dir === 'down')).toMatchObject({ layer: '二层' });
        expect(s.attrs.map(a => a.id)).not.toContain('waterMax');
        expect(s.codex.deaths).toEqual([1, 3]);
        expect(s.goals).toEqual([{ text: '耐火冲', lock: '传承·耐火≥1', ready: true }]);
        expect(s.log[s.log.length - 1]).toMatch(/烤熟/);
    });

    it('传承的开局效果按等级累加', () => {
        const data = buildDestiny(fixture());
        const profile = createProfile();
        const e = new Engine(data, profile);
        e.dp.legacy.cells = 2;
        e.startRun(pick, 1);
        expect(e.run.attrs.waterMax).toBe(6);
        expect(e.run.attrs.water).toBe(6);
    });

    it('护身道具替你挡一次死亡；遗物封存后下一世开局携带', () => {
        const data = buildDestiny(fixture());
        const e = new Engine(data, createProfile());
        e.startRun({ ...pick, item: 'shell' }, 1);
        e.chooseDirection('down');
        e.choose(0);
        const s = e.choose(0); // 冲 → 本应死亡
        expect(s.lost).toContain('shell');
        expect(e.run.phase).toBe('direction');

        // 渴死 → 结算 → 封存
        e.run.attrs.water = 1;
        e.chooseDirection('down');
        e.choose(0); // 季末水分 -1 → 渴死
        expect(e.run.phase).toBe('dying');
        const r = e.settle();
        expect(r.title).toBe('渴死');
        expect(r.relicCandidates).toEqual(['rock', 'shell'].filter(x => r.relicCandidates.includes(x)));
        e.sealRelics(['shell', 'rock']); // 只有 1 格
        expect(e.dp.sealed).toEqual(['shell']);
        e.startRun(pick, 3);
        expect(e.run.items).toEqual(['rock', 'shell']);
        expect(e.dp.sealed).toEqual([]);
    });

    it('广告复活每局一次', () => {
        const data = buildDestiny(fixture());
        const e = new Engine(data, createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        e.choose(0);
        e.choose(0);
        expect(e.canReviveByAd()).toBe(true);
        e.reviveByAd();
        expect(e.run.phase).toBe('direction');
        expect(e.canReviveByAd()).toBe(false);
    });

    it('境界突破触发结局', () => {
        const data = buildDestiny(fixture());
        const profile = createProfile();
        const e = new Engine(data, profile);
        e.dp.legacy.fire = 1;
        e.startRun(pick, 1);
        e.chooseDirection('down'); e.choose(0); e.choose(1); // 过门槛
        e.chooseDirection('down');
        const s = e.choose(0); // 灵气 +100 → 季末突破 → 结局
        expect(s.messages.some(m => m.includes('结局'))).toBe(true);
        const r = e.settle();
        expect(r).toMatchObject({ kind: 'ending', id: 'win' });
        expect(e.dp.codex.endings).toEqual(['win']);
    });

    it('同种子同选择 → 完全相同的结果（可复现）', () => {
        const play = () => {
            const e = new Engine(buildDestiny(fixture()), createProfile());
            e.startRun(pick, 42);
            e.chooseDirection('down');
            e.choose(0);
            return JSON.stringify(e.run);
        };
        expect(play()).toBe(play());
    });

    it('局内状态可 JSON 序列化恢复', () => {
        const data = buildDestiny(fixture());
        const profile = createProfile();
        const e = new Engine(data, profile);
        e.startRun(pick, 7);
        e.chooseDirection('down');
        const saved = JSON.stringify(e.run);
        const e2 = new Engine(data, profile);
        e2.resume(JSON.parse(saved));
        expect(e2.eventView().id).toBe('dig');
        e.choose(0);
        e2.choose(0);
        expect(JSON.stringify(e2.run)).toBe(JSON.stringify(e.run));
    });
});

describe('技能', () => {
    /** 带一个事件：选项 0 领悟天眼；选项 1 冒险；选项 2 毒刺式交互 */
    const withEvents = () => buildDestiny(fixture([
        { id: 'teach', dir: 'any', layers: ['D1'], weight: 1000, text: '教学', choices: [
            { text: '学', effect: { skill: 'eye' }, result: '学会了' },
            { text: '冒险', chance: 0.05, effect: { 灵气: 1 }, result: '成', fail: { effect: { 水分: -1 }, result: '败' } },
            { text: '藤缚专属', showIf: 'skill:bind', useSkill: 'bind', effect: { 灵气: 3 }, result: '专属' },
        ] },
    ]));

    it('做出选择领悟：永久解锁 + 本局立即可用', () => {
        const e = new Engine(withEvents(), createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        expect(e.eventView().id).toBe('teach');
        const s = e.choose(0);
        expect(s.skills).toEqual(['eye']);
        expect(s.messages[0]).toMatch(/领悟技能·天眼/);
        expect(e.dp.skills).toEqual(['eye']);
        expect(e.run.skills).toEqual(['eye']);
    });

    it('死亡领悟：按条件与传承等级判定；下一世开局自动携带', () => {
        const data = buildDestiny(fixture());
        const e = new Engine(data, createProfile());
        // 第一次烤熟：耐火 Lv1，不满足 lava_walk 的 legacy>=2
        e.startRun(pick, 1);
        e.chooseDirection('down'); e.choose(0); e.choose(0);
        expect(e.settle().skill).toBeUndefined();
        // 第二次烤熟：耐火 Lv2 → 领悟熔岩行走
        e.startRun(pick, 2);
        e.chooseDirection('down'); e.choose(0); e.choose(0);
        expect(e.settle().skill).toMatchObject({ id: 'lava_walk', name: '熔岩行走' });
        // 第三世：门槛事件出现技能交互选项
        e.startRun(pick, 3);
        expect(e.run.skills).toEqual(['lava_walk']);
        e.chooseDirection('down'); e.choose(0);
        const v = e.eventView();
        const walk = v.choices.find(c => c.text === '熔岩行走')!;
        expect(walk).toMatchObject({ enabled: true, tag: '技能·熔岩行走' });
        e.choose(walk.index);
        expect(e.run.phase).toBe('direction');
        expect(e.run.cd.lava_walk).toBe(e.run.season - 1 + 2);
    });

    it('突破领悟：从 skillPool 抽取', () => {
        const e = new Engine(buildDestiny(fixture()), createProfile());
        e.dp.legacy.fire = 1;
        e.startRun(pick, 1);
        e.run.attrs.qi = 49;
        e.chooseDirection('down');
        const s = e.choose(0); // 季末结算前 qi 49 → 不突破
        expect(s.skills).toEqual([]);
        e.run.attrs.qi = 60;
        e.choose(1); // 门槛：耐火冲 → 季末突破为「芽」→ 领悟爆发
        expect(e.run.stage).toBe(1);
        expect(e.run.skills).toContain('burst');
    });

    it('方向技能：结算效果并进入冷却；冷却中不可用', () => {
        const e = new Engine(buildDestiny(fixture()), createProfile());
        e.dp.skills.push('nap');
        e.startRun(pick, 1);
        e.run.attrs.water = 1;
        expect(e.skillViews()).toEqual([expect.objectContaining({ id: 'nap', usable: true, cdLeft: 0 })]);
        const s = e.useSkill('nap');
        expect(s.deltas.water).toBe(2);
        expect(e.skillViews()[0]).toMatchObject({ usable: false, cdLeft: 2 });
        expect(() => e.useSkill('nap')).toThrow();
    });

    it('事件技能：天眼看穿；藤缚化解普通事件，但不能化解门槛事件', () => {
        const e = new Engine(withEvents(), createProfile());
        e.dp.skills.push('eye', 'bind');
        e.startRun({ ...pick, skills: ['eye', 'bind'] }, 1);
        e.chooseDirection('down');
        e.useSkill('eye');
        expect(e.eventView().choices.every(c => c.preview)).toBe(true);
        // 藤缚：化解 teach（无效果），推进 → 进入二层触发门槛
        e.run.attrs.root = 1;
        const s = e.useSkill('bind');
        expect(s.text).toBe('捆了');
        expect(s.deltas).toEqual({});
        expect(e.eventView().id).toBe('gate');
        e.run.cd.bind = 0; // 排除冷却干扰：门槛事件本身不可化解
        expect(e.skillViews().find(v => v.id === 'bind')!.usable).toBe(false);
        expect(() => e.useSkill('bind')).toThrow();
    });

    it('交互选项：拥有技能才可见，冷却中锁定并提示', () => {
        const e = new Engine(withEvents(), createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        expect(e.eventView().choices.map(c => c.text)).not.toContain('藤缚专属');
        e.run.skills.push('bind');
        e.run.cd.bind = e.run.season + 2;
        const c = e.eventView().choices.find(x => x.text === '藤缚专属')!;
        expect(c).toMatchObject({ enabled: false, lockText: '技能冷却中（还需2季）' });
        expect(() => e.choose(c.index)).toThrow(/技能不可用/);
    });

    it('开局携带上限：超过 skillSlots 需选择，默认带最新领悟的', () => {
        const e = new Engine(buildDestiny(fixture()), createProfile());
        e.dp.skills.push('burst', 'nap', 'eye');
        expect(e.needSkillLoadout()).toBe(true);
        e.startRun(pick, 1);
        expect(e.run.skills).toEqual(['eye', 'nap']);
        e.startRun({ ...pick, skills: ['burst', 'eye', 'nap', 'not_owned'] }, 2);
        expect(e.run.skills).toEqual(['burst', 'eye']);
    });
});
