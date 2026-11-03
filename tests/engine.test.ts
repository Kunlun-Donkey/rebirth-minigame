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
            settings: { suddenChance: 0, rarityWeights: { common: 1, rare: 0, epic: 0, legend: 0 }, skillSlots: 2 },
            rules: {
                life: 'water', lifeMax: 'waterMax', lifeDeath: 'thirst', oldAgeDeath: 'old_age',
                regen: { from: 'root', per: 99 }, growth: 'qi',
                yield: { from: 'stem', per: 99, base: 0 }, startLog: '一颗种子。',
            },
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

describe('命盘与每日天命', () => {
    function rich(): RawDestiny {
        const raw = fixture();
        raw.meta.upgrades = [
            { id: 'vigor', name: '固本', desc: '', costs: [100, 200], start: { 水分上限: 1 } },
            { id: 'fortune', name: '福缘', desc: '', kind: 'pointsBonus', value: 0.1, costs: [50] },
            { id: 'insight', name: '天机', desc: '', kind: 'reroll', costs: [10, 10] },
            { id: 'vision', name: '慧眼', desc: '', kind: 'draftSize', costs: [10] },
            { id: 'treasure', name: '藏宝', desc: '', kind: 'relicSlot', costs: [10] },
            { id: 'wind', name: '续命', desc: '回满', kind: 'reviveBoost', costs: [10], start: { 根系: 1 } },
        ];
        raw.meta.fates = [
            { id: 'fertile', name: '沃土', desc: '', start: { 根系: 2 } },
            { id: 'windfall', name: '横财', desc: '', mods: { pointsMul: 2 } },
        ];
        raw.talents.push({ id: 't4', name: 't4', rarity: 'common', desc: '' });
        raw.items.push({ id: 'pebble', name: '卵石', rarity: 'common', desc: '' });
        raw.companions.push({ id: 'c4', name: 'c4', rarity: 'common', desc: '' });
        return raw;
    }

    it('购买扣轮回点、逐级涨价、满级/点数不足不可买；start 效果开局生效', () => {
        const profile = createProfile();
        const e = new Engine(buildDestiny(rich()), profile);
        profile.points = 250;
        expect(e.upgradeViews().find(v => v.id === 'vigor')).toMatchObject({ level: 0, max: 2, cost: 100, affordable: true });
        e.buyUpgrade('vigor');
        expect(profile.points).toBe(150);
        expect(() => e.buyUpgrade('vigor')).toThrow('轮回点不足');
        profile.points = 200;
        e.buyUpgrade('vigor');
        expect(e.upgradeViews().find(v => v.id === 'vigor')).toMatchObject({ level: 2, cost: undefined, affordable: false });
        expect(() => e.buyUpgrade('vigor')).toThrow('已满级');
        e.startRun(pick, 1);
        expect(e.run.attrs.waterMax).toBe(5);
        expect(e.run.attrs.water).toBe(5);
    });

    it('慧眼 4 选 1、天机免费重演次数、藏宝多一格封存', () => {
        const profile = createProfile();
        const e = new Engine(buildDestiny(rich()), profile);
        expect(e.draftSize()).toBe(3);
        profile.points = 1000;
        for (const id of ['vision', 'insight', 'insight', 'treasure']) e.buyUpgrade(id);
        const d = e.rollDraft(1);
        expect([d.talents.length, d.items.length, d.companions.length]).toEqual([4, 4, 4]);
        expect(e.freeRerolls()).toBe(2);
        e.startRun(pick, 1);
        e.chooseDirection('down');
        e.choose(0);
        e.choose(0);
        const s = e.settle();
        expect(s.relicSlots).toBe(2);
    });

    it('轮回点：命盘加成与今日首世加成写入明细，首世加成每天只给一次', () => {
        const profile = createProfile();
        const e = new Engine(buildDestiny(rich()), profile);
        profile.points = 50;
        e.buyUpgrade('fortune');
        e.todayFate('2026-11-02');
        // 固定为不带倍率的天命，便于断言
        e.dp.daily!.fate = 'fertile';
        const run = () => {
            e.startRun(pick, 1);
            e.chooseDirection('down');
            e.choose(0);
            e.choose(0);
            return e.settle();
        };
        const s1 = run();
        expect(s1.breakdown.map(b => b.label)).toEqual(expect.arrayContaining(['命盘加成 +10%', '今日首世 +50%']));
        const s2 = run();
        expect(s2.breakdown.map(b => b.label)).toContain('命盘加成 +10%');
        expect(s2.breakdown.map(b => b.label)).not.toContain('今日首世 +50%');
        // 跨天重新获得首世加成
        e.todayFate('2026-11-03');
        expect(e.dp.daily!.first).toBe(true);
    });

    it('今日天命：同一天结果固定，开局生效；看视频每天只能换一次', () => {
        const a = new Engine(buildDestiny(rich()), createProfile());
        const b = new Engine(buildDestiny(rich()), createProfile());
        expect(a.todayFate('2026-11-02')).toBe(b.todayFate('2026-11-02'));
        a.dp.daily!.fate = 'fertile';
        a.startRun(pick, 1);
        expect(a.run.fate).toBe('fertile');
        expect(a.run.attrs.root).toBe(2);

        expect(a.canSwapFate()).toBe(true);
        expect(a.swapFate(1)).toBe('windfall');
        expect(a.canSwapFate()).toBe(false);
        expect(() => a.swapFate(2)).toThrow();
        a.startRun(pick, 2);
        expect(a.mods().pointsMul).toBe(2);
    });

    it('续命：广告复活时水分回满并获得额外效果（不提供免费复活）', () => {
        const profile = createProfile();
        const e = new Engine(buildDestiny(rich()), profile);
        profile.points = 10;
        e.buyUpgrade('wind');
        e.startRun(pick, 1);
        e.chooseDirection('down');
        e.choose(0);
        const root = e.run.attrs.root;
        e.choose(0);
        expect(e.run.phase).toBe('dying');
        const step = e.reviveByAd();
        expect(e.run.attrs.water).toBe(e.run.attrs.waterMax);
        expect(e.run.attrs.root).toBe(root + 1);
        expect(step.messages.some(m => m.includes('命盘·续命'))).toBe(true);
        expect(e.canReviveByAd()).toBe(false);
    });
});

