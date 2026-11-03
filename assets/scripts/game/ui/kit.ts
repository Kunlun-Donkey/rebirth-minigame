/**
 * 纯代码 UI 工具包。坐标约定：所有节点锚点为左上角 (0,1)，
 * box(parent, x, y, w, h) 中 x/y 是相对父节点左上角、向右/向下为正的设计像素。
 * 风格取自 docs/filing/mock/style.css（沙色纸张 + 墨色文字 + 叶绿/金色按钮）。
 */
import {
    BlockInputEvents, Color, Graphics, Label, Layers, Node, Sprite, SpriteFrame, tween, UIOpacity, UITransform, Vec3,
} from 'cc';
import { BTN_SLICE, POPUP_SLICE, TEX } from '../config';
import { loadSpriteFrame } from '../loader';

// ───────────── 主题 ─────────────

export const COLOR = {
    bg: '#efdcb6',
    bgTop: '#f6ead2',
    sand1: '#f3e6cc',
    sand3: '#d9b97f',
    paper: '#fbf3e1',
    paperEdge: '#c9a874',
    ochre: '#b5793a',
    ochreD: '#7a4a1f',
    ink: '#3b2a1a',
    ink2: '#6b5136',
    leaf: '#5c9a3a',
    leafD: '#3c6b24',
    leafL: '#9bd36a',
    btn: '#fffaf0',
    btnEdge: '#b0906a',
    btnShadow: '#c8ad86',
    ad: '#f3c962',
    adD: '#b58a2b',
    water: '#3d8fc0',
    waterBg: '#e2cfae',
    memory: '#a0522d',
    legacy: '#d99a2b',
    skill: '#8e5bc9',
    good: '#3c8a2a',
    bad: '#c0392b',
    rare: '#4a90c8',
    epic: '#8e5bc9',
    legend: '#e2b04a',
    common: '#b8a888',
    night: '#1b2238',
    cream: '#f6ecd2',
    mask: '#000000',
    white: '#ffffff',
};
export const RARITY_COLOR: Record<string, string> = { common: COLOR.common, rare: COLOR.rare, epic: COLOR.epic, legend: COLOR.legend };
export const RARITY_TEXT: Record<string, string> = { common: '普通', rare: '稀有', epic: '史诗', legend: '传说' };

/** '#rrggbb' 或 '#rrggbbaa'；传入 alpha 时覆盖透明度 */
export function hex(h: string, alpha?: number): Color {
    const c = new Color().fromHEX(h);
    if (alpha !== undefined) c.a = alpha;
    else if (h.replace('#', '').length < 8) c.a = 255;
    return c;
}

// ───────────── 节点 ─────────────

export function box(parent: Node | null, x: number, y: number, w: number, h: number, name = 'box'): Node {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    const t = n.addComponent(UITransform);
    t.setAnchorPoint(0, 1);
    t.setContentSize(w, h);
    n.setPosition(x, -y, 0);
    if (parent) parent.addChild(n);
    return n;
}

export function sizeOf(n: Node): { w: number; h: number } {
    const t = n.getComponent(UITransform)!;
    return { w: t.width, h: t.height };
}

export function setHeight(n: Node, h: number): void {
    const t = n.getComponent(UITransform)!;
    t.setContentSize(t.width, h);
}

// ───────────── 绘制 ─────────────

export interface RectStyle {
    fill?: string;
    fillAlpha?: number;
    stroke?: string;
    strokeAlpha?: number;
    lineWidth?: number;
    radius?: number;
    /** 底部投影（按钮厚度） */
    shadow?: string;
    shadowOffset?: number;
}

/** 在节点上画圆角矩形（会追加一个 Graphics 子节点，作为最底层背景） */
export function rect(n: Node, s: RectStyle): Node {
    const { w, h } = sizeOf(n);
    const g = box(n, 0, 0, w, h, 'bg');
    g.setSiblingIndex(0);
    const gfx = g.addComponent(Graphics);
    const r = s.radius ?? 0;
    if (s.shadow) {
        const off = s.shadowOffset ?? 6;
        gfx.fillColor = hex(s.shadow);
        gfx.roundRect(0, -h - off + 2, w, h, r);
        gfx.fill();
    }
    if (s.fill) {
        gfx.fillColor = hex(s.fill, s.fillAlpha);
        gfx.roundRect(0, -h, w, h, r);
        gfx.fill();
    }
    if (s.stroke) {
        gfx.lineWidth = s.lineWidth ?? 2;
        gfx.strokeColor = hex(s.stroke, s.strokeAlpha);
        gfx.roundRect(0, -h, w, h, r);
        gfx.stroke();
    }
    return g;
}

