/**
 * UI 巡检：在假 cc 运行时里把每个命格的每类页面 / 弹窗都走一遍，逐个导出 HTML 快照。
 * 运行：npm run ui:snap   （之后 node tools/ui-snap/render.mjs 截图 + 汇总问题）
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { Label, Node, sys, view } from '../../tests/fake-cc';
import { Game } from '../../assets/scripts/game/game';
import { CONFIG } from '../../assets/scripts/game/config';
import { showSplash } from '../../assets/scripts/game/screens/splash';
import { showUnlockReveal } from '../../assets/scripts/game/screens/destiny';
import { showRun } from '../../assets/scripts/game/screens/run';
import { showCodex } from '../../assets/scripts/game/screens/codex';
import { destinyProfile, Rng } from '../../assets/scripts/core';
import { toHtml } from './serialize';

const OUT = '/tmp/ui-snap';
const flush = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };
CONFIG.splashMs = 0;

/** 屏幕尺寸：标准 16:9 + 全面屏 19.5:9 */
const SIZES: [string, number, number][] = [['std', 750, 1334], ['tall', 750, 1624]];
const DESTINIES = ['desert_grass', 'worker', 'local_dog', 'caterpillar', 'mantis_shrimp', 'crocodile'];

function walk(n: Node, fn: (n: Node) => void) { fn(n); for (const c of n.children) walk(c, fn); }
const labels = (n: Node) => { const o: string[] = []; walk(n, x => { const l = x.getComponent(Label); if (l && x.active) o.push(l.string); }); return o; };
const taps = (n: Node) => { const o: Node[] = []; walk(n, x => { if (x.isValid && x.active && x.listeners.has(Node.EventType.TOUCH_END)) o.push(x); }); return o; };
const tap = (n: Node) => { n.emit(Node.EventType.TOUCH_START); n.emit(Node.EventType.TOUCH_END); };

