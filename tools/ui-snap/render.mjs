// 把 /tmp/ui-snap/*.html 截图成 PNG，并汇总页面内自动检查出的问题。
// 用法：node tools/ui-snap/render.mjs [文件名过滤]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT = '/tmp/ui-snap';
const filter = process.argv[2] ?? '';
const index = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8')).filter((p) => p.file.includes(filter));
const report = [];
for (const p of index) {
  const url = `file://${join(OUT, p.file)}`;
  const args = ['--headless=old', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${p.W},${p.H}`];
  execFileSync('google-chrome', [...args, `--screenshot=${join(OUT, p.file.replace('.html', '.png'))}`, url], { stdio: 'ignore' });
  const dom = execFileSync('google-chrome', [...args, '--virtual-time-budget=2000', '--dump-dom', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const m = dom.match(/<pre id="issues">([\s\S]*?)<\/pre>/);
  const issues = m && m[1] ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) : [];
  report.push({ ...p, issues });
  if (issues.length) console.log(`✗ ${p.title}（${p.file}）\n  ` + issues.map((i) => JSON.stringify(i)).join('\n  '));
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const n = report.reduce((a, r) => a + r.issues.length, 0);
console.log(`\n${report.length} 个页面，${n} 个问题`);
process.exit(n ? 1 : 0);