/** 纸张卡：可选贴图，缺图用画的纸张兜底 */
export function paper(parent: Node, x: number, y: number, w: number, h: number, texture?: string): Node {
    const n = box(parent, x, y, w, h, 'paper');
    rect(n, { fill: COLOR.paper, stroke: COLOR.paperEdge, strokeAlpha: 160, lineWidth: 2, radius: 20, shadow: COLOR.btnShadow, shadowOffset: 8 });
    if (texture) image(n, texture, 0, 0, w, h);
    return n;
}

export interface ImageOpts {
    /** 九宫格 [上, 右, 下, 左]（贴图像素） */
    slice?: [number, number, number, number];
    /** 九宫格边框的显示缩放（贴图角花很大时用，如 0.36 表示边框按 36% 显示） */
    sliceScale?: number;
    /** 比例保护：贴图宽高比与显示区域相差超过该比例则跳过（默认 0.35；九宫格 / cover 不检查） */
    maxAspectDiff?: number;
    /** 等比放大铺满区域并居中（超出部分溢出，适合全屏背景） */
    cover?: boolean;
    /** 贴图成功显示后回调（如隐藏文字兜底） */
    onLoaded?: () => void;
}

/**
 * 异步加载贴图铺满指定区域。paths 为候选列表，取第一张存在且比例合适的；
 * 全部不可用时不报错（保留下面已画好的兜底底色）。
 */
export function image(parent: Node, paths: string | string[], x: number, y: number, w: number, h: number, o: ImageOpts = {}): Node {
    const sc = o.sliceScale ?? 1;
    const n = box(parent, x, y, w / sc, h / sc, 'img');
    if (sc !== 1) n.setScale(sc, sc, 1);
    // 铺满父节点的贴图是「皮肤」：插到画出来的底色之上、其余内容之下；
    // 局部贴图（图标、logo、境界形象等）是前景：保持追加顺序，避免被皮肤 / 背景盖住
    const pt = parent.getComponent(UITransform);
    const isSkin = !pt || (x <= 0 && y <= 0 && x + w >= pt.width * 0.95 && y + h >= pt.height * 0.95);
    if (isSkin) n.setSiblingIndex(Math.min(1, parent.children.length - 1));
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    const list = typeof paths === 'string' ? [paths] : paths;
    const maxDiff = o.slice || o.cover ? Infinity : (o.maxAspectDiff ?? 0.35);
    (async () => {
        for (const p of list) {
            const sf = await loadSpriteFrame(p);
            if (!sf || !n.isValid) continue;
            const size = sf.originalSize;
            if (size && size.width > 0 && size.height > 0) {
                const diff = Math.abs((size.width / size.height) / (w / h) - 1);
                if (diff > maxDiff) continue;
            }
            if (o.slice) applySlice(sf, o.slice);
            sp.type = o.slice ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
            sp.spriteFrame = sf;
            if (o.cover && size && size.width > 0 && size.height > 0) {
                const k = Math.max(w / size.width, h / size.height);
                const cw = size.width * k, ch = size.height * k;
                n.getComponent(UITransform)!.setContentSize(cw, ch);
                n.setPosition(x - (cw - w) / 2, -(y - (ch - h) / 2), 0);
            } else {
                n.getComponent(UITransform)!.setContentSize(w / sc, h / sc);
            }
            o.onLoaded?.();
            return;
        }
    })();
    return n;
}

function applySlice(sf: SpriteFrame, [t, r, b, l]: [number, number, number, number]): void {
    sf.insetTop = t;
    sf.insetRight = r;
    sf.insetBottom = b;
    sf.insetLeft = l;
}

// ───────────── 文字 ─────────────

export interface TextStyle {
    size?: number;
    color?: string;
    alpha?: number;
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
    valign?: 'top' | 'center' | 'bottom';
    lineHeight?: number;
    /** 自动换行（固定宽度，高度按估算行数撑开） */
    wrap?: boolean;
}

export function text(parent: Node, str: string, x: number, y: number, w: number, s: TextStyle = {}, h?: number): Node {
    const size = s.size ?? 28;
    const lh = s.lineHeight ?? Math.round(size * 1.5);
    const height = h ?? (s.wrap ? estimateLines(str, w, size) * lh : lh);
    const n = box(parent, x, y, w, height, 'text');
    const l = n.addComponent(Label);
    l.string = str;
    l.fontSize = size;
    l.lineHeight = lh;
    l.color = hex(s.color ?? COLOR.ink, s.alpha);
    l.isBold = !!s.bold;
    l.enableWrapText = !!s.wrap;
    // 换行文字：固定宽度、高度随内容撑开；单行文字：固定区域，超长自动缩小字号（保证对齐稳定）
    l.overflow = s.wrap ? Label.Overflow.RESIZE_HEIGHT : Label.Overflow.SHRINK;
    l.horizontalAlign = s.align === 'center' ? Label.HorizontalAlign.CENTER : s.align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.LEFT;
    l.verticalAlign = s.valign === 'center' ? Label.VerticalAlign.CENTER : s.valign === 'bottom' ? Label.VerticalAlign.BOTTOM : Label.VerticalAlign.TOP;
    n.getComponent(UITransform)!.setContentSize(w, height);
    return n;
}

