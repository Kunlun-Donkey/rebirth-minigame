import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** UI 巡检（npm run ui:snap）：只跑 tools/ui-snap 下的快照脚本，不进 npm test */
export default defineConfig({
    resolve: {
        alias: { cc: fileURLToPath(new URL('./tests/fake-cc.ts', import.meta.url)) },
    },
    test: { include: ['tools/ui-snap/*.snap.ts'] },
});
