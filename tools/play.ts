/**
 * 终端试玩 / 自动模拟
 *
 *   npm run play                 交互试玩（存档：.play-profile.json）
 *   npm run play -- --new        清空存档重新开始
 *   npm run sim                  随机 AI 连续轮回 2000 世，输出数值统计
 *   ./node_modules/.bin/tsx tools/play.ts --sim 500 --seed 42
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { buildDestiny, createProfile, Destiny, Engine, loadProfile, Profile, randomSeed, Rng, StepResult } from '../assets/scripts/core';
import { loadRawDestiny } from './load';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const destinyId = opt('--destiny') ?? 'desert_grass';
const data = buildDestiny(loadRawDestiny(destinyId).raw);
const RARITY_TEXT: Record<string, string> = { common: '普通', rare: '稀有', epic: '史诗', legend: '传说' };

if (flag('--sim')) simulate(Number(opt('--sim') ?? 2000), Number(opt('--seed') ?? 1));
else play().catch(e => { console.error(e); process.exit(1); });

// ───────────── 交互试玩 ─────────────

async function play() {
    const PROFILE = join(__dirname, '..', '.play-profile.json');
    const profile: Profile = flag('--new') || !existsSync(PROFILE) ? createProfile() : loadProfile(readFileSync(PROFILE, 'utf8'));
    const save = () => writeFileSync(PROFILE, JSON.stringify(profile, null, 1));
    const rl = createInterface({ input: process.stdin });
    // 行队列：TTY 与管道输入都不丢行
    const lines: string[] = [];
    let waiter: ((l: string | null) => void) | undefined;
    rl.on('line', l => (waiter ? (waiter(l), (waiter = undefined)) : lines.push(l)));
    rl.on('close', () => waiter?.(null));
    const nextLine = () => new Promise<string | null>(res => (lines.length ? res(lines.shift()!) : (waiter = res)));
    const ask = async (q: string, max: number): Promise<number> => {
        for (;;) {
            process.stdout.write(q);
            const line = await nextLine();
            if (line === null) { save(); process.exit(0); }
            const a = line.trim();
            if (a === 'q') { save(); rl.close(); process.exit(0); }
            const n = Number(a);
            if (Number.isInteger(n) && n >= 1 && n <= max) return n - 1;
        }
    };
    const C = { dim: '\x1b[2m', gold: '\x1b[33m', red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m', magenta: '\x1b[35m', bold: '\x1b[1m', off: '\x1b[0m' };
    const e = new Engine(data, profile);
    const names = (ids: string[], m: Map<string, { name: string; desc: string; rarity: string }>) =>
        ids.map(id => m.get(id)!).map(x => `${x.name}〔${RARITY_TEXT[x.rarity]}〕${C.dim}${x.desc}${C.off}`);
    const pickOne = async (title: string, list: string[]) => {
        console.log(`\n${title}`);
        list.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
        return ask('> ', list.length);
    };

    console.log(`${C.bold}《我重生了，这一世我将拿回属于我的一切》· ${data.meta.name}${C.off}  （输入 q 保存退出）`);
    for (;;) {
        const dp = e.dp;
        console.log(`\n${C.cyan}════ 轮回殿 ════${C.off}  第 ${dp.lives + 1} 世 · 轮回点 ${profile.points}`);
        const legacies = Object.entries(dp.legacy).map(([id, lv]) => `${data.legacies.get(id)?.name} Lv${lv}`);
        if (legacies.length) console.log(`传承：${legacies.join('、')}`);
        if (dp.skills.length) console.log(`技能图鉴：${dp.skills.map(id => e.skillName(id)).join('、')}（${dp.skills.length}/${data.skills.size}）`);
        if (dp.sealed.length) console.log(`种子里封存着：${dp.sealed.map(i => e.itemName(i)).join('、')}`);

        const draft = e.rollDraft(randomSeed());
        const t = draft.talents[await pickOne('选择天赋', names(draft.talents, data.talents))];
        const it = draft.items[await pickOne('选择道具', names(draft.items, data.items))];
        const c = draft.companions[await pickOne('选择伴生物', names(draft.companions, data.companions))];
        let skills: string[] | undefined;
        if (e.needSkillLoadout()) {
            skills = [];
            const slots = data.meta.settings.skillSlots;
            while (skills.length < slots) {
                const left = dp.skills.filter(id => !skills!.includes(id));
                const n = await pickOne(`携带技能（${skills.length + 1}/${slots}）`,
                    left.map(id => `${e.skillName(id)} ${C.dim}${data.skills.get(id)!.desc}${C.off}`));
                skills.push(left[n]);
            }
        }
        e.startRun({ talent: t, item: it, companion: c, skills }, randomSeed());

        for (;;) {
            while (e.run.phase === 'direction' || e.run.phase === 'event') await turn();
            if (e.run.phase === 'dying' && e.canReviveByAd()) {
                console.log(`\n${C.red}你要死了。${C.off}\n  1. 【看广告】逆天改命\n  2. 接受命运`);
                if ((await ask('> ', 2)) === 0) { printStep(e.reviveByAd()); continue; }
            }
            break;
        }

        await settlePage();
        save();
        if ((await pickOne('', ['再次重生', '退出'])) === 1) { rl.close(); return; }
    }

    /** 轮回结算页 */
    async function settlePage() {
        const s = e.settle();
        const W = 44;
        // 终端显示宽度：ASCII/拉丁/通用符号(≥·—…) 占 1，中文/全角/emoji 占 2
        const width = (t: string) => [...t.replace(/\x1b\[[0-9;]*m/g, '')].reduce((n, ch) => {
            const cp = ch.codePointAt(0)!;
            return n + (cp < 0x1100 || (cp >= 0x2000 && cp < 0x2e80) ? 1 : 2);
        }, 0);
        const line = (t = '') => console.log(`${C.dim}│${C.off} ${t}${' '.repeat(Math.max(0, W - width(t)))} ${C.dim}│${C.off}`);
        const title = (t: string) => {
            const pad = Math.max(0, W - width(t));
            console.log(`${C.dim}├${'─'.repeat(Math.floor(pad / 2))}${C.off}${C.bold} ${t} ${C.off}${C.dim}${'─'.repeat(Math.ceil(pad / 2))}┤${C.off}`);
        };
        const isEnd = s.kind === 'ending';

        console.log(`\n${C.dim}┌${'─'.repeat(W + 2)}┐${C.off}`);
        line(`${C.bold}${isEnd ? C.gold : C.red}第 ${s.life} 世 · ${isEnd ? '结局' : '死亡'}：${s.title}${C.off}${s.firstTime ? `  ${C.gold}【首次】${C.off}` : ''}`);
        line();
        line(`${C.bold}「${s.epitaph}」${C.off}`);
        line(`${C.dim}境界：${s.stageName}${C.off}`);

        title('这一世');
        line(s.explore.map(x => `${x.name.slice(0, 2)}：${x.layer || '—'}`).join('  '));
        line(s.attrs.map(a => `${a.icon ?? ''}${a.name}${a.value}`).join(' '));
        if (s.relicCandidates.length) line(`发现：${s.relicCandidates.map(i => e.itemName(i)).join('、')}`);
        if (s.learned.length) line(`${C.magenta}领悟：${s.learned.map(x => x.name).join('、')}${C.off}`);
        for (const l of s.log.slice(-5)) line(`${C.dim}· ${l}${C.off}`);

        title('轮回收获');
        if (s.legacy) line(`${C.gold}传承  ${s.legacy.name} Lv${s.legacy.level}/${s.legacy.max}${s.legacy.isNew ? '' : '（已满级）'}${C.off}`);
        if (s.legacy) line(`${C.dim}      ${data.legacies.get(s.legacy.id)!.desc}${C.off}`);
        if (s.skill) line(`${C.magenta}技能  ${s.skill.name}：${s.skill.desc}${C.off}`);
        for (const b of s.breakdown) line(`${C.dim}${b.label}${C.off}${' '.repeat(Math.max(1, 30 - width(b.label)))}+${b.value}`);
        line(`${C.bold}轮回点${' '.repeat(24)}+${s.points}${C.off}   ${C.dim}累计 ${profile.points}${C.off}`);

        title('图鉴');
        const cx = s.codex;
        line(`死法 ${cx.deaths[0]}/${cx.deaths[1]}  技能 ${cx.skills[0]}/${cx.skills[1]}  道具 ${cx.items[0]}/${cx.items[1]}  结局 ${cx.endings[0]}/${cx.endings[1]}`);
        line(`事件 ${cx.events[0]}/${cx.events[1]}`);

        if (s.goals.length) {
            title('下一世的目标');
            for (const g of s.goals) {
                line(g.ready
                    ? `${C.gold}「${g.text}」下一世可选！${C.off}${C.dim}（${g.lock}）${C.off}`
                    : `${C.cyan}「${g.text}」${C.off}${C.dim}需要 ${g.lock}${C.off}`);
            }
        }
        console.log(`${C.dim}└${'─'.repeat(W + 2)}┘${C.off}`);

        if ((await pickOne('', ['【看广告】轮回点翻倍', '继续'])) === 0) {
            e.doublePoints();
            console.log(`  ${C.gold}轮回点翻倍！本世 +${s.points}，累计 ${profile.points}${C.off}`);
        }
        if (s.relicCandidates.length) {
            const list = [...s.relicCandidates.map(i => `${e.itemName(i)} ${C.dim}${data.items.get(i)!.desc}${C.off}`), '不带'];
            const n = await pickOne(`封存遗物带到下一世（${s.relicSlots} 格）：`, list);
            e.sealRelics(n < s.relicCandidates.length ? [s.relicCandidates[n]] : []);
        }
    }

    async function turn() {
        const r = e.run;
        const skills = e.skillViews();
        const usableSkills = skills.filter(s => s.usable);
        const skillLine = skills.length
            ? '  ' + C.magenta + '技能：' + skills.map(s => `${s.name}${s.cdLeft ? `(${s.cdLeft})` : s.use ? '✓' : ''}`).join(' ') + C.off
            : '';

        if (r.phase === 'direction') {
            const status = data.meta.attrs.filter(a => !a.hidden).map(a =>
                a.id === 'water' ? `${a.icon}${r.attrs.water}/${r.attrs.waterMax}` : `${a.icon}${r.attrs[a.id]}`).join(' ');
            console.log(`\n${C.bold}第${r.season}季 · ${e.stageName(r.stage)}${C.off}  ${status}`);
            if (skillLine) console.log(skillLine);
            const opts = e.directionOptions();
            const items = e.usableItems();
            const menu: { text: string; run: () => void }[] = opts.map(o => {
                const next = o.nextLayer ? `${C.dim}→ 下一层：${o.nextLayer.name}${o.nextLayer.lockText ? `（需${o.nextLayer.lockText}）` : ''}${C.off}` : '';
                return {
                    text: o.enabled ? `${o.name}  ${C.dim}[${o.layerName}]${C.off} ${next}` : `${C.dim}${o.name}（需要：${o.lockText}）${C.off}`,
                    run: () => (o.enabled ? e.chooseDirection(o.dir) : console.log('  这个方向还去不了。')),
                };
            });
            for (const id of items) menu.push({ text: `使用道具：${e.itemName(id)} ${C.dim}${data.items.get(id)!.desc}${C.off}`, run: () => printStep(e.useItem(id)) });
            for (const s of usableSkills) menu.push({ text: `${C.magenta}施展技能：${s.name}${C.off} ${C.dim}${s.desc}${C.off}`, run: () => printStep(e.useSkill(s.id)) });
            menu.forEach((m, i) => console.log(`  ${i + 1}. ${m.text}`));
            menu[await ask('> ', menu.length)].run();
            return;
        }

        const v = e.eventView();
        console.log(`\n${v.gold ? C.gold + '✦ ' : v.sudden ? C.red + '⚡ ' : ''}${v.text}${C.off}`);
        if (skillLine) console.log(skillLine);
        const menu: { text: string; run: () => void }[] = v.choices.map(ch => {
            const extra = [
                ch.tag && `${ch.tag.startsWith('技能') ? C.magenta : C.gold}〔${ch.tag}〕${C.off}`,
                ch.memory && `${C.cyan}〔${ch.memory}〕${C.off}`,
                ch.preview && `${C.green}〔${ch.preview}〕${C.off}`,
                !ch.enabled && `${C.dim}（${ch.lockText}）${C.off}`,
            ].filter(Boolean).join(' ');
            return {
                text: `${ch.enabled ? ch.text : C.dim + ch.text + C.off} ${extra}`,
                run: () => (ch.enabled ? printStep(e.choose(ch.index)) : console.log('  条件不满足。')),
            };
        });
        for (const s of usableSkills) menu.push({ text: `${C.magenta}施展技能：${s.name}${C.off} ${C.dim}${s.desc}${C.off}`, run: () => printStep(e.useSkill(s.id)) });
        menu.forEach((m, i) => console.log(`  ${i + 1}. ${m.text}`));
        menu[await ask('> ', menu.length)].run();
    }

    function printStep(s: StepResult) {
        if (s.success === true) console.log(`${C.green}（成功）${C.off}`);
        if (s.success === false) console.log(`${C.red}（失败）${C.off}`);
        if (s.text) console.log(`  ${s.text}`);
        const d = Object.entries(s.deltas).map(([k, v]) => `${e.attrName(k)}${v > 0 ? '+' : ''}${v}`);
        if (s.gained.length) d.push(`获得 ${s.gained.map(i => e.itemName(i)).join('、')}`);
        if (s.lost.length) d.push(`失去 ${s.lost.map(i => e.itemName(i)).join('、')}`);
        if (d.length) console.log(`  ${C.dim}${d.join('  ')}${C.off}`);
        for (const m of s.messages) {
            const color = m.startsWith('【领悟') || m.startsWith('【想起') ? C.magenta : m.startsWith('【') ? C.gold : '';
            console.log(`  ${color}${m}${C.off}`);
        }
    }
}