describe('后续剧情（follow）', () => {
    const extra: RawEvent[] = [
        { id: 'meet', dir: 'down', layers: ['D1'], weight: 1000, once: true, text: '遇见', choices: [
            { text: '交朋友', effect: { follow: 'visit' }, result: '好' },
            { text: '走开', result: '走' },
        ] },
        { id: 'visit', dir: 'down', chainOnly: true, teaser: '它说还会来', text: '它来了', choices: [{ text: '欢迎', effect: { 灵气: 1 }, result: '来了' }] },
        { id: 'late', dir: 'up', chainOnly: true, teaser: '晚点再说', text: '晚', choices: [{ text: '嗯', result: '嗯' }] },
        { id: 'ask', dir: 'down', layers: ['D1'], weight: 1, text: '问', choices: [{ text: '约', effect: { follow: { id: 'late', delay: 2, ttl: 1 } }, result: '约了' }] },
    ];

    it('选了带 follow 的选项：下一季同方向显示预告并优先触发后续事件', () => {
        const e = new Engine(buildDestiny(fixture(extra)), createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        expect(e.eventView().id).toBe('meet');
        e.choose(0);
        expect(e.run.phase).toBe('direction');
        expect(e.directionOptions().find(o => o.dir === 'down')!.thread).toBe('它说还会来');
        e.chooseDirection('down');
        expect(e.eventView().id).toBe('visit');
        e.choose(0);
        expect(e.run.threads).toEqual([]);
        expect(e.directionOptions().find(o => o.dir === 'down')!.thread).toBeUndefined();
    });

    it('delay 未到不触发；过了 ttl 作废；方向不匹配时等待', () => {
        const e = new Engine(buildDestiny(fixture([...extra.filter(x => x.id !== 'meet').map(x => (x.id === 'ask' ? { ...x, weight: 1000, once: true } : x)), { id: 'idle', dir: 'down', layers: ['D1'], weight: 500, text: '闲', choices: [{ text: '闲', result: '闲' }] }])), createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        expect(e.eventView().id).toBe('ask');
        e.choose(0); // 第 1 季约：第 3 季 up 方向可触发，仅第 3 季有效
        expect(e.threadTeasers()).toEqual([]);
        e.chooseDirection('down');
        if (e.run.phase === 'event') e.choose(0);
        expect(e.run.season).toBe(3);
        expect(e.threadTeasers()).toEqual([{ dir: 'up', text: '晚点再说' }]);
        e.chooseDirection('down'); // 方向不匹配，不触发
        expect(e.eventView().id).not.toBe('late');
        e.run.season = 4; // 过了 ttl
        expect(e.threadTeasers()).toEqual([]);
    });

    it('限定 layers 的后续：不在那一层时不触发、不显示预告', () => {
        const ev: RawEvent[] = [
            { id: 'meet', dir: 'down', layers: ['D1'], weight: 1000, once: true, text: '遇见', choices: [{ text: '约', effect: { follow: 'deep_only' }, result: '好' }] },
            { id: 'deep_only', dir: 'down', layers: ['D2'], chainOnly: true, teaser: '深处见', text: '深', choices: [{ text: '嗯', result: '嗯' }] },
        ];
        const e = new Engine(buildDestiny(fixture(ev)), createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        e.choose(0);
        expect(e.threadTeasers()).toEqual([]);
        expect(e.directionOptions().find(o => o.dir === 'down')!.thread).toBeUndefined();
        e.chooseDirection('down');
        expect(e.eventView().id).not.toBe('deep_only');
    });

    it('局内状态带 threads 可序列化恢复', () => {
        const e = new Engine(buildDestiny(fixture(extra)), createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        e.choose(0);
        const e2 = new Engine(buildDestiny(fixture(extra)), createProfile());
        e2.resume(JSON.parse(JSON.stringify(e.run)));
        e2.chooseDirection('down');
        expect(e2.eventView().id).toBe('visit');
    });
});

describe('天胡通道', () => {
    const chain: RawEvent[] = [
        { id: 'c1', dir: 'any', chainOnly: true, teaser: '有光', text: '光', choices: [{ text: '接', effect: { stageUp: 1, follow: 'c2' }, result: '亮' }] },
        { id: 'c2', dir: 'any', chainOnly: true, teaser: '仙人', text: '仙', choices: [{ text: '拜', effect: { stageUp: 2, flag: 'tianhu' }, result: '成' }] },
    ];
    const blessedFixture = (chance: number) => {
        const raw = fixture(chain);
        raw.meta.blessed = { chance, name: '天命', text: '天降异象', start: { 灵气: 3 }, lifespanMul: 2, chain: 'c1' };
        return raw;
    };

    it('天命之子：开局加成、第 2 季必出奇遇连锁，连锁直接突破到结局并标记天胡', () => {
        const e = new Engine(buildDestiny(blessedFixture(1)), createProfile());
        e.startRun(pick, 1);
        expect(e.run.blessed).toBe(true);
        expect(e.run.attrs.qi).toBe(3);
        expect(e.run.threads).toEqual([{ id: 'c1', at: 2, until: 999 }]);
        e.run.threads![0].at = 1; // 跳过第 1 季
        e.chooseDirection('down');
        expect(e.eventView().id).toBe('c1');
        const s1 = e.choose(0);
        expect(s1.messages.some(m => m.startsWith('【突破·'))).toBe(true);
        expect(e.run.stage).toBe(1);
        e.chooseDirection('down');
        expect(e.eventView().id).toBe('c2');
        e.choose(0);
        expect(e.run.phase).toBe('over');
        const st = e.settle();
        expect(st.kind).toBe('ending');
        expect(st.tianhu).toBe(true);
        expect(st.breakdown.some(b => b.label === '天胡')).toBe(true);
        expect(e.dp.codex.tianhu).toBe(1);
    });

    it('概率为 0 时不会触发；寿元按 lifespanMul 加倍', () => {
        const e = new Engine(buildDestiny(blessedFixture(0)), createProfile());
        e.startRun(pick, 1);
        expect(e.run.blessed).toBeFalsy();
        expect(e.blessedChance()).toBe(0);
        const e2 = new Engine(buildDestiny(blessedFixture(1)), createProfile());
        e2.startRun(pick, 1);
        e2.run.threads = [];
        // 第 0 境界寿元 50 → 天命之子 100 季才寿终
        e2.run.season = 60;
        e2.chooseDirection('down');
        if (e2.run.phase === 'event') e2.choose(0);
        expect(e2.run.phase).not.toBe('dying');
    });
});

describe('爽感：新手保护 / 最后一搏 / 突破进度 / 大成功', () => {
    const trap: RawEvent = { id: 'trap', dir: 'down', layers: ['D1'], weight: 1000, text: '坑', choices: [{ text: '跳', effect: { death: 'lava' }, result: '掉了' }] };

    it('新手保护：第 1 世前 N 季的死亡被挡下；第 2 世不再保护', () => {
        const raw = fixture([trap]);
        raw.meta.settings.newbieSeasons = 8;
        const e = new Engine(buildDestiny(raw), createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        expect(e.eventView().id).toBe('trap');
        const st = e.choose(0);
        expect(st.revived).toBe(true);
        expect(st.messages.some(m => m.startsWith('命不该绝'))).toBe(true);
        expect(e.run.phase).not.toBe('dying');
        e.run.over = { kind: 'death', id: 'lava' }; e.run.phase = 'over'; e.settle();
        e.startRun(pick, 2);
        e.chooseDirection('down');
        e.choose(0);
        expect(e.run.phase).toBe('dying');
    });

    it('寿元将尽：先触发一次最后一搏，成功则直接突破续命', () => {
        const raw = fixture([{ id: 'idle', dir: 'down', layers: ['D1'], weight: 5000, text: '闲', choices: [{ text: '闲', result: '闲' }] }, { id: 'last', dir: 'any', chainOnly: true, text: '将尽', choices: [
            { text: '搏', chance: 1, effect: { stageUp: 1 }, result: '成', fail: { effect: { death: 'old_age' }, result: '败' } },
        ] }]);
        raw.meta.rules.lastStand = 'last';
        const e = new Engine(buildDestiny(raw), createProfile());
        e.startRun(pick, 1);
        e.run.season = 50; // 第 0 境界寿元 50
        e.chooseDirection('down');
        const st = e.choose(0);
        expect(st.messages.some(m => m.includes('最后一次机会'))).toBe(true);
        expect(e.run.phase).toBe('event');
        expect(e.eventView().id).toBe('last');
        e.choose(0);
        expect(e.run.stage).toBe(1);
        expect(e.run.lastStand).toBe('used');
    });

    it('突破进度：列出下一境界的属性要求与当前值', () => {
        const e = new Engine(buildDestiny(fixture()), createProfile());
        e.startRun(pick, 1);
        expect(e.stageProgress()).toEqual({ name: '芽', parts: [{ label: '灵气', cur: 0, need: 50 }] });
    });

    it('大成功：成功后约 15% 概率正向属性收益翻倍', () => {
        const ev: RawEvent = { id: 'luck', dir: 'down', layers: ['D1'], weight: 1000, text: '运', choices: [
            { text: '试', chance: 0.9, effect: { 灵气: 4 }, result: '好', fail: { result: '坏' } },
        ] };
        let crits = 0;
        for (let seed = 1; seed <= 400; seed++) {
            const e = new Engine(buildDestiny(fixture([ev])), createProfile());
            e.dp.lives = 1; // 第 2 世起（第 1 世第一次冒险是「新手手气」，必定大成功）
            e.startRun(pick, seed);
            e.chooseDirection('down');
            if (e.eventView().id !== 'luck') continue;
            const st = e.choose(0);
            if (!st.success) continue;
            if (st.crit) {
                crits++;
                expect(st.deltas.qi).toBe(8);
                expect(st.messages[0]).toContain('大成功');
            } else expect(st.deltas.qi).toBe(4);
        }
        expect(crits / 400).toBeGreaterThan(0.08);
        expect(crits / 400).toBeLessThan(0.22);
    });
});

describe('出生地图', () => {
    function withMaps(): RawDestiny {
        const raw = fixture([
            { id: 'only_a', dir: 'down', layers: ['D1'], maps: ['a'], weight: 1000, text: 'A', choices: [{ text: '.', result: '.' }] },
            { id: 'only_b', dir: 'down', layers: ['D1'], maps: ['b'], weight: 1000, text: 'B', choices: [{ text: '.', result: '.' }] },
        ]);
        raw.meta.maps = [
            { id: 'a', name: '甲地', desc: '', startLog: '生在甲地。', start: { 根系: 2 }, layers: { D1: { name: '甲一层' } } },
            { id: 'b', name: '乙地', desc: '', layers: { D2: { name: '乙二层', enterText: '到了乙二层' } } },
        ];
        return raw;
    }

    it('每世随机一张地图：开局效果、出生旁白、层改名、事件按地图过滤', () => {
        const e = new Engine(buildDestiny(withMaps()), createProfile());
        const seen = new Set<string>();
        for (let seed = 1; seed <= 40; seed++) {
            e.startRun(pick, seed);
            const m = e.run.map!;
            seen.add(m);
            expect(e.mapDef()?.id).toBe(m);
            const down = e.directionOptions().find(o => o.dir === 'down')!;
            if (m === 'a') {
                expect(e.run.attrs.root).toBe(2);
                expect(e.run.log[0]).toContain('生在甲地');
                expect(down.layerName).toBe('甲一层');
            } else {
                expect(e.run.attrs.root).toBe(0);
                expect(down.layerName).toBe('一层');
                expect(down.nextLayer?.name).toBe('乙二层');
            }
            e.chooseDirection('down');
            expect(e.eventView().id).not.toBe(m === 'a' ? 'only_b' : 'only_a');
        }
        expect(seen).toEqual(new Set(['a', 'b']));
    });

    it('没有地图的命格不受影响（不消耗随机数，结果与之前一致）', () => {
        const e = new Engine(buildDestiny(fixture()), createProfile());
        e.startRun(pick, 1);
        expect(e.run.map).toBeUndefined();
        expect(e.mapDef()).toBeUndefined();
    });
});

describe('爽感 2：宿敌记仇 / 嫌弃式前世 / 稳 / 连胜 / 恩怨 / 墓志铭 / 跨命格', () => {
    const settleDeath = (e: Engine, id: string) => { e.run.over = { kind: 'death', id }; e.run.phase = 'over'; return e.settle(); };

    it('宿敌记仇：died:x 计数跨世累计，文本 {died:x} 渲染为次数', () => {
        const ev: RawEvent = { id: 'grudge', dir: 'down', layers: ['D1'], weight: 1000, require: 'died:lava>=2', text: '它烤过你{died:lava}回', choices: [{ text: '报仇', effect: { feud: '烤回去了' }, result: '第{died:lava}回，轮到你了' }] };
        const e = new Engine(buildDestiny(fixture([ev])), createProfile());
        for (let i = 0; i < 2; i++) { e.startRun(pick, i + 1); settleDeath(e, 'lava'); }
        expect(e.dp.deathCount?.lava).toBe(2);
        e.startRun(pick, 9);
        e.chooseDirection('down');
        const v = e.eventView();
        expect(v.id).toBe('grudge');
        expect(v.text).toBe('它烤过你2回');
        const st = e.choose(0);
        expect(st.text).toBe('第2回，轮到你了');
        expect(st.messages).toContain('【恩怨了结】烤回去了');
        expect(st.hype).toBe('feud');
        e.run.over = { kind: 'death', id: 'thirst' }; e.run.phase = 'over';
        expect(e.settle().feuds).toEqual(['烤回去了']);
    });

    it('嫌弃式前世：同一个选项害死你 2 次起，标注带次数与吐槽', () => {
        const trap: RawEvent = { id: 'trap', dir: 'down', layers: ['D1'], weight: 1000, text: '坑', choices: [{ text: '跳', effect: { death: 'lava' } }, { text: '绕', result: '绕开' }] };
        const e = new Engine(buildDestiny(fixture([trap])), createProfile());
        for (let i = 0; i < 3; i++) {
            e.startRun(pick, i + 1);
            e.chooseDirection('down');
            const mem = e.eventView().choices[0].memory;
            if (i === 0) expect(mem).toBeUndefined();
            if (i === 1) expect(mem).toBe('前世：你在这里烤熟');
            if (i === 2) expect(mem).toBe('前世：死过2次·又来？');
            e.choose(0);
            e.settle();
        }
    });

    it('稳：成功率溢出到 100% 必成，用 easy 文案；前世在这儿死过时提示碾压', () => {
        const ev: RawEvent = { id: 'risk', dir: 'down', layers: ['D1'], weight: 1000, text: '险', choices: [
            { text: '冲', chance: 0.5, chanceAttr: '根系', chanceStep: 0.1, effect: { 灵气: 1 }, result: '险胜', easy: '轻松', fail: { effect: { death: 'lava' } } },
        ] };
        const e = new Engine(buildDestiny(fixture([ev])), createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        expect(e.eventView().choices[0].sure).toBeUndefined();
        e.dp.memory['risk#0'] = { life: 0, text: '你在这里烤熟', dead: 2 };
        e.run.attrs.root = 5;
        const v = e.eventView().choices[0];
        expect(v.sure).toBe(true);
        expect(v.memory).toBe('前世：死过2次·又来？');
        const st = e.choose(0);
        expect(st.success).toBe(true);
        expect(st.text).toBe('轻松');
        expect(st.messages.some(m => m.startsWith('【碾压】前世你在这里死过 2 次'))).toBe(true);
        expect(['crush', 'crit', 'streak']).toContain(st.hype === 'crit' ? 'crit' : st.hype);
    });

    it('连胜：3 连起额外给成长值，断了提示', () => {
        const ev: RawEvent = { id: 'roll', dir: 'down', layers: ['D1'], weight: 1000, text: '掷', choices: [
            { text: '掷', chance: 0.5, effect: { 根系: 0 }, result: '中', fail: { result: '空' } },
        ] };
        const e = new Engine(buildDestiny(fixture([ev])), createProfile());
        e.startRun(pick, 3);
        let max = 0, broke = false;
        for (let i = 0; i < 60; i++) {
            // 直接反复进入同一事件（水分补满，避免渴死）
            Object.assign(e.run, { phase: 'event', event: 'roll', dir: undefined, pending: [] });
            e.run.attrs.water = 3;
            const before = e.run.streak ?? 0;
            const st = e.choose(0);
            if (st.success && before + 1 >= 3) {
                expect(st.messages.some(m => m.startsWith(`【势如破竹·${before + 1}连】`))).toBe(true);
                expect(st.deltas.qi).toBeGreaterThanOrEqual(3);
            }
            if (!st.success && before >= 3) { broke = true; expect(st.messages.some(m => m.startsWith('【连胜断了】'))).toBe(true); }
            max = Math.max(max, e.run.streak ?? 0);
        }
        expect(max).toBeGreaterThanOrEqual(3);
        expect(broke).toBe(true);
    });

    it('墓志铭后缀：速通 / 连续同一死法 / 天道评语', () => {
        const e = new Engine(buildDestiny(fixture()), createProfile());
        e.startRun(pick, 1);
        const s1 = settleDeath(e, 'lava');
        expect(s1.epitaph).toContain('——主打一个速通');
        expect(s1.remark).toBeTruthy();
        e.startRun(pick, 2); settleDeath(e, 'lava');
        e.startRun(pick, 3);
        expect(settleDeath(e, 'lava').epitaph).toContain('连续第3世了');
        expect(e.dp.deathRun).toEqual({ id: 'lava', n: 3 });
    });

    it('跨命格：xend / xlives / xstage 读取其他命格的存档；条件对玩家隐藏', () => {
        const ev: RawEvent = { id: 'cameo', dir: 'down', layers: ['D1'], weight: 1000, cameo: true, require: 'xend:dog/celestial & xlives:dog>=2 & xstage:dog>=3', text: '似曾相识', choices: [
            { text: '认出来', result: '是你' },
            { text: '锁', require: 'xend:dog', result: '.' },
        ] };
        const p = createProfile();
        const e = new Engine(buildDestiny(fixture([ev])), p);
        e.startRun(pick, 1);
        e.chooseDirection('down');
        expect(e.eventView().id).not.toBe('cameo');
        p.destinies.dog = { ...p.destinies.dog, lives: 2, bestStage: 3, legacy: {}, sealed: [], memory: {}, skills: [], upgrades: {}, codex: { deaths: [], endings: ['celestial'], items: [], events: [] } };
        e.startRun(pick, 2);
        e.chooseDirection('down');
        const v = e.eventView();
        expect(v.id).toBe('cameo');
        expect(v.cameo).toBe(true);
        expect(v.choices[1].enabled).toBe(true);
        expect(v.choices[1].tag).toBe('前世今生');
        expect(e.choose(0).hype).toBe('cameo');
    });

    it('新手手气：第 1 世第一次冒险必成且大成功，之后正常掷骰', () => {
        const ev: RawEvent = { id: 'risk1', dir: 'down', layers: ['D1'], weight: 1000, text: '险', choices: [
            { text: '冲', chance: 0.05, effect: { 灵气: 3 }, result: '成', fail: { result: '败' } },
        ] };
        const e = new Engine(buildDestiny(fixture([ev])), createProfile());
        e.startRun(pick, 1);
        e.chooseDirection('down');
        const st = e.choose(0);
        expect(st.success).toBe(true);
        expect(st.crit).toBe(true);
        expect(st.messages.some(m => m.startsWith('【新手手气】'))).toBe(true);
        expect(e.run.luck).toBe(true);
    });
});
