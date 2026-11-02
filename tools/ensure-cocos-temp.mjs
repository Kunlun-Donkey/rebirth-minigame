/**
 * 根目录 tsconfig.json 是 Cocos 工程要求的，它继承 temp/tsconfig.cocos.json（由 Cocos 编辑器生成）。
 * Linux 端没有编辑器，vitest / tsx 读取 tsconfig 时会因找不到该文件而报错，
 * 所以在这里生成一个最小占位版本。temp/ 已在 .gitignore 中，不会提交；Windows 上由 Cocos 覆盖。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'temp', 'tsconfig.cocos.json');
if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({
        compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            experimentalDecorators: true,
            useDefineForClassFields: false,
        },
    }, null, 2));
    console.log('[ensure-cocos-temp] 已生成占位 temp/tsconfig.cocos.json（仅 Linux 本地，Cocos 会覆盖）');
}
