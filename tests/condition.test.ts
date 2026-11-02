import { describe, expect, it } from 'vitest';
import { CondCtx, describeCond, evalCond, parseCond } from '../assets/scripts/core/condition';

const alias: Record<string, string> = { 根系: 'root', root: 'root', 灵性: 'spirit', spirit: 'spirit' };
const parse = (s: string) => parseCond(s, n => alias[n]);

const ctx = (nums: Record<string, number>, has: string[] = []): CondCtx => ({
    num: r => nums[r.id ? `${r.kind}:${r.id}` : r.kind] ?? 0,
    has: (k, id) => has.includes(`${k}:${id}`),
});

describe('条件 DSL', () => {
    it('比较与中文别名', () => {
        expect(evalCond(parse('根系>=5'), ctx({ 'attr:root': 5 }))).toBe(true);
        expect(evalCond(parse('root>5'), ctx({ 'attr:root': 5 }))).toBe(false);
        expect(evalCond(parse('stage==2'), ctx({ stage: 2 }))).toBe(true);
        expect(evalCond(parse('legacy:fire_root>=2'), ctx({ 'legacy:fire_root': 1 }))).toBe(false);
    });

    it('& 优先于 |，支持括号与 !', () => {
        const c = ctx({ 'attr:root': 1 }, ['flag:a']);
        expect(evalCond(parse('flag:a | flag:b & 根系>=5'), c)).toBe(true);
        expect(evalCond(parse('(flag:a | flag:b) & 根系>=5'), c)).toBe(false);
        expect(evalCond(parse('!flag:b & flag:a'), c)).toBe(true);
        expect(evalCond(parse('!(flag:a)'), c)).toBe(false);
    });

    it('语法错误给出可读信息', () => {
        expect(() => parse('未知>=1')).toThrow(/未知属性/);
        expect(() => parse('根系')).toThrow(/缺少比较符/);
        expect(() => parse('flag:a>=1')).toThrow(/布尔项/);
        expect(() => parse('(flag:a')).toThrow(/右括号/);
        expect(() => parse('foo:x')).toThrow(/未知前缀/);
        expect(() => parse('flag:a flag:b')).toThrow(/多余/);
    });

    it('渲染为玩家可读文本，隐藏 flag', () => {
        const names = { attr: (id: string) => ({ root: '根系' } as Record<string, string>)[id] ?? id, legacy: () => '耐火根', talent: () => '苦涩', item: () => 'x', companion: () => 'y', skill: () => '藤缚' };
        expect(describeCond(parse('根系>=5 & legacy:fire_root>=2'), names)).toBe('根系≥5 且 传承·耐火根≥2');
        expect(describeCond(parse('talent:bitter | flag:x'), names)).toBe('天赋·苦涩 或 ？？？');
        expect(describeCond(parse('skill:vine_bind'), names)).toBe('技能·藤缚');
    });
});
