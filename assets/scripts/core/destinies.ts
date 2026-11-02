/** 多命格：解锁判断（基于全局存档，所有命格共用） */
import type { DestinyIndex, DestinyIndexEntry, Profile } from './types';

export interface DestinyState {
    entry: DestinyIndexEntry;
    unlocked: boolean;
    /** 未解锁时的条件说明 */
    lockText?: string;
    /** 该命格已轮回世数 */
    lives: number;
    bestStage: number;
}

export function isUnlocked(entry: DestinyIndexEntry, p: Profile): boolean {
    const u = entry.unlock;
    if (!u) return true;
    if (u.bestStage && (p.destinies[u.bestStage.destiny]?.bestStage ?? 0) < u.bestStage.level) return false;
    if (u.lives !== undefined && p.lives < u.lives) return false;
    if (u.endings !== undefined && totalEndings(p) < u.endings) return false;
    return true;
}

export function totalEndings(p: Profile): number {
    return Object.values(p.destinies).reduce((n, dp) => n + (dp.codex?.endings?.length ?? 0), 0);
}

export function destinyStates(index: DestinyIndex, p: Profile): DestinyState[] {
    return index.destinies.map(entry => {
        const unlocked = isUnlocked(entry, p);
        return {
            entry,
            unlocked,
            lockText: unlocked ? undefined : entry.unlock?.text,
            lives: p.destinies[entry.id]?.lives ?? 0,
            bestStage: p.destinies[entry.id]?.bestStage ?? 0,
        };
    });
}

/** 选一个可玩的命格：优先 preferred（已解锁时），否则第一个已解锁的 */
export function pickDestiny(index: DestinyIndex, p: Profile, preferred?: string): string {
    const states = destinyStates(index, p);
    const pref = states.find(s => s.entry.id === preferred && s.unlocked);
    return (pref ?? states.find(s => s.unlocked) ?? states[0]).entry.id;
}
