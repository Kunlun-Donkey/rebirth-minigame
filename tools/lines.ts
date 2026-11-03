/**
 * npm run lines <命格id>  —— 打印线路图：每条线路的事件数、入口、导出状态（谁设置 / 谁读取）、通向的结局，以及交叉事件。
 * 用来检查「导出了没人用」「进去了出不来」「线路之间有没有交汇」。
 */
import { walkCond } from '../assets/scripts/core/condition';
import { buildDestiny } from '../assets/scripts/core/data';
import type { Cond, Effect, GameEvent } from '../assets/scripts/core/types';
import { loadRawDestiny } from './load';

const id = process.argv[2];
if (!id) {
    console.log('用法：npm run lines <命格id>');
    process.exit(1);
}
const { raw } = loadRawDestiny(id);
const d = buildDestiny(raw);

/** 某个事件读取的线路状态 */
function reads(ev: GameEvent): string[] {
    const out: string[] = [];
    const walk = (c?: Cond) => c && walkCond(c.ast, l => { if (l.t === 'has' && (l.kind === 'line' || l.kind === 'ever')) out.push(`${l.kind === 'ever' ? '前世' : ''}${l.id}`); });
    walk(ev.require);
    for (const c of ev.choices) { walk(c.require); walk(c.showIf); }
    return out;
}
function effects(ev: GameEvent): Effect[] {
    return ev.choices.flatMap(c => [c.success.effect, ...(c.fail ? [c.fail.effect] : [])]);
}

const events = [...d.events.values()];
for (const l of d.lines.values()) {
    const evs = events.filter(e => e.line === l.id);
    const entries = evs.filter(e => !e.chainOnly);
    const endings = [...new Set(evs.flatMap(e => effects(e).map(x => x.ending).filter(Boolean)))];
    console.log(`\n■ ${l.name}（${l.id}）  ${evs.length} 个事件 · 入口 ${entries.map(e => e.id.split('/')[1]).join('、')}`);
    if (l.summary) console.log(`  ${l.summary}`);
    for (const [st, desc] of Object.entries(l.states)) {
        const full = `${l.id}.${st}`;
        const setBy = events.filter(e => effects(e).some(x => x.states.includes(full))).map(e => e.id);
        const readBy = events.filter(e => reads(e).some(r => r.replace('前世', '') === full)).map(e => e.id);
        const outside = readBy.filter(r => !r.startsWith(`${l.id}/`));
        console.log(`  · ${st}（${desc}）  设置 ${setBy.length} 处 · 读取 ${readBy.length} 处${outside.length ? ` → ${outside.join('、')}` : ''}`);
    }
    if (endings.length) console.log(`  结局：${endings.map(e => d.endings.get(e!)?.name ?? e).join('、')}`);
    const ext = [...new Set(evs.flatMap(reads).filter(r => !r.replace('前世', '').startsWith(`${l.id}`)))];
    if (ext.length) console.log(`  依赖其他线路：${ext.join('、')}`);
}

const cross = events.filter(e => e.cross);
console.log(`\n■ 交叉事件（${cross.length}）`);
for (const ev of cross) {
    const end = effects(ev).map(x => x.ending).filter(Boolean);
    console.log(`  · ${ev.id}：${reads(ev).join(' × ')}${end.length ? `  → 结局 ${end.map(e => d.endings.get(e!)?.name).join('、')}` : ''}`);
}
const loose = [...d.endings.keys()].filter(e => !events.some(ev => effects(ev).some(x => x.ending === e)));
if (loose.length) console.log(`\n不由事件触发的结局（境界 / 寿终）：${loose.map(e => d.endings.get(e)?.name).join('、')}`);
