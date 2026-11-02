/** 可序列化的确定性随机数（mulberry32）。状态存放在外部持有者上，便于存档。 */
export class Rng {
    constructor(private holder: { rng: number }) {}

    next(): number {
        let t = (this.holder.rng = (this.holder.rng + 0x6d2b79f5) | 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    int(n: number): number {
        return Math.floor(this.next() * n);
    }

    chance(p: number): boolean {
        return this.next() < p;
    }

    weighted<T>(list: T[], weight: (x: T) => number): T | undefined {
        let total = 0;
        for (const x of list) total += Math.max(0, weight(x));
        if (total <= 0) return undefined;
        let r = this.next() * total;
        for (const x of list) {
            r -= Math.max(0, weight(x));
            if (r < 0) return x;
        }
        return list[list.length - 1];
    }
}

export function randomSeed(): number {
    return (Math.random() * 0x7fffffff) | 0;
}
