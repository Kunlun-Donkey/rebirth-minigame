/** 从 resources 加载命格剧本，组装成 RawDestiny（与 Node 端 tools/load.ts 等价） */
import { JsonAsset, resources, SpriteFrame } from 'cc';
import { buildDestiny, Destiny, RawDestiny, RawEvent } from '../core';

function loadJson<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
        resources.load(path, JsonAsset, (err, asset) => (err || !asset ? reject(err ?? new Error(path)) : resolve(asset.json as T)));
    });
}

function loadJsonDir<T>(path: string): Promise<{ name: string; json: T }[]> {
    return new Promise((resolve, reject) => {
        resources.loadDir(path, JsonAsset, (err, assets) =>
            err ? reject(err) : resolve((assets ?? []).map(a => ({ name: a.name, json: a.json as T }))),
        );
    });
}

export async function loadDestiny(id: string): Promise<Destiny> {
    const base = `data/destinies/${id}`;
    const [meta, talents, items, companions, skills, eventFiles] = await Promise.all([
        loadJson<RawDestiny['meta']>(`${base}/destiny`),
        loadJson<RawDestiny['talents']>(`${base}/talents`),
        loadJson<RawDestiny['items']>(`${base}/items`),
        loadJson<RawDestiny['companions']>(`${base}/companions`),
        loadJson<RawDestiny['skills']>(`${base}/skills`).catch(() => []),
        loadJsonDir<RawEvent[]>(`${base}/events`),
    ]);
    const events = eventFiles.sort((a, b) => a.name.localeCompare(b.name)).flatMap(f => f.json);
    return buildDestiny({ meta, talents, items, companions, skills, events });
}

/** 贴图缓存：缺图返回 null（不报错），由 UI 兜底 */
const spriteCache = new Map<string, Promise<SpriteFrame | null>>();
export function loadSpriteFrame(path: string): Promise<SpriteFrame | null> {
    let p = spriteCache.get(path);
    if (!p) {
        p = new Promise(resolve => {
            resources.load(`${path}/spriteFrame`, SpriteFrame, (err, sf) => resolve(err || !sf ? null : sf));
        });
        spriteCache.set(path, p);
    }
    return p;
}
