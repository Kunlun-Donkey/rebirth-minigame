/**
 * 真人视角读一世：随机打 N-1 世（积累传承 / 记忆），把第 N 世的每个事件、选项（含锁定 / 专属标签 / 前世记忆）、
 * 结果与提示、最后的墓志铭和天道评语全部打出来，像玩家一样从头读，找文案串台、重复、不通顺。
 *   npm run story -- <命格id> [第几世=1] [种子=7]
 */
import { buildDestiny, createProfile, Engine, Rng } from '../assets/scripts/core';
import { loadRawDestiny } from './load';
const id = process.argv[2]; const lives = Number(process.argv[3] ?? 1); const seed = Number(process.argv[4] ?? 7);
const d = buildDestiny(loadRawDestiny(id).raw); const e = new Engine(d, createProfile()); const rng = new Rng({ rng: seed });
for (let l = 0; l < lives; l++) {
  const dr = e.rollDraft(rng.int(1e9)); e.startRun({ talent: dr.talents[0], item: dr.items[0], companion: dr.companions[0] }, rng.int(1e9));
  if (l < lives - 1) { let g = 0; while ((e.run.phase === 'direction' || e.run.phase === 'event') && g++ < 3000) { if (e.run.phase === 'direction') { const o = e.directionOptions().filter(x => x.enabled); e.chooseDirection(o[rng.int(o.length)].dir); } else { const c = e.eventView().choices.filter(x => x.enabled); e.choose(c[rng.int(c.length)].index); } } e.settle(); continue; }
  console.log(`== 第${e.run.life}世 ${d.meta.name} 地图:${e.mapDef()?.name ?? '-'} 天赋:${dr.talents[0]} 道具:${dr.items[0]} 伙伴:${dr.companions[0]}`);
  let g = 0;
  while ((e.run.phase === 'direction' || e.run.phase === 'event') && g++ < 3000) {
    if (e.run.phase === 'direction') { const o = e.directionOptions().filter(x => x.enabled); const c = o[rng.int(o.length)]; e.chooseDirection(c.dir); console.log(`\n[季${e.run.season}·${e.stageName(e.run.stage)}] → ${c.name}（${c.layerName}）`); }
    else {
      const v = e.eventView(); const cs = v.choices.filter(x => x.enabled); const c = cs[rng.int(cs.length)];
      console.log(`  ${v.gold ? '✦' : v.sudden ? '⚡' : '·'}${v.id}：${v.text}`);
      console.log(`    选项：${v.choices.map(x => (x.enabled ? '' : '🔒') + x.text + (x.tag ? `[${x.tag}]` : '') + (x.memory ? `{${x.memory}}` : '')).join(' / ')}`);
      const st = e.choose(c.index);
      console.log(`    ▶ ${c.text} ${st.success === false ? '(失败)' : ''}：${st.text}`);
      for (const m of st.messages) console.log(`      ${m}`);
    }
  }
  const s = e.settle(); console.log(`\n== 结算：${s.title}：${s.epitaph}\n   ${s.remark}`);
}
