/**
 * 平台适配：微信小游戏优先，其它环境（编辑器预览 / 浏览器）自动降级。
 * 游戏逻辑只依赖这里的接口，不直接调用 wx。
 */
import { sys } from 'cc';
import { CONFIG } from './config';

declare const wx: any;
const isWx = () => typeof wx !== 'undefined' && !!wx.getSystemInfoSync;

export const Platform = {
    isWx,

    getItem(key: string): string | null {
        try {
            if (isWx()) {
                const v = wx.getStorageSync(key);
                return v === '' || v === undefined ? null : String(v);
            }
            return sys.localStorage.getItem(key);
        } catch (e) {
            console.warn('[platform] 读取存档失败', e);
            return null;
        }
    },

    setItem(key: string, value: string): void {
        try {
            if (isWx()) wx.setStorageSync(key, value);
            else sys.localStorage.setItem(key, value);
        } catch (e) {
            console.warn('[platform] 写入存档失败', e);
        }
    },

    removeItem(key: string): void {
        try {
            if (isWx()) wx.removeStorageSync(key);
            else sys.localStorage.removeItem(key);
        } catch (e) {
            console.warn('[platform] 删除存档失败', e);
        }
    },

    /** 激励视频：看完返回 true；中途关闭 / 拉取失败返回 false */
    showRewardedAd(scene: string): Promise<boolean> {
        if (!isWx() || !CONFIG.rewardedAdUnitId) {
            console.log(`[platform] 激励视频 Mock（${scene}）：视为已看完`);
            return Promise.resolve(true);
        }
        return new Promise(resolve => {
            const ad = getRewardedAd();
            const onClose = (res: { isEnded?: boolean } | undefined) => {
                ad.offClose(onClose);
                resolve(!res || res.isEnded !== false);
            };
            ad.onClose(onClose);
            ad.show().catch(() =>
                ad.load()
                    .then(() => ad.show())
                    .catch((err: unknown) => {
                        ad.offClose(onClose);
                        console.warn('[platform] 激励视频拉取失败', err);
                        Platform.toast('视频暂时没有准备好，稍后再试');
                        resolve(false);
                    }),
            );
        });
    },

    /** 主动分享；imageUrl 为小游戏包内路径（build-templates/wechatgame/ 下的文件），缺省用截屏 */
    share(title: string, query = '', imageUrl?: string): void {
        if (!isWx()) {
            console.log(`[platform] 分享 Mock：${title}${imageUrl ? ` [${imageUrl}]` : ''}`);
            return;
        }
        wx.shareAppMessage(imageUrl ? { title, query, imageUrl } : { title, query });
    },

    /** 右上角菜单的被动分享 + 朋友圈（每次分享时取当前命格的文案与分享卡） */
    setupPassiveShare(get: () => { title: string; imageUrl?: string }): void {
        if (!isWx()) return;
        wx.showShareMenu?.({ menus: ['shareAppMessage', 'shareTimeline'] });
        wx.onShareAppMessage(() => get());
        wx.onShareTimeline?.(() => get());
    },

    toast(title: string): void {
        if (isWx()) wx.showToast({ title, icon: 'none' });
        else console.log(`[toast] ${title}`);
    },

    vibrate(): void {
        if (isWx()) wx.vibrateShort?.({ type: 'light' });
    },

    /** 埋点：wx.reportEvent（需先在 We分析 注册事件，见 minigame-event-report skill） */
    report(event: string, data: Record<string, string | number> = {}): void {
        if (isWx() && wx.reportEvent) {
            try { wx.reportEvent(event, data); } catch { /* 未注册的事件静默失败 */ }
        }
    },
};

let rewardedAd: any;
function getRewardedAd(): any {
    if (!rewardedAd) {
        rewardedAd = wx.createRewardedVideoAd({ adUnitId: CONFIG.rewardedAdUnitId });
        rewardedAd.onError((err: unknown) => console.warn('[platform] 激励视频错误', err));
    }
    return rewardedAd;
}
