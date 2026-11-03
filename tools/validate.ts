/** npm run validate [命格id]  —— 校验剧本，有错误时退出码为 1 */
import { listDestinies, loadIndex, loadRawDestiny } from './load';
import { validateDestiny, validateIndex, World } from './validate-lib';

const ids = process.argv[2] ? [process.argv[2]] : listDestinies();
let failed = false;

const indexErrors = validateIndex(loadIndex(), listDestinies());
console.log('\n══ 命格索引 index.json ══');
for (const e of indexErrors) console.log(`  ✖ ${e}`);
console.log(indexErrors.length ? `  ✖ ${indexErrors.length} 个错误` : '  ✔ 无错误');
if (indexErrors.length) failed = true;

const world: World = {};
for (const id of listDestinies()) world[id] = { endings: loadRawDestiny(id).raw.meta.endings.map(e => e.id) };

for (const id of ids) {
    const { raw, eventFiles } = loadRawDestiny(id);
    const r = validateDestiny(raw, world);
    console.log(`\n══ ${id}「${raw.meta.name}」══`);
    console.log(Object.entries(r.stats).map(([k, v]) => `${k} ${v}`).join(' · '));
    const withFile = (s: string) => {
        const m = /^事件 (\S+?)[.:]/.exec(s);
        return m && eventFiles[m[1]] ? `[${eventFiles[m[1]]}] ${s}` : s;
    };
    for (const w of r.warnings) console.log(`  ⚠ ${withFile(w)}`);
    for (const e of r.errors) console.log(`  ✖ ${withFile(e)}`);
    if (r.errors.length) failed = true;
    console.log(r.errors.length ? `  ✖ ${r.errors.length} 个错误` : '  ✔ 无错误');
}

process.exit(failed ? 1 : 0);
