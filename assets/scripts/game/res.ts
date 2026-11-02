/**
 * 资源分包：首屏资源（剧本数据、主界面背景/标题/按钮/面板）在主包 resources，
 * 其余贴图和音频在 assets/subres（微信小游戏分包，bundle 名 subres），进主界面后后台拉取。
 * 两个 bundle 内的相对路径一致（textures/…、audio/…），调用方不用关心资源在哪个包。
 */
import { assetManager, resources } from 'cc';

export type Bundle = typeof resources;

export const SUB_BUNDLE = 'subres';

let sub: Promise<Bundle | null> | null = null;

/** 加载分包（只发起一次；失败返回 null，下次调用会重试） */
export function loadSubBundle(): Promise<Bundle | null> {
    if (!sub) {
        sub = new Promise(resolve => {
            assetManager.loadBundle(SUB_BUNDLE, (err, bundle) => {
                if (err || !bundle) {
                    console.warn('[res] 分包加载失败', err);
                    sub = null;
                    return resolve(null);
                }
                resolve(bundle);
            });
        });
    }
    return sub;
}

/** 资源所在的 bundle：主包有就用主包，否则等分包（分包失败时回落主包，由调用方按缺资源处理） */
export async function bundleOf(path: string): Promise<Bundle> {
    if (resources.getInfoWithPath(path)) return resources;
    return (await loadSubBundle()) || resources;
}