it('UI 巡检快照', async () => {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    const index: { file: string; title: string; W: number; H: number }[] = [];

    for (const [sz, vw, vh] of SIZES) {
        (view as { getVisibleSize: () => { width: number; height: number } }).getVisibleSize = () => ({ width: vw, height: vh });
        for (const did of DESTINIES) {
            sys.localStorage.clear?.();
            const g = new Game(new Node('Canvas') as never);
            await g.boot();
            await flush(4);
            const root = g.screen.parent!;
            const seen = new Set<string>();
            const snap = (title: string) => {
                const file = `${sz}_${did}_${String(index.length).padStart(3, '0')}.html`;
                writeFileSync(join(OUT, file), toHtml(root, g.W, g.H, title));
                index.push({ file, title: `[${sz}] ${did} · ${title}`, W: g.W, H: g.H });
            };
            const sig = () => {
                const t0 = g.overlay.children.length ? labels(g.overlay)[0] ?? '' : '';
                const ov = t0.length > 8 ? '结果弹窗' : t0;
                const scr = g.screen.children[0]?.name ?? '?';
                const ph = scr === 'run' ? g.engine.run.phase + (g.engine.run.phase === 'event' ? (g.engine.eventView().gold ? '-gold' : g.engine.eventView().sudden ? '-sudden' : '') : '') : '';
                return `${scr}|${ph}|${ov.replace(/\d+/g, '#').slice(0, 8)}`;
            };
            const snapIfNew = async () => { const s = sig(); if (!seen.has(s)) { seen.add(s); await flush(8); snap(s); } };

            // 解锁全部命格并切到目标命格
            g.save.profile.points = 5000;
            for (const d of DESTINIES) destinyProfile(g.save.profile, d).bestStage = 9;
            if (did === 'desert_grass') {
                g.reset(); showSplash(g, '正在轮回……'); snap('启动页'); g.goMenu(); await flush();
                snap('主菜单');
                g.goDestinySelect('menu'); await flush(); snap('命格选择');
                tap(taps(g.screen).find(n => labels(n).some(l => l.startsWith('随缘投胎')))!); await flush(8); snap('随缘投胎');
                g.reset(); g.save.spinBonus = null; g.save.spinDay = '';
                showUnlockReveal(g, ['local_dog']); await flush(8); snap('新命格解锁'); g.reset();
            }
            await g.switchDestiny(did); await flush(6);

            // 第一世一键开局页 → 我要自己挑 → 开局抽卡 3 步
            await snapIfNew();
            const own = taps(g.screen).find(n => labels(n).includes('我要自己挑'));
            if (own) { tap(own); await flush(); }
            for (let i = 0; i < 4; i++) {
                await snapIfNew();
                const c = taps(g.screen).find(n => n.name.startsWith('card_'));
                if (!c) break;
                tap(c); await flush();
            }
            await snapIfNew();
            const go = taps(g.screen).find(n => labels(n).some(l => l.replace(/\s/g, '').includes('重生')));
            if (go) { tap(go); await flush(6); }

            // 随机游走，遇到新页面 / 新弹窗就截图
            const rng = new Rng({ rng: 11 });
            const start = index.length;
            for (let i = 0; i < 1200 && index.length - start < 60; i++) {
                await snapIfNew();
                const layer = g.overlay.children.length ? g.overlay : g.screen;
                const pool = taps(layer).filter(n => n.name !== 'modal' && !labels(n).some(l => /菜单|重新投胎|⇄/.test(l)));
                const list = pool.length ? pool : taps(layer);
                if (!list.length) break;
                tap(list[rng.int(list.length)]); await flush();
            }
            // 跨命格彩蛋 + 嫌弃式前世 + 稳 / 离谱标签（强制进入一个彩蛋事件）
            for (const d of DESTINIES) {
                const dp = destinyProfile(g.save.profile, d);
                dp.lives = Math.max(dp.lives, 30);
                if (d !== did) dp.codex.endings = [...new Set([...dp.codex.endings, ...['celestial', 'guardian', 'eclipse', 'xiaocui_dog', 'mountain_god', 'tree_demon', 'oasis_lord', 'jianmu', 'devourer', 'wind_seed', 'fairy', 'valley_queen', 'butterfly_effect', 'xiaoyu_butterfly', 'cicada_king', 'sea_god', 'dragon_general', 'lets_go', 'aquarium_star', 'dragon', 'river_god', 'sewer_king', 'internet_star', 'mars_ancestor', 'plover_friend']])];
            }
            const cameo = [...g.engine.data.events.values()].find(e => e.cameo && e.choices.some(c => c.absurd || c.chance !== undefined));
            if (cameo && g.engine.run && g.engine.run.phase !== 'over') {
                g.overlay.destroyAllChildren();
                Object.assign(g.engine.run, { phase: 'event', event: cameo.id, dir: undefined, revealAll: false });
                g.engine.dp.memory[`${cameo.id}#0`] = { life: 0, text: '你在这里没了', dead: 3 };
                for (const k of Object.keys(g.engine.run.attrs)) g.engine.run.attrs[k] = Math.max(g.engine.run.attrs[k], 30);
                g.reset(); showRun(g); await flush(4); snap('跨命格彩蛋');
                g.act(() => g.engine.choose(g.engine.eventView().choices.find(c => c.enabled)!.index)); await flush(4); snap('彩蛋结果');
            }
            // 结局结算页（强制，带本世恩怨与天道评语）
            const ending = [...g.engine.data.endings.keys()][0];
            if (ending && g.engine.run) {
                g.engine.run.feuds = ['老刀扎了满嘴刺', '偷猎的人被送到了派出所', '海鸥挨了一记直拳'];
                g.overlay.destroyAllChildren();
                (g.engine.run as { over?: unknown; phase: string }).over = { kind: 'ending', id: ending };
                g.engine.run.phase = 'over';
                try { g.goSettle(); await flush(4); snap('结局结算'); } catch { /* 引擎不支持强制结局时跳过 */ }
                // 生平弹窗（塞满生平大事，看分页）
                const bio = taps(g.screen).find(n => labels(n).some(l => l.startsWith('生平')));
                if (bio) {
                    g.engine.settle().log.push(...Array.from({ length: 30 }, (_, i) => `第${i + 1}季，发生了一件值得写进生平的事。`));
                    tap(bio); await flush(4); snap('生平');
                    g.overlay.destroyAllChildren();
                }
            }
            // 图鉴墙全部页签（收集一部分，看已收集 / 剪影两种卡）
            const dp = g.engine.dp;
            const v0 = g.engine.codexView();
            dp.codex.deaths = v0.deaths.slice(0, 5).map(x => x.id);
            dp.deathCount = Object.fromEntries(dp.codex.deaths.map((id, i) => [id, i + 1]));
            dp.codex.feuds = v0.feuds.slice(0, 3).map(x => x.text);
            dp.codex.events = [...dp.codex.events, ...v0.cameos.slice(0, 3).map(x => x.id)];
            dp.codex.items = v0.items.slice(0, 4).map(x => x.id);
            dp.ever = [...(dp.ever ?? []), ...v0.lines.slice(0, 3).flatMap(l => [l.id, ...l.states.slice(0, 1).map(s => `${l.id}.${s.id}`)])];
            for (const tab of ['endings', 'deaths', 'lines', 'skills', 'items', 'cameos', 'feuds'] as const) {
                if (tab !== 'endings' && tab !== 'deaths' && !v0[tab].length) continue;
                g.reset(); showCodex(g, tab); await flush(4); snap(`图鉴墙·${tab}`);
                if (tab === 'lines') {
                    const c = taps(g.screen).find(n => n.name === 'cell');
                    if (c) { tap(c); await flush(4); snap('图鉴墙·故事线详情'); g.overlay.destroyAllChildren(); }
                }
            }
            g.reset(); showCodex(g, 'cameos', 9); await flush(4); snap('图鉴墙·末页');
        }
    }
    writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
    console.log(`UI 快照 ${index.length} 张 → ${OUT}`);
}, 300_000);
