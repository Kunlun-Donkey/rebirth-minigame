/**
 * 条件 DSL
 *
 *   根系>=5 & !flag:met_camel | (talent:bitter & stage>=2)
 *
 * 数值项：<属性id或中文名> | stage | season | life | legacy:<id> | pos:<up|down|side>
 *   died:<死法id>（本命格累计死于该死法的次数，宿敌记仇）
 *   xstage:<命格id>（另一命格的最高境界）| xlives:<命格id>（另一命格已轮回世数）
 *   比较符：>= <= > < == !=
 * 布尔项：flag:x talent:x item:x companion:x skill:x（本局拥有该技能） seen:<事件id> dead:<死法id> ending:<结局id>
 *   xend:<命格id>（另一命格达成过任意结局）| xend:<命格id>/<结局id>（达成过指定结局）——跨命格彩蛋
 *   line:<线路>（这一世开始了）| line:<线路>.<状态> | ever:<线路>.<状态>（任何一世到达过）| system:any | system:<系统id>
 * 组合：! 非，& 与，| 或（& 优先于 |），括号
 */

export type HasKind = 'flag' | 'talent' | 'item' | 'companion' | 'skill' | 'seen' | 'dead' | 'ending' | 'xend' | 'line' | 'ever' | 'system';
export type NumKind = 'attr' | 'stage' | 'season' | 'life' | 'legacy' | 'pos' | 'died' | 'xstage' | 'xlives';
export type Op = '>=' | '<=' | '>' | '<' | '==' | '!=';

export interface NumRef {
    kind: NumKind;
    id?: string;
}

export type CondNode =
    | { t: 'and' | 'or'; a: CondNode; b: CondNode }
    | { t: 'not'; a: CondNode }
    | { t: 'has'; kind: HasKind; id: string }
    | { t: 'cmp'; left: NumRef; op: Op; right: number };

export interface CondCtx {
    num(ref: NumRef): number;
    has(kind: HasKind, id: string): boolean;
}

const HAS_KINDS: HasKind[] = ['flag', 'talent', 'item', 'companion', 'skill', 'seen', 'dead', 'ending', 'xend', 'line', 'ever', 'system'];
/** 带 id 的数值项前缀 */
const NUM_PREFIXES = ['legacy', 'died', 'xstage', 'xlives'] as const;
const OPS: Op[] = ['>=', '<=', '==', '!=', '>', '<'];

type Tok = { k: 'op' | 'sym' | 'num' | 'word'; v: string };

function tokenize(src: string): Tok[] {
    const toks: Tok[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) { i++; continue; }
        const op = OPS.find(o => src.startsWith(o, i));
        if (op) { toks.push({ k: 'op', v: op }); i += op.length; continue; }
        if ('()&|!'.includes(c)) { toks.push({ k: 'sym', v: c }); i++; continue; }
        if (/[-\d.]/.test(c) && (toks.length && toks[toks.length - 1].k === 'op')) {
            const m = /^-?\d+(\.\d+)?/.exec(src.slice(i));
            if (!m) throw new Error(`条件语法错误：非法数字 @${i} 「${src}」`);
            toks.push({ k: 'num', v: m[0] }); i += m[0].length; continue;
        }
        const m = /^[^\s()&|!<>=]+/.exec(src.slice(i));
        if (!m) throw new Error(`条件语法错误：非法字符「${c}」@${i} 「${src}」`);
        toks.push({ k: 'word', v: m[0] }); i += m[0].length;
    }
    return toks;
}

