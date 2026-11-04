/**
 * 分享卡巡检：每个命格随机打若干世，挑出不同结局 / 死法（含天胡）的真实结算数据，
 * 用游戏里同一份 drawShareCard 在 headless Chrome 画出来，截图到 /tmp/share-snap/cards.png。
 *   npm run share:snap
 * 看的是：墓志铭有没有被截断、恩怨和稀有度会不会挤在一起、标题会不会超宽。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDestiny, createProfile, Engine, Rng } from '../../assets/scripts/core';
import type { ShareCardData } from '../../assets/scripts/game/sharecard';
import { listDestinies, loadRawDestiny } from '../load';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const OUT = '/tmp/share-snap';
mkdirSync(OUT, { recursive: true });

const cards: ShareCardData[] = [];
for (const id of listDestinies()) {
    const d = buildDestiny(loadRawDestiny(id).raw);
    const e = new Engine(d, createProfile());
    const rng = new Rng({ rng: 17 });
    const picked = new Set<string>();
    for (let life = 1; life <= 120 && picked.size < 4; life++) {
        const dr = e.rollDraft(rng.int(1e9));
        e.startRun({ talent: dr.talents[0], item: dr.items[0], companion: dr.companions[0] }, rng.int(1e9));
        if (life % 15 === 0) e.run.blessed = true;
        let g = 0;
        while ((e.run.phase === 'direction' || e.run.phase === 'event') && g++ < 3000) {
            if (e.run.phase === 'direction') { const o = e.directionOptions().filter(x => x.enabled); e.chooseDirection(o[rng.int(o.length)].dir); }
            else { const c = e.eventView().choices.filter(x => x.enabled); e.choose(c[rng.int(c.length)].index); }
        }
        const s = e.settle();
        const key = s.tianhu ? 'tianhu' : `${s.kind}:${s.id}`;
        if (picked.has(key) || (picked.size >= 2 && !s.feuds.length && s.kind === 'death' && !s.tianhu)) continue;
        picked.add(key);
        cards.push({
            game: '这一世我重生了', destiny: d.meta.name, life: s.life, kind: s.kind, tianhu: s.tianhu,
            title: s.title, epitaph: s.epitaph, stageName: s.stageName, seasons: s.seasons, feuds: s.feuds,
            rarity: { tier: s.kind === 'ending' ? '史诗' : '稀有', text: '少见：约 3% 的轮回会走到这里' },
        });
    }
}

const entry = join(OUT, 'entry.ts');
writeFileSync(entry, `import { drawShareCard, CARD_W, CARD_H } from '${join(ROOT, 'assets/scripts/game/sharecard')}';
const cards = ${JSON.stringify(cards)};
for (const c of cards) { const cv = document.createElement('canvas'); cv.width = CARD_W; cv.height = CARD_H; drawShareCard(cv.getContext('2d')!, c as never); cv.style.cssText = 'width:400px;margin:4px'; document.body.appendChild(cv); }
`);
execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [entry, '--bundle', '--format=iife', `--outfile=${join(OUT, 'bundle.js')}`, '--log-level=error']);
writeFileSync(join(OUT, 'index.html'), '<html><body style="margin:0;background:#333;display:flex;flex-wrap:wrap;width:1640px"><script src="bundle.js"></script></body></html>');
const rows = Math.ceil(cards.length / 4);
execFileSync('google-chrome', ['--headless=old', '--disable-gpu', '--hide-scrollbars', `--window-size=1640,${rows * 330 + 10}`, '--virtual-time-budget=2000',
    `--screenshot=${join(OUT, 'cards.png')}`, `file://${join(OUT, 'index.html')}`], { stdio: 'ignore' });
console.log(`分享卡 ${cards.length} 张 → ${join(OUT, 'cards.png')}`);