const NO_LINE_START = '，。、！？；：）》」』”’…—,.!?;:)';

/** 估算换行后的行数（中文按 1 个字号宽，ASCII 按半个字号宽；按字逐个排，放不下整字才换行） */
export function estimateLines(str: string, width: number, size: number): number {
    let lines = 0;
    for (const para of str.split('\n')) {
        let n = 1, w = 0, prev = 0;
        for (const ch of para) {
            const cw = ch.charCodeAt(0) < 0x2e80 ? size * 0.55 : size;
            if (w + cw > width && w > 0) {
                n++;
                // 避头标点（，。等不能出现在行首）：上一个字会被一起挤到下一行
                w = NO_LINE_START.includes(ch) ? prev : 0;
            }
            w += cw;
            prev = cw;
        }
        lines += n;
    }
    return lines;
}

export function textHeight(str: string, w: number, size: number, lineHeight?: number): number {
    return estimateLines(str, w, size) * (lineHeight ?? Math.round(size * 1.5));
}

/** 小标签（如「前世：……」「传承·耐火根」） */
export function chip(parent: Node, str: string, x: number, y: number, color: string, filled = false, size = 20): Node {
    const w = Math.ceil(estimateWidth(str, size)) + 20;
    const h = size + 14;
    const n = box(parent, x, y, w, h, 'chip');
    rect(n, filled ? { fill: color, radius: 8 } : { fill: color, fillAlpha: 30, radius: 8 });
    text(n, str, 0, 0, w, { size, color: filled ? COLOR.white : color, align: 'center', valign: 'center' }, h);
    return n;
}

export function estimateWidth(str: string, size: number): number {
    let w = 0;
    for (const ch of str) w += ch.charCodeAt(0) < 0x2e80 ? size * 0.55 : size;
    return w;
}

// ───────────── 交互 ─────────────

/** 点击反馈钩子（由 Game 注入点击音效），kit 不直接依赖音频模块 */
let tapFeedback: (() => void) | null = null;
export function setTapFeedback(fn: (() => void) | null): void {
    tapFeedback = fn;
}

export function onTap(n: Node, fn: () => void, feedback = true): void {
    let pressed = false;
    n.on(Node.EventType.TOUCH_START, () => {
        pressed = true;
        if (feedback) n.setScale(0.97, 0.97, 1);
    });
    n.on(Node.EventType.TOUCH_CANCEL, () => {
        pressed = false;
        n.setScale(1, 1, 1);
    });
    n.on(Node.EventType.TOUCH_END, () => {
        n.setScale(1, 1, 1);
        if (pressed) {
            if (feedback) tapFeedback?.();
            fn();
        }
        pressed = false;
    });
}

export type ButtonStyle = 'normal' | 'primary' | 'ad' | 'locked' | 'ghost';

export interface ButtonOpts {
    label: string;
    style?: ButtonStyle;
    /** 右侧小标签 */
    tags?: { text: string; color: string; filled?: boolean }[];
    /** 第二行小字（如锁定条件） */
    sub?: string;
    subColor?: string;
    size?: number;
    align?: 'left' | 'center';
    /** 文字左侧的小图标（贴图候选列表）；ad 按钮默认带视频图标 */
    icon?: string[];
    onClick?: () => void;
}

const BTN_ICON = 40;

