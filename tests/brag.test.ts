import { describe, expect, it } from 'vitest';
import { brandTitle, decodeShare, encodeShare, hero, rarityOf } from '../assets/scripts/game/brag';

describe('传播：分享参数 / 称号 / 稀有度', () => {
    it('分享参数编码后能原样解析；非法参数返回 null', () => {
        const s = { d: 'crocodile', l: 8, k: 'ending' as const, id: 'mars_ancestor', t: true };
        expect(decodeShare(encodeShare(s))).toEqual(s);
        expect(decodeShare({ d: 'local_dog', l: '3', k: 'death', id: 'starve' })).toEqual({ d: 'local_dog', l: 3, k: 'death', id: 'starve', t: false });
        expect(decodeShare(null)).toBeNull();
        expect(decodeShare({ d: 'x', l: '0', k: 'death', id: 'a' })).toBeNull();
        expect(decodeShare({ d: 'x', l: '2', k: 'boom', id: 'a' })).toBeNull();
        expect(decodeShare({ d: '../x', l: '2', k: 'death', id: 'a' })).toBeNull();
    });

    it('称号', () => {
        expect(hero('荒漠一株草')).toBe('草');
        expect(hero('一个打工人')).toBe('打工人');
        expect(brandTitle('荒漠一株草', 8, 'death', '被骆驼吃掉')).toBe('第 8 世被骆驼吃掉的草');
        expect(brandTitle('一条鳄鱼', 3, 'ending', '火星鳄祖')).toBe('第 3 世成了「火星鳄祖」的鳄鱼');
    });

    it('稀有度分档；表里没有的按极稀有', () => {
        const t = { g: { 'death:a': 300, 'ending:b': 12, 'ending:c': 2 } };
        expect(rarityOf(t, 'g', 'death', 'a')!.tier).toBe('常见');
        expect(rarityOf(t, 'g', 'ending', 'b')!.tier).toBe('史诗');
        expect(rarityOf(t, 'g', 'ending', 'c')!.text).toContain('2‰');
        expect(rarityOf(t, 'g', 'ending', 'zzz')!.tier).toBe('传说');
        expect(rarityOf(null, 'g', 'ending', 'b')).toBeNull();
    });
});
