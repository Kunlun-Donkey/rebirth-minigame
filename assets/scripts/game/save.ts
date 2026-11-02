/** 存档：局外 profile + 局内中途存档（run），保存在一个 key 下 */
import { createProfile, loadProfile, Profile, RunState } from '../core';
import { CONFIG } from './config';
import { Platform } from './platform';

export interface SaveData {
    profile: Profile;
    /** 进行中的一局；没有则为 null */
    run: RunState | null;
    /** 本局已用的「窥探天命」次数 */
    peekUsed: number;
    /** 本次开局是否已用过「天机重演」 */
    rerollUsed: boolean;
    /** 静音（背景音乐 + 音效） */
    muted: boolean;
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
                muted: d.muted ?? false,
            };
        } catch (e) {
            console.warn('[save] 存档损坏，已重置', e);
        }
    }
    return { profile: createProfile(), run: null, peekUsed: 0, rerollUsed: false, muted: false };
}

export function writeSave(d: SaveData): void {
    Platform.setItem(CONFIG.saveKey, JSON.stringify(d));
}
