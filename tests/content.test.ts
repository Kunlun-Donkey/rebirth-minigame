import { describe, expect, it } from 'vitest';
import { buildDestiny, createProfile, destinyProfile, destinyStates, Engine, pickDestiny, Rng } from '../assets/scripts/core';
import { listDestinies, loadIndex, loadRawDestiny } from '../tools/load';
import { validateDestiny, validateIndex, World } from '../tools/validate-lib';

const world: World = Object.fromEntries(listDestinies().map(id => [id, { endings: loadRawDestiny(id).raw.meta.endings.map(e => e.id) }]));

describe('命格索引与解锁', () => {
    const index = loadIndex();

    it('index.json 校验无错误', () => {
        expect(validateIndex(index, listDestinies())).toEqual([]);
    });

    it('新存档只开放默认命格；草→毛毛虫/土狗，土狗→皮皮虾，皮皮虾→鳄鱼 逐级解锁', () => {
        const p = createProfile();
        const locked = destinyStates(index, p).find(s => s.entry.id === 'local_dog')!;
        expect(locked.unlocked).toBe(false);
        expect(locked.lockText).toBeTruthy();
        expect(pickDestiny(index, p, 'local_dog')).toBe('desert_grass');

        const st = () => Object.fromEntries(destinyStates(index, p).map(s => [s.entry.id, s.unlocked]));
        destinyProfile(p, 'desert_grass').bestStage = 1;
        expect(st()).toMatchObject({ caterpillar: true, local_dog: false, mantis_shrimp: false });
        destinyProfile(p, 'desert_grass').bestStage = 2;
        expect(st()).toMatchObject({ local_dog: true, mantis_shrimp: false });
        expect(pickDestiny(index, p, 'local_dog')).toBe('local_dog');
        destinyProfile(p, 'local_dog').bestStage = 1;
        expect(st()).toMatchObject({ mantis_shrimp: true, crocodile: false });
        destinyProfile(p, 'mantis_shrimp').bestStage = 2;
        expect(destinyStates(index, p).every(s => s.unlocked)).toBe(true);
    });
});

describe.each(listDestinies())('命格剧本 %s', id => {
    const { raw } = loadRawDestiny(id);

    it('校验无错误', () => {
        expect(validateDestiny(raw, world).errors).toEqual([]);
    });

    it('随机 AI 连续轮回 300 世不报错、不卡死', () => {
        const e = new Engine(buildDestiny(raw), createProfile());
        const rng = new Rng({ rng: 123 });
        for (let life = 0; life < 300; life++) {
            const d = e.rollDraft(rng.int(1e9));
            e.startRun({ talent: d.talents[rng.int(3)], item: d.items[rng.int(3)], companion: d.companions[rng.int(3)] }, rng.int(1e9));
            let steps = 0;
            while (e.run.phase === 'direction' || e.run.phase === 'event') {
                expect(++steps).toBeLessThan(2000);
                if (e.run.phase === 'direction') {
                    const opts = e.directionOptions().filter(o => o.enabled);
                    e.chooseDirection(opts[rng.int(opts.length)].dir);
                } else {
                    const ok = e.eventView().choices.filter(c => c.enabled);
                    expect(ok.length).toBeGreaterThan(0);
                    e.choose(ok[rng.int(ok.length)].index);
                }
            }
            const s = e.settle();
            e.sealRelics(s.relicCandidates.slice(0, 1));
        }
        expect(e.dp.lives).toBe(300);
    });

    it('老玩家存档（其他命格都已通关）：跨命格彩蛋能出现，连续轮回不报错', () => {
        const p = createProfile();
        for (const [did, w] of Object.entries(world)) {
            if (did === id) continue;
            const dp = destinyProfile(p, did);
            dp.lives = 50;
            dp.bestStage = 5;
            dp.codex.endings = [...w.endings];
        }
        const e = new Engine(buildDestiny(raw), p);
        const rng = new Rng({ rng: 7 });
        let cameo = 0;
        for (let life = 0; life < 300; life++) {
            const d = e.rollDraft(rng.int(1e9));
            e.startRun({ talent: d.talents[rng.int(3)], item: d.items[rng.int(3)], companion: d.companions[rng.int(3)] }, rng.int(1e9));
            let steps = 0;
            while (e.run.phase === 'direction' || e.run.phase === 'event') {
                expect(++steps).toBeLessThan(2000);
                if (e.run.phase === 'direction') {
                    const opts = e.directionOptions().filter(o => o.enabled);
                    e.chooseDirection(opts[rng.int(opts.length)].dir);
                } else {
                    const v = e.eventView();
                    if (v.cameo) cameo++;
                    const ok = v.choices.filter(c => c.enabled);
                    e.choose(ok[rng.int(ok.length)].index);
                }
            }
            e.sealRelics(e.settle().relicCandidates.slice(0, 1));
        }
        expect(cameo).toBeGreaterThan(0);
    });
});