/** 按钮：高度自适应（有 sub 或 tags 换行时更高），返回节点；用 sizeOf 取实际高度 */
export function button(parent: Node, x: number, y: number, w: number, o: ButtonOpts): Node {
    const style = o.style ?? 'normal';
    const size = o.size ?? 30;
    const pad = 26;
    const align = o.align ?? (style === 'primary' || style === 'ad' ? 'center' : 'left');
    const tagsW = (o.tags ?? []).reduce((n, t) => n + estimateWidth(t.text, 20) + 30, 0);
    const labelW = estimateWidth(o.label, size);
    const tagsOnNewLine = tagsW > 0 && labelW + tagsW > w - pad * 2;
    // 第二行小字可换行（含 \n），高度按行数撑开
    const subLH = 30;
    const subH = o.sub ? textHeight(o.sub, w - pad * 2, 22, subLH) : 0;
    let h = 92;
    if (o.sub) h += subH;
    if (tagsOnNewLine) h += 40;

    const n = box(parent, x, y, w, h, 'button');
    const theme = {
        normal: { fill: COLOR.btn, stroke: COLOR.btnEdge, shadow: COLOR.btnShadow, ink: COLOR.ink },
        primary: { fill: COLOR.leaf, stroke: COLOR.leafD, shadow: COLOR.leafD, ink: COLOR.white },
        ad: { fill: COLOR.ad, stroke: COLOR.adD, shadow: COLOR.adD, ink: COLOR.ochreD },
        locked: { fill: '#efe6d4', stroke: '#cdbb9c', shadow: '#d9c9a8', ink: '#a8987c' },
        ghost: { fill: COLOR.paper, stroke: COLOR.btnEdge, shadow: '', ink: COLOR.ink2 },
    }[style];
    rect(n, { fill: theme.fill, stroke: theme.stroke, lineWidth: 2, radius: 18, shadow: theme.shadow || undefined, shadowOffset: 6 });
    // 贴图皮肤：自带底部厚度，高度含画出来的 6px 投影
    if (style !== 'ghost') image(n, TEX.btn(style), 0, 0, w, h + 6, { slice: BTN_SLICE, sliceScale: 0.6 });

    const top = o.sub || tagsOnNewLine ? 18 : (h - Math.round(size * 1.4)) / 2;
    const icon = o.icon ?? (style === 'ad' ? TEX.adIcon : undefined);
    let lx = pad;
    if (icon) {
        const iy = top + (Math.round(size * 1.4) - BTN_ICON) / 2;
        const ix = align === 'center' ? Math.max(pad, (w - labelW) / 2 - BTN_ICON - 10) : pad;
        image(n, icon, ix, iy, BTN_ICON, BTN_ICON);
        if (align === 'left') lx = pad + BTN_ICON + 12;
    }
    text(n, o.label, lx, top, w - lx - pad, { size, color: theme.ink, align: align === 'center' ? 'center' : 'left', lineHeight: Math.round(size * 1.4) });

    let ty = top + Math.round(size * 1.4) + 6;
    if (o.tags?.length) {
        let tx = tagsOnNewLine ? pad : w - pad - tagsW + 10;
        // 有第二行小字时标签与标题同行（垂直居中会压到小字）
        const tagY = tagsOnNewLine ? ty : o.sub ? top + (Math.round(size * 1.4) - 34) / 2 : (h - 34) / 2;
        for (const t of o.tags) {
            const c = chip(n, t.text, tx, tagY, t.color, t.filled);
            tx += sizeOf(c).w + 10;
        }
        if (tagsOnNewLine) ty += 40;
    }
    if (o.sub) text(n, o.sub, pad, ty, w - pad * 2, { size: 22, color: o.subColor ?? COLOR.ink2, wrap: true, lineHeight: subLH });

    if (o.onClick && style !== 'locked') onTap(n, o.onClick);
    else if (o.onClick) onTap(n, o.onClick, false);
    return n;
}

// ───────────── 弹窗 ─────────────

/** 全屏遮罩 + 居中纸张面板。返回 { root, panel, close } */
export function modal(host: Node, screenW: number, screenH: number, panelH: number, opts: { dark?: boolean; tapToClose?: boolean; onClose?: () => void } = {}) {
    const root = box(host, 0, 0, screenW, screenH, 'modal');
    root.addComponent(BlockInputEvents);
    rect(root, { fill: COLOR.mask, fillAlpha: opts.dark ? 200 : 140 });
    const pw = screenW - 60;
    const py = Math.max(80, (screenH - panelH) / 2);
    const panel = paper(root, 30, py, pw, panelH);
    image(panel, TEX.panel, -10, -10, pw + 20, panelH + 22, { slice: POPUP_SLICE, sliceScale: 0.8 });
    const close = () => {
        if (!root.isValid) return;
        root.destroy();
        opts.onClose?.();
    };
    if (opts.tapToClose) onTap(root, close, false);
    fadeIn(root);
    return { root, panel, close, panelW: pw };
}

export function fadeIn(n: Node, duration = 0.18): void {
    const op = n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
    op.opacity = 0;
    tween(op).to(duration, { opacity: 255 }).start();
}

export function pop(n: Node): void {
    n.setScale(0.9, 0.9, 1);
    tween(n).to(0.15, { scale: new Vec3(1, 1, 1) }).start();
}

export function clear(n: Node): void {
    n.destroyAllChildren();
}
