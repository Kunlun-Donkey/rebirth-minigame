/**
 * 传播相关的纯逻辑（不依赖 cc，便于测试）：
 *   - 分享链接参数（谁、哪个命格、第几世、怎么死的 / 成了什么）的编码与解析
 *   - 称号：「第 8 世被骆驼吃掉的草」
 *   - 稀有度：按 tools 模拟生成的 data/destinies/rarity.json 估算「多少轮回会走到这里」
 */

/** 分享出去的这一世（好友点开时还原） */
export interface ShareLife {
    /** 命格 id */
    d: string;
    /** 第几世 */
    l: number;
    /** death / ending */
    k: 'death' | 'ending';
    /** 死法 / 结局 id */
    id: string;
    /** 天胡 */
    t?: boolean;
}

/** rarity.json：{ 命格: { "ending:id" | "death:id": 每千世出现次数 } } */
export type RarityTable = Record<string, Record<string, number>>;

export function encodeShare(s: ShareLife): string {
    const q = [`d=${s.d}`, `l=${s.l}`, `k=${s.k}`, `id=${encodeURIComponent(s.id)}`];
    if (s.t) q.push('t=1');
    return q.join('&');
}

/** 解析启动参数（wx.getLaunchOptionsSync().query 已是对象；字符串也兼容），不合法返回 null */
export function decodeShare(q: Record<string, string> | string | null | undefined): ShareLife | null {
    if (!q) return null;
    const o: Record<string, string> = {};
    if (typeof q === 'string') {
        for (const kv of q.replace(/^\?/, '').split('&')) {
            const i = kv.indexOf('=');
            if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
        }
    } else Object.assign(o, q);
    const l = Number(o.l);
    if (!o.d || !o.id || (o.k !== 'death' && o.k !== 'ending') || !Number.isInteger(l) || l < 1) return null;
    if (!/^[\w-]+$/.test(o.d)) return null;
    return { d: o.d, l, k: o.k, id: decodeURIComponent(o.id), t: o.t === '1' };
}

/** 命格名的主角：「荒漠一株草」→「草」，「一个打工人」→「打工人」 */
export function hero(destinyName: string): string {
    const m = destinyName.match(/一[株只条个头匹](.+)$/);
    return m ? m[1] : destinyName;
}

/** 称号：死亡「第 8 世被骆驼吃掉的草」；结局「第 3 世成了『绿洲之主』的草」 */
export function brandTitle(destinyName: string, life: number, kind: 'death' | 'ending', title: string): string {
    const h = hero(destinyName);
    return kind === 'ending' ? `第 ${life} 世成了「${title}」的${h}` : `第 ${life} 世${title}的${h}`;
}

export interface RarityView {
    /** 每千世约几世 */
    perMille: number;
    /** 传说 / 史诗 / 稀有 / 常见 */
    tier: string;
    color: 'legend' | 'epic' | 'rare' | 'common';
    /** 「千世难遇：约 3‰ 的轮回走到这里」 */
    text: string;
}

export function rarityOf(table: RarityTable | null, destiny: string, kind: 'death' | 'ending', id: string): RarityView | null {
    const row = table?.[destiny];
    if (!row) return null;
    // 模拟里一次都没出现的：按 0.5‰ 算（极稀有）
    const pm = row[`${kind}:${id}`] ?? 0.5;
    const tier = pm < 5 ? '传说' : pm < 20 ? '史诗' : pm < 80 ? '稀有' : '常见';
    const color = pm < 5 ? 'legend' : pm < 20 ? 'epic' : pm < 80 ? 'rare' : 'common';
    const n = pm >= 10 ? `${Math.round(pm / 10)}%` : `${Math.max(1, Math.round(pm))}‰`;
    const lead = pm < 5 ? '千世难遇' : pm < 20 ? '百里挑一' : pm < 80 ? '少见' : '常有的事';
    return { perMille: pm, tier, color, text: `${lead}：约 ${n} 的轮回会走到这里` };
}
