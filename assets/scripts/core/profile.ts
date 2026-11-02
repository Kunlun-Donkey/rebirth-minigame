import type { DestinyProfile, Profile } from './types';

export function createProfile(): Profile {
    return { version: 1, points: 0, lives: 0, destinies: {} };
}

export function destinyProfile(p: Profile, destinyId: string): DestinyProfile {
    let dp = p.destinies[destinyId];
    if (!dp) {
        dp = {
            lives: 0,
            legacy: {},
            sealed: [],
            memory: {},
            codex: { deaths: [], endings: [], items: [], events: [] },
            bestStage: 0,
            skills: [],
            upgrades: {},
        };
        p.destinies[destinyId] = dp;
    }
    // 兼容旧存档
    if (!dp.skills) dp.skills = [];
    if (!dp.upgrades) dp.upgrades = {};
    return dp;
}

/** 存档反序列化时做最小校验，不合法则返回新存档 */
export function loadProfile(json: string | null | undefined): Profile {
    if (!json) return createProfile();
    try {
        const p = JSON.parse(json) as Profile;
        if (p && p.version === 1 && typeof p.points === 'number' && p.destinies) return p;
    } catch {
        // 存档损坏，重新开始
    }
    return createProfile();
}

export function addUnique(list: string[], v: string): boolean {
    if (list.includes(v)) return false;
    list.push(v);
    return true;
}
