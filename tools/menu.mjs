/**
 * 命令行试玩菜单（Windows 双击 play.bat / 任意平台 `node tools/menu.mjs`）。
 *
 * 中文菜单放在 Node 里而不是 .bat 里：cmd 读取含 UTF-8 中文的批处理会切错行、乱码，
 * Node 写控制台走 Unicode 接口，不受代码页影响。
 * 首次运行自动 npm install；用 Node 直接启动 tsx，不依赖 PATH。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
    console.log(`[错误] Node.js 版本太低（当前 ${process.versions.node}），请安装 18 或更高版本：https://nodejs.org/`);
    process.exit(1);
}

function ensureDeps() {
    if (existsSync(TSX)) return true;
    console.log('首次运行，正在安装依赖（npm install），大约需要 1 分钟……\n');
    // Windows 上 npm 是 npm.cmd，需要经由 shell 启动
    const r = spawnSync('npm install', { cwd: ROOT, stdio: 'inherit', shell: true });
    if (r.status !== 0 || !existsSync(TSX)) {
        console.log('\n[错误] 依赖安装失败。请检查网络后重试，或在本目录手动执行：npm install');
        return false;
    }
    return true;
}

function runTs(script, args = []) {
    spawnSync(process.execPath, [join(ROOT, 'tools', 'ensure-cocos-temp.mjs')], { cwd: ROOT, stdio: 'inherit' });
    spawnSync(process.execPath, [TSX, join(ROOT, 'tools', script), ...args], { cwd: ROOT, stdio: 'inherit' });
}

function ask(q) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(q, a => { rl.close(); resolve(a === undefined ? null : a.trim()); }))
        .catch(() => null);
}

const MENU = `
============================================
  我重生了，这一世我将拿回属于我的一切
  命令行试玩（界面以游戏内为准）
============================================
  1. 继续试玩（读取上次的轮回存档）
  2. 清空存档，从第 1 世重新开始
  3. 自动模拟 2000 世，看数值统计
  4. 剧本校验（检查事件 / 条件写错）
  0. 退出
--------------------------------------------
  试玩中：输入编号回车选择，输入 q 保存退出
============================================`;

async function main() {
    if (!ensureDeps()) {
        await ask('\n按回车退出……');
        process.exit(1);
    }
    for (;;) {
        console.log(MENU);
        const c = await ask('请选择：');
        if (c === null || c === '0') return;
        if (c === '1') runTs('play.ts');
        else if (c === '2') runTs('play.ts', ['--new']);
        else if (c === '3') runTs('play.ts', ['--sim', '2000']);
        else if (c === '4') runTs('validate.ts');
        else continue;
        if ((await ask('\n按回车返回菜单……')) === null) return;
    }
}

main();
