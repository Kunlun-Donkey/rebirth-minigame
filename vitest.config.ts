import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    resolve: {
        // 游戏层 import 'cc'：测试时用假运行时（tests/fake-cc.ts）
        alias: { cc: fileURLToPath(new URL('./tests/fake-cc.ts', import.meta.url)) },
    },
});