// ───────────── 自动模拟（数值平衡） ─────────────

function simulate(lives: number, seed: number) {
    const profile = createProfile();
    const e = new Engine(data as Destiny, profile);
    const holder = { rng: seed };
    const rng = new Rng(holder);
    const buckets = [[1, 5], [6, 20], [21, 60], [61, Infinity]] as const;
    type B = { n: number; seasons: number; stages: number[]; deaths: Record<string, number>; endings: number };
    const stat: B[] = buckets.map(() => ({ n: 0, seasons: 0, stages: [0, 0, 0, 0, 0, 0], deaths: {}, endings: 0 }));
    const eventHits: Record<string, number> = {};
    const skillFirst: Record<string, number> = {};
    let skillUses = 0;
    let firstEnding = 0;

    for (let life = 1; life <= lives; life++) {
        const draft = e.rollDraft(rng.int(1e9));
        e.startRun({
            talent: draft.talents[rng.int(3)], item: draft.items[rng.int(3)], companion: draft.companions[rng.int(3)],
        }, rng.int(1e9));
        let guard = 0;
        while (e.run.phase === 'direction' || e.run.phase === 'event') {
            if (++guard > 5000) throw new Error('模拟死循环');
            const usable = e.skillViews().filter(s => s.usable);
            if (usable.length && rng.chance(0.3)) { e.useSkill(usable[rng.int(usable.length)].id); skillUses++; continue; }
            if (e.run.phase === 'direction') {
                const items = e.usableItems();
                if (items.length && (e.run.attrs.water <= 2 || rng.chance(0.15))) { e.useItem(items[rng.int(items.length)]); continue; }
                const opts = e.directionOptions().filter(o => o.enabled);
                e.chooseDirection(opts[rng.int(opts.length)].dir);
            } else {
                const v = e.eventView();
                eventHits[v.id] = (eventHits[v.id] ?? 0) + 1;
                // 简单 AI：优先选专属（带标签）的选项，其次随机
                const ok = v.choices.filter(c => c.enabled);
                const tagged = ok.filter(c => c.tag);
                const c = tagged.length && rng.chance(0.8) ? tagged[0] : ok[rng.int(ok.length)];
                e.choose(c.index);
            }
        }
        const s = e.settle();
        for (const id of e.dp.skills) skillFirst[id] ??= life;
        if (s.relicCandidates.length) e.sealRelics([s.relicCandidates[rng.int(s.relicCandidates.length)]]);
        const b = stat[buckets.findIndex(([lo, hi]) => life >= lo && life <= hi)];
        b.n++;
        b.seasons += s.seasons;
        b.stages[s.stage]++;
        if (s.kind === 'ending') { b.endings++; if (!firstEnding) firstEnding = life; }
        else b.deaths[s.id] = (b.deaths[s.id] ?? 0) + 1;
    }

    console.log(`\n模拟 ${lives} 世（随机 AI，种子 ${seed}）  首次结局：第 ${firstEnding || '—'} 世  总轮回点 ${profile.points}  技能施展 ${skillUses} 次`);
    buckets.forEach(([lo, hi], i) => {
        const b = stat[i];
        if (!b.n) return;
        const pct = (x: number) => `${Math.round((x / b.n) * 100)}%`;
        console.log(`\n第 ${lo}~${hi === Infinity ? '∞' : hi} 世（${b.n} 局）  平均存活 ${(b.seasons / b.n).toFixed(1)} 季  结局率 ${pct(b.endings)}`);
        console.log(`  境界分布：${b.stages.map((n, s) => `${e.stageName(s)} ${pct(n)}`).join(' · ')}`);
        const deaths = Object.entries(b.deaths).sort((a, c) => c[1] - a[1]).map(([id, n]) => `${data.deaths.get(id)!.name} ${pct(n)}`);
        console.log(`  死因：${deaths.join(' · ')}`);
    });
    const dp = e.dp;
    console.log(`\n传承：${Object.entries(dp.legacy).map(([id, lv]) => `${data.legacies.get(id)!.name} ${lv}`).join('、')}`);
    const skillLine = [...data.skills.keys()].map(id => `${e.skillName(id)}${skillFirst[id] ? `@${skillFirst[id]}` : '✗'}`);
    console.log(`技能首次领悟（第几世）：${skillLine.join('、')}`);
    const never = [...data.events.keys()].filter(id => !eventHits[id]);
    if (never.length) console.log(`从未触发的事件（${never.length}）：${never.join(', ')}`);
}
