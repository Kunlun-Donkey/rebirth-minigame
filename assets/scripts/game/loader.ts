/** 从 resources 加载命格剧本，组装成 RawDestiny（与 Node 端 tools/load.ts 等价） */
import { ImageAsset, JsonAsset, resources, SpriteFrame } from 'cc';
import { buildDestiny, Destiny, RawDestiny, RawEvent } from '../core';
import { bundleOf } from './res';

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

/** 贴图缓存：缺图返回 null（不报错），由 UI 兜底；分包里的图会等分包下载完再加载 */
const spriteCache = new Map<string, Promise<SpriteFrame | null>>();
export function loadSpriteFrame(path: string): Promise<SpriteFrame | null> {
    let p = spriteCache.get(path);
    if (!p) {
        p = bundleOf(path).then(bundle => new Promise<SpriteFrame | null>(resolve => {
            // 图片导入类型为 sprite-frame 时直接取子资源；否则（如 texture）读原图自行生成 SpriteFrame
            bundle.load(`${path}/spriteFrame`, SpriteFrame, (err, sf) => {
                if (!err && sf) return resolve(sf);
                bundle.load(path, ImageAsset, (err2, img) => resolve(err2 || !img ? null : SpriteFrame.createWithImage(img)));
            });
        }));
        spriteCache.set(path, p);
    }
    return p;
}
