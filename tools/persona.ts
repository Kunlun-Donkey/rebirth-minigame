/**
 * 多玩家画像试玩：不同打法的玩家各玩 N 世，统计「新鲜感 / 天胡 / 结算可分享」三类指标。
 *   npm run persona                        全部命格 × 全部画像，每人 60 世
 *   npm run persona -- --destiny worker --lives 100
 *
 * 画像：
 *   小白   随机点
 *   稳健   优先「稳」、优先带专属标签的选项，精力低就吃道具
 *   冒险   优先离谱 / 有成功率的选项
 *   剧情党 优先有后续剧情的方向、交叉 / 彩蛋事件里的专属选项
 *   速通   一直往上（成长方向），选项挑第一个可选的
 *
 * 指标：
 *   新鲜   每世遇到的事件里「从没见过」的比例（分 1~10 / 11~30 / 31+ 世），同一世重复遇到同一事件的比例，
 *          连续两世开局前 3 个事件完全一样的比例
 *   天胡   天命之子世数、天胡结局世数、第一次天胡在第几世
 *   结算   结局 / 死法种类数，第一次结局在第几世，最常见结局占比（越低越多样），没有稀有度数据的结局 / 死法
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDestiny, ChoiceView, createProfile, Engine, Rng } from '../assets/scripts/core';
import { DATA_ROOT, listDestinies, loadRawDestiny } from './load';

const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const LIVES = Number(opt('--lives') ?? 60);
const ONLY = opt('--destiny');
const SEEDS = Number(opt('--seeds') ?? 3);

type Persona = { name: string; dir(e: Engine, rng: Rng): string; choose(cs: ChoiceView[], rng: Rng, e: Engine): ChoiceView };
const pick = <T>(a: T[], rng: Rng) => a[rng.int(a.length)];
const PERSONAS: Persona[] = [
    { name: '小白', dir: (e, rng) => pick(e.directionOptions().filter(o => o.enabled), rng).dir, choose: (cs, rng) => pick(cs, rng) },
    {
        name: '稳健',
        dir: (e, rng) => pick(e.directionOptions().filter(o => o.enabled), rng).dir,
        choose: (cs, rng) => cs.find(c => c.sure) ?? cs.find(c => c.tag) ?? cs.find(c => !c.absurd && !c.preview) ?? pick(cs, rng),
    },
    {
        name: '冒险',
        dir: (e, rng) => pick(e.directionOptions().filter(o => o.enabled), rng).dir,
        choose: (cs, rng) => cs.find(c => c.absurd) ?? (rng.chance(0.5) ? cs[cs.length - 1] : pick(cs, rng)),
    },
    {
        name: '剧情党',
        dir: (e, rng) => { const o = e.directionOptions().filter(x => x.enabled); return (o.find(x => x.thread) ?? pick(o, rng)).dir; },
        choose: (cs, rng) => cs.find(c => c.tag) ?? cs.find(c => c.memory) ?? pick(cs, rng),
    },
    {
        name: '速通',
        dir: (e, rng) => { const o = e.directionOptions().filter(x => x.enabled); return (o.find(x => x.dir === 'up') ?? pick(o, rng)).dir; },
        choose: cs => cs[0],
    },
];

const rarity = (() => { try { return JSON.parse(readFileSync(join(DATA_ROOT, 'rarity.json'), 'utf8')) as Record<string, Record<string, number>>; } catch { return {}; } })();

function run(destiny: string, p: Persona, seed: number) {
    const data = buildDestiny(loadRawDestiny(destiny).raw);
    const profile = createProfile();
    const e = new Engine(data, profile);
    const rng = new Rng({ rng: seed * 7919 + p.name.length });
    const everSeen = new Set<string>();
    const fresh = [[0, 0], [0, 0], [0, 0]];
    let repeats = 0, events = 0, sameOpen = 0, blessed = 0, tianhu = 0, firstTianhu = 0, firstEnding = 0;
    let prevOpen = '';
    const outcomes: Record<string, number> = {};
    for (let life = 1; life <= LIVES; life++) {
        e.todayFate(`d${Math.floor(life / 6)}`);
        const d = e.rollDraft(rng.int(1e9));
        e.startRun({ talent: pick(d.talents, rng), item: pick(d.items, rng), companion: pick(d.companions, rng) }, rng.int(1e9));
        if (e.run.blessed) blessed++;
        const seenThisLife: string[] = [];
        let guard = 0;
        while ((e.run.phase === 'direction' || e.run.phase === 'event') && guard++ < 3000) {
            if (e.run.phase === 'direction') {
                const items = e.usableItems();
                if (items.length && e.run.attrs[data.meta.rules.life] <= 2) { e.useItem(items[0]); continue; }
                e.chooseDirection(p.dir(e, rng) as never);
            } else {
                const v = e.eventView();
                seenThisLife.push(v.id);
                const ok = v.choices.filter(c => c.enabled);
                e.choose(p.choose(ok, rng, e).index);
            }
        }
        const s = e.settle();
        const b = life <= 10 ? 0 : life <= 30 ? 1 : 2;
        for (const id of new Set(seenThisLife)) { fresh[b][1]++; if (!everSeen.has(id)) { fresh[b][0]++; everSeen.add(id); } }
        events += seenThisLife.length;
        repeats += seenThisLife.length - new Set(seenThisLife).size;
        const open = seenThisLife.slice(0, 3).join(',');
        if (open && open === prevOpen) sameOpen++;
        prevOpen = open;
        if (s.tianhu) { tianhu++; if (!firstTianhu) firstTianhu = life; }
        if (s.kind === 'ending' && !firstEnding) firstEnding = life;
        outcomes[`${s.kind}:${s.id}`] = (outcomes[`${s.kind}:${s.id}`] ?? 0) + 1;
        for (;;) { const c = e.upgradeViews().filter(v => v.affordable).sort((a, b) => a.cost! - b.cost!)[0]; if (!c) break; e.buyUpgrade(c.id); }
        if (s.relicCandidates.length) e.sealRelics(s.relicCandidates.slice(0, s.relicSlots));
    }
    const endings = Object.keys(outcomes).filter(k => k.startsWith('ending:')).length;
    const deaths = Object.keys(outcomes).filter(k => k.startsWith('death:')).length;
    const top = Object.entries(outcomes).sort((a, b) => b[1] - a[1])[0];
    const noRarity = Object.keys(outcomes).filter(k => rarity[destiny] && rarity[destiny][k] === undefined);
    return { fresh, repeats, events, sameOpen, blessed, tianhu, firstTianhu, firstEnding, endings, deaths, top, noRarity, totalEndings: data.endings.size, totalDeaths: data.deaths.size };
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');
for (const d of listDestinies().filter(x => !ONLY || x === ONLY)) {
    console.log(`\n══ ${d}（每人 ${LIVES} 世 × ${SEEDS} 种子）══`);
    console.log('画像    新鲜 1-10/11-30/31+   同世重复  开局雷同  天命之子 天胡(首次)  结局种类 死法种类 首结局  最常见');
    for (const p of PERSONAS) {
        const rs = Array.from({ length: SEEDS }, (_, i) => run(d, p, i + 1));
        const sum = (f: (r: ReturnType<typeof run>) => number) => rs.reduce((n, r) => n + f(r), 0);
        const fr = [0, 1, 2].map(b => pct(sum(r => r.fresh[b][0]), sum(r => r.fresh[b][1]))).join('/');
        const firstT = rs.map(r => r.firstTianhu || '—').join(',');
        const firstE = rs.map(r => r.firstEnding || '—').join(',');
        const top = rs[0].top;
        console.log(`${p.name.padEnd(5, '　')} ${fr.padEnd(18)} ${pct(sum(r => r.repeats), sum(r => r.events)).padEnd(8)} ${pct(sum(r => r.sameOpen), LIVES * SEEDS).padEnd(8)} ${String(sum(r => r.blessed)).padEnd(8)} ${`${sum(r => r.tianhu)}(${firstT})`.padEnd(11)} ${`${Math.round(sum(r => r.endings) / SEEDS)}/${rs[0].totalEndings}`.padEnd(8)} ${`${Math.round(sum(r => r.deaths) / SEEDS)}/${rs[0].totalDeaths}`.padEnd(8)} ${firstE.padEnd(7)} ${top[0]} ${pct(top[1], LIVES)}`);
        const nr = [...new Set(rs.flatMap(r => r.noRarity))];
        if (nr.length) console.log(`        模拟里没出现过（结算页按「传说」显示）：${nr.join(' ')}`);
    }
}
