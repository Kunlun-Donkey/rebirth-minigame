/** 存档：局外 profile + 局内中途存档（run），保存在一个 key 下 */
import { createProfile, loadProfile, Profile, RunState } from '../core';
import { CONFIG } from './config';
import { Platform } from './platform';
import type { ShareLife } from './brag';

export interface SaveData {
    profile: Profile;
    /** 进行中的一局；没有则为 null */
    run: RunState | null;
    /** 本局已用的「窥探天命」次数 */
    peekUsed: number;
    /** 本次开局是否已用过看视频「天机重演」 */
    rerollUsed: boolean;
    /** 本次开局已用的免费重演次数（命盘·天机） */
    freeRerollUsed: number;
    /** 静音（背景音乐 + 音效） */
    muted: boolean;
    /** 上次免费「随缘投胎」的日期（YYYY-MM-DD，每天一次免费） */
    spinDay: string;
    /** 随缘投胎转出的命格：下一世若是它，结算轮回点加成 */
    spinBonus: string | null;
    /** 好友分享过来的挑战（点「我也投一次胎」后记下，结算时对比） */
    challenge: (ShareLife & { done?: boolean; at?: number }) | null;
    /** 上次领分享奖励的日期（每天首次分享奖励轮回点） */
    shareDay: string;
}

export function loadSave(): SaveData {
    const raw = Platform.getItem(CONFIG.saveKey);
    if (raw) {
        try {
            const d = JSON.parse(raw) as Partial<SaveData>;
            return {
                profile: loadProfile(JSON.stringify(d.profile ?? null)),
                run: d.run ?? null,
                peekUsed: d.peekUsed ?? 0,
                rerollUsed: d.rerollUsed ?? false,
                freeRerollUsed: d.freeRerollUsed ?? 0,
                muted: d.muted ?? false,
                spinDay: d.spinDay ?? '',
                spinBonus: d.spinBonus ?? null,
                challenge: d.challenge ?? null,
                shareDay: d.shareDay ?? '',
            };
        } catch (e) {
            console.warn('[save] 存档损坏，已重置', e);
        }
    }
    return { profile: createProfile(), run: null, peekUsed: 0, rerollUsed: false, freeRerollUsed: 0, muted: false, spinDay: '', spinBonus: null, challenge: null, shareDay: '' };
}

export function writeSave(d: SaveData): void {
    Platform.setItem(CONFIG.saveKey, JSON.stringify(d));
}
