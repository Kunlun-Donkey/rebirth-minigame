/** npm run validate [命格id]  —— 校验剧本，有错误时退出码为 1 */
import { listDestinies, loadRawDestiny } from './load';
import { validateDestiny } from './validate-lib';

const ids = process.argv[2] ? [process.argv[2]] : listDestinies();
let failed = false;

for (const id of ids) {
    const { raw, eventFiles } = loadRawDestiny(id);
    const r = validateDestiny(raw);
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