describe('第一世高光', () => {
    it.each(listDestinies())('%s：本命格第一世活到第 4 季前一定遇到一次金色奇遇', id => {
        const d = buildDestiny(loadRawDestiny(id).raw);
        for (let seed = 1; seed <= 20; seed++) {
            const e = new Engine(d, createProfile());
            const draft = e.rollDraft(seed);
            e.startRun({ talent: draft.talents[0], item: draft.items[0], companion: draft.companions[0] }, seed);
            const rng = new Rng({ rng: seed });
            let gold = false;
            for (let guard = 0; guard < 200 && e.run.season <= 4 && !gold; guard++) {
                e.run.attrs[d.meta.rules.life] = 99;
                if (e.run.phase === 'direction') {
                    const opts = e.directionOptions().filter(o => o.enabled);
                    e.chooseDirection(opts[rng.int(opts.length)].dir);
                } else if (e.run.phase === 'event') {
                    if (e.eventView().gold) gold = true;
                    const ok = e.eventView().choices.filter(c => c.enabled);
                    e.choose(ok[rng.int(ok.length)].index);
                } else break;
            }
            if (e.run.phase === 'event' && e.eventView().gold) gold = true;
            if (e.run.phase === 'event' || e.run.phase === 'direction') expect(gold, `种子 ${seed}`).toBe(true);
        }
    });
});

describe('世数里程碑', () => {
    it('第 10 世开局：天道赏成长货币，开局台词里写明', () => {
        const d = buildDestiny(loadRawDestiny('desert_grass').raw);
        const run = (lives: number) => {
            const p = createProfile();
            destinyProfile(p, 'desert_grass').lives = lives;
            const e = new Engine(d, p);
            const dr = e.rollDraft(1);
            e.startRun({ talent: dr.talents[0], item: dr.items[0], companion: dr.companions[0] }, 1);
            return e;
        };
        const g = d.meta.rules.growth;
        const e9 = run(8), e10 = run(9);
        expect(e10.run.life).toBe(10);
        expect(e10.run.attrs[g] - e9.run.attrs[g]).toBe(8);
        expect(e10.startRemark()).toContain('+8');
        expect(e9.startRemark()).toBeUndefined();
    });
});

describe('探路道具（previewDirs）', () => {
    it('带着探路道具：方向上显示本季预告，选这个方向遇到的就是它', () => {
        const d = buildDestiny(loadRawDestiny('desert_grass').raw);
        const id = [...d.items.values()].find(i => i.mods?.previewDirs)!.id;
        let hits = 0;
        for (let seed = 1; seed <= 10; seed++) {
            const e = new Engine(d, createProfile());
            const dr = e.rollDraft(seed);
            e.startRun({ talent: dr.talents[0], item: dr.items[0], companion: dr.companions[0] }, seed);
            e.run.items.push(id);
            for (let i = 0; i < 6 && e.run.phase === 'event'; i++) e.choose(e.eventView().choices.find(c => c.enabled)!.index);
            if (e.run.phase !== 'direction') continue;
            const opt = e.directionOptions().find(o => o.enabled && o.preview && !o.thread);
            if (!opt) continue;
            const expected = e.run.preview!.ev[opt.dir]!;
            e.chooseDirection(opt.dir);
            expect(e.eventView().id).toBe(expected);
            hits++;
        }
        expect(hits).toBeGreaterThan(3);
    });
});
