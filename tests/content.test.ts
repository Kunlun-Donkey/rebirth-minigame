import { describe, expect, it } from 'vitest';
import { buildDestiny, createProfile, Engine, Rng } from '../assets/scripts/core';
import { listDestinies, loadRawDestiny } from '../tools/load';
import { validateDestiny } from '../tools/validate-lib';

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