/** resolveAttr：把属性 id 或中文名解析为属性 id，未知返回 undefined */
export function parseCond(src: string, resolveAttr: (name: string) => string | undefined): CondNode {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const fail = (msg: string): never => { throw new Error(`条件语法错误：${msg} 「${src}」`); };

    function parseOr(): CondNode {
        let a = parseAnd();
        while (peek()?.v === '|') { p++; a = { t: 'or', a, b: parseAnd() }; }
        return a;
    }
    function parseAnd(): CondNode {
        let a = parseUnary();
        while (peek()?.v === '&') { p++; a = { t: 'and', a, b: parseUnary() }; }
        return a;
    }
    function parseUnary(): CondNode {
        if (peek()?.v === '!') { p++; return { t: 'not', a: parseUnary() }; }
        if (peek()?.v === '(') {
            p++;
            const e = parseOr();
            if (peek()?.v !== ')') fail('缺少右括号');
            p++;
            return e;
        }
        const w = peek();
        if (!w || w.k !== 'word') fail('缺少条件项');
        p++;
        const word = w!.v;
        const colon = word.indexOf(':');
        const prefix = colon >= 0 ? word.slice(0, colon) : '';
        const id = colon >= 0 ? word.slice(colon + 1) : word;
        if (colon >= 0 && !id) fail(`「${word}」缺少 id`);

        if (HAS_KINDS.includes(prefix as HasKind)) {
            if (peek()?.k === 'op') fail(`「${word}」是布尔项，不能比较`);
            return { t: 'has', kind: prefix as HasKind, id };
        }
        let left: NumRef;
        if ((NUM_PREFIXES as readonly string[]).includes(prefix)) left = { kind: prefix as NumKind, id };
        else if (prefix === 'pos') {
            if (!['up', 'down', 'side'].includes(id)) fail(`pos 只能是 up/down/side`);
            left = { kind: 'pos', id };
        } else if (prefix) fail(`未知前缀「${prefix}」`);
        else if (word === 'stage' || word === 'season' || word === 'life') left = { kind: word };
        else {
            const attr = resolveAttr(word);
            if (!attr) fail(`未知属性「${word}」`);
            left = { kind: 'attr', id: attr };
        }
        const op = peek();
        if (!op || op.k !== 'op') fail(`「${word}」后缺少比较符`);
        p++;
        const num = peek();
        if (!num || num.k !== 'num') fail(`「${word}${op!.v}」后缺少数字`);
        p++;
        return { t: 'cmp', left: left!, op: op!.v as Op, right: Number(num!.v) };
    }

    const node = parseOr();
    if (p < toks.length) fail(`多余的内容「${toks[p].v}」`);
    return node;
}

export function evalCond(n: CondNode, ctx: CondCtx): boolean {
    switch (n.t) {
        case 'and': return evalCond(n.a, ctx) && evalCond(n.b, ctx);
        case 'or': return evalCond(n.a, ctx) || evalCond(n.b, ctx);
        case 'not': return !evalCond(n.a, ctx);
        case 'has': return ctx.has(n.kind, n.id);
        case 'cmp': {
            const v = ctx.num(n.left);
            switch (n.op) {
                case '>=': return v >= n.right;
                case '<=': return v <= n.right;
                case '>': return v > n.right;
                case '<': return v < n.right;
                case '==': return v === n.right;
                case '!=': return v !== n.right;
            }
        }
    }
}

/** 遍历条件中引用到的所有项（用于校验与 UI 标签） */
export function walkCond(n: CondNode, fn: (leaf: Extract<CondNode, { t: 'has' | 'cmp' }>) => void): void {
    switch (n.t) {
        case 'and':
        case 'or': walkCond(n.a, fn); walkCond(n.b, fn); break;
        case 'not': walkCond(n.a, fn); break;
        default: fn(n);
    }
}

export interface DescribeNames {
    attr(id: string): string;
    legacy(id: string): string;
    talent(id: string): string;
    item(id: string): string;
    companion(id: string): string;
    skill(id: string): string;
}

const OP_TEXT: Record<Op, string> = { '>=': '≥', '<=': '≤', '>': '>', '<': '<', '==': '=', '!=': '≠' };
const POS_TEXT: Record<string, string> = { up: '高度', down: '深度', side: '广度' };

/** 把条件渲染为玩家可读的文本，如「根系≥5 且 传承·耐火根≥2」。flag 等隐藏信息显示为「？？？」 */
export function describeCond(n: CondNode, names: DescribeNames): string {
    switch (n.t) {
        case 'and': return `${describeCond(n.a, names)} 且 ${describeCond(n.b, names)}`;
        case 'or': return `${describeCond(n.a, names)} 或 ${describeCond(n.b, names)}`;
        case 'not': return n.a.t === 'has' && ['flag', 'seen', 'dead', 'ending', 'xend', 'line', 'ever', 'system'].includes(n.a.kind) ? '？？？' : `非(${describeCond(n.a, names)})`;
        case 'has':
            switch (n.kind) {
                case 'talent': return `天赋·${names.talent(n.id)}`;
                case 'item': return `道具·${names.item(n.id)}`;
                case 'companion': return `伴生·${names.companion(n.id)}`;
                case 'skill': return `技能·${names.skill(n.id)}`;
                case 'system': return n.id === 'any' ? '绑定了系统' : `系统·${names.companion(n.id)}`;
                default: return '？？？';
            }
        case 'cmp': {
            const r = n.left;
            // 宿敌记仇 / 跨命格条件属于隐藏信息，不剧透
            if (r.kind === 'died' || r.kind === 'xstage' || r.kind === 'xlives') return '？？？';
            const label =
                r.kind === 'attr' ? names.attr(r.id!) :
                r.kind === 'legacy' ? `传承·${names.legacy(r.id!)}` :
                r.kind === 'pos' ? POS_TEXT[r.id!] :
                r.kind === 'stage' ? '境界' : r.kind === 'season' ? '季数' : '轮回次数';
            return `${label}${OP_TEXT[n.op]}${n.right}`;
        }
    }
}
