/**
 * 加载命格剧本，组装成 RawDestiny（与 Node 端 tools/load.ts 等价）。
 * 默认开放的命格剧本在主包 resources；游玩解锁的命格在分包 subres（控制主包体积，见 docs/dev/cocos-setup.md 第三节）。
 */
import { ImageAsset, JsonAsset, resources, SpriteFrame } from 'cc';
import { buildDestiny, Destiny, DestinyIndex, RawDestiny, RawEvent, RawLine } from '../core';
import { Bundle, bundleOf } from './res';
import type { RarityTable } from './brag';

function loadJson<T>(path: string, bundle: Bundle = resources): Promise<T> {
    return new Promise((resolve, reject) => {
        bundle.load(path, JsonAsset, (err, asset) => (err || !asset ? reject(err ?? new Error(path)) : resolve(asset.json as T)));
    });
}

function loadJsonDir<T>(path: string, bundle: Bundle): Promise<{ name: string; json: T }[]> {
    return new Promise((resolve, reject) => {
        bundle.loadDir(path, JsonAsset, (err, assets) =>
            err ? reject(err) : resolve((assets ?? []).map(a => ({ name: a.name, json: a.json as T }))),
        );
    });
}

export function loadDestinyIndex(): Promise<DestinyIndex> {
    return loadJson<DestinyIndex>('data/destinies/index');
}

/** 稀有度表（npm run rarity 生成）；缺失时不显示稀有度 */
export function loadRarity(): Promise<RarityTable | null> {
    return loadJson<RarityTable>('data/destinies/rarity').catch(() => null);
}

export async function loadDestiny(id: string): Promise<Destiny> {
    const base = `data/destinies/${id}`;
    const b = await bundleOf(`${base}/destiny`);
    const [meta, talents, items, companions, skills, eventFiles, lineFiles, crossFiles] = await Promise.all([
        loadJson<RawDestiny['meta']>(`${base}/destiny`, b),
        loadJson<RawDestiny['talents']>(`${base}/talents`, b),
        loadJson<RawDestiny['items']>(`${base}/items`, b),
        loadJson<RawDestiny['companions']>(`${base}/companions`, b),
        loadJson<RawDestiny['skills']>(`${base}/skills`, b).catch(() => []),
        loadJsonDir<RawEvent[]>(`${base}/events`, b),
        // 线路与交叉事件目录可能不存在（老命格）
        loadJsonDir<RawLine>(`${base}/lines`, b).catch(() => []),
        loadJsonDir<RawEvent[]>(`${base}/crossings`, b).catch(() => []),
    ]);
    const byName = <T>(fs: { name: string; json: T }[]) => fs.sort((a, b) => a.name.localeCompare(b.name)).map(f => f.json);
    const events = byName(eventFiles).flat();
    return buildDestiny({ meta, talents, items, companions, skills, events, lines: byName(lineFiles), crossings: byName(crossFiles).flat() });
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
