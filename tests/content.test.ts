import { describe, expect, it } from 'vitest';
import { buildDestiny, createProfile, destinyProfile, destinyStates, Engine, pickDestiny, Rng } from '../assets/scripts/core';
import { listDestinies, loadIndex, loadRawDestiny } from '../tools/load';
import { validateDestiny, validateIndex } from '../tools/validate-lib';

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
        expect(validateDestiny(raw).errors).toEqual([]);
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
});
