/**
 * 测试用的假 'cc' 运行时：足够让 assets/scripts/game 在 Node 里跑起来（节点树、组件、触摸事件、资源加载）。
 * 通过 vitest.config.ts 的 alias 把 'cc' 指向这里。
 */
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RES = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'assets', 'resources');

export namespace _decorator {
    export const ccclass = (_name?: string) => <T>(ctor: T) => ctor;
    export const property = () => () => undefined;
}

export class Vec3 { constructor(public x = 0, public y = 0, public z = 0) {} }
export class Color {
    constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
    fromHEX(hex: string): Color {
        const h = hex.replace('#', '');
        this.r = parseInt(h.slice(0, 2), 16); this.g = parseInt(h.slice(2, 4), 16); this.b = parseInt(h.slice(4, 6), 16);
        this.a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
        if ([this.r, this.g, this.b, this.a].some(Number.isNaN)) throw new Error(`非法颜色 ${hex}`);
        return this;
    }
}
export class Layers { static Enum = { UI_2D: 1 << 25, DEFAULT: 1 << 30 }; }

export class Component {
    node!: Node;
    get isValid() { return this.node?.isValid ?? false; }
}

type Handler = (e: unknown) => void;
export class Node {
    static EventType = { TOUCH_START: 'touch-start', TOUCH_MOVE: 'touch-move', TOUCH_END: 'touch-end', TOUCH_CANCEL: 'touch-cancel' };
    layer = 0;
    active = true;
    isValid = true;
    children: Node[] = [];
    parent: Node | null = null;
    position = new Vec3();
    scale = new Vec3(1, 1, 1);
    components: Component[] = [];
    listeners = new Map<string, Handler[]>();
    constructor(public name = 'node') {}
    addChild(c: Node) { c.parent = this; this.children.push(c); }
    setPosition(x: number, y: number, z = 0) { this.position = new Vec3(x, y, z); }
    setScale(x: number, y: number, z = 1) { this.scale = new Vec3(x, y, z); }
    setSiblingIndex(i: number) {
        if (!this.parent) return;
        const list = this.parent.children;
        list.splice(list.indexOf(this), 1);
        list.splice(Math.max(0, Math.min(i, list.length)), 0, this);
    }
    addComponent<T extends Component>(T: new () => T): T { const c = new T(); c.node = this; this.components.push(c); return c; }
    getComponent<T extends Component>(T: new () => T): T | null { return (this.components.find(c => c instanceof T) as T) ?? null; }
    on(t: string, cb: Handler) { this.listeners.set(t, [...(this.listeners.get(t) ?? []), cb]); }
    off(t: string) { this.listeners.delete(t); }
    emit(t: string) { for (const cb of this.listeners.get(t) ?? []) cb({}); }
    destroy() {
        if (!this.isValid) return false;
        this.isValid = false;
        for (const c of [...this.children]) c.destroy();
        if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this);
        return true;
    }
    destroyAllChildren() { for (const c of [...this.children]) c.destroy(); }
    removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
}

export class UITransform extends Component {
    width = 0; height = 0; anchorX = 0.5; anchorY = 0.5;
    setContentSize(w: number, h: number) {
        if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error(`非法尺寸 ${w}x${h} @${this.node?.name}`);
        this.width = w; this.height = h;
    }
    setAnchorPoint(x: number, y: number) { this.anchorX = x; this.anchorY = y; }
}
export class UIOpacity extends Component { opacity = 255; }
export class Canvas extends Component {}
export class Director {
    static EVENT_AFTER_SCENE_LAUNCH = 'director_after_scene_launch';
    getScene() { return null; }
    once() {}
    on() {}
}
export const director = new Director();
export class BlockInputEvents extends Component {}
export class Label extends Component {
    static Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };
    static HorizontalAlign = { LEFT: 0, CENTER: 1, RIGHT: 2 };
    static VerticalAlign = { TOP: 0, CENTER: 1, BOTTOM: 2 };
    string = ''; fontSize = 20; lineHeight = 30; color = new Color(); isBold = false; enableWrapText = false;
    overflow = 0; horizontalAlign = 0; verticalAlign = 0;
}
export class Asset { constructor(public name = '') {} }
export class AudioClip extends Asset {}
/** 所有 AudioSource 的播放记录（测试断言用） */
export const audioLog: string[] = [];
export class AudioSource extends Component {
    clip: AudioClip | null = null; loop = false; volume = 1; playing = false;
    play() { this.playing = true; audioLog.push(`bgm:${this.clip?.name}`); }
    stop() { this.playing = false; }
    pause() { this.playing = false; }
    playOneShot(clip: AudioClip) { audioLog.push(`sfx:${clip.name}`); }
}
export class JsonAsset extends Asset { json: unknown; }
export class ImageAsset extends Asset { width = 0; height = 0; }
export class SpriteFrame extends Asset {
    insetTop = 0; insetBottom = 0; insetLeft = 0; insetRight = 0;
    originalSize = { width: 0, height: 0 };
    static createWithImage(img: ImageAsset): SpriteFrame {
        const sf = new SpriteFrame(img.name);
        sf.originalSize = { width: img.width, height: img.height };
        return sf;
    }
}

/** 读取 PNG / JPEG 头部得到真实尺寸 */
function imageSize(file: string): { width: number; height: number } {
    const b = readFileSync(file);
    if (b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    let i = 2;
    while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
        i += 2 + len;
    }
    return { width: 0, height: 0 };
}
export class Sprite extends Component {
    static SizeMode = { CUSTOM: 0, TRIMMED: 1, RAW: 2 };
    static Type = { SIMPLE: 0, SLICED: 1, TILED: 2, FILLED: 3 };
    spriteFrame: SpriteFrame | null = null; sizeMode = 0; type = 0; color = new Color();
}
export class Graphics extends Component {
    fillColor = new Color(); strokeColor = new Color(); lineWidth = 1;
    rect() {} roundRect() {} circle() {} moveTo() {} lineTo() {} fill() {} stroke() {} clear() {}
}

/** 贴图：存在对应图片文件则返回 SpriteFrame（带真实尺寸），否则报错（模拟缺图） */
function findImage(path: string): string | undefined {
    return ['.png', '.jpg', '.jpeg'].map(ext => join(RES, path + ext)).find(f => existsSync(f));
}

export const resources = {
    /** 测试开关：模拟图片导入类型不是 sprite-frame */
    spriteFrameDisabled: false,
    load(path: string, type: unknown, cb: (err: Error | null, asset: unknown) => void) {
        setTimeout(() => {
            if (type === AudioClip) {
                const file = join(RES, `${path}.mp3`);
                return existsSync(file) ? cb(null, new AudioClip(path.split('/').pop())) : cb(new Error(`缺音频 ${path}`), null);
            }
            if (type === ImageAsset) {
                const file = findImage(path);
                if (!file) return cb(new Error(`缺图 ${path}`), null);
                const img = new ImageAsset(path);
                Object.assign(img, imageSize(file));
                return cb(null, img);
            }
            if (type === SpriteFrame) {
                if (resources.spriteFrameDisabled) return cb(new Error('模拟：图片未导入为 sprite-frame'), null);
                const p = path.replace(/\/spriteFrame$/, '');
                const file = findImage(p);
                if (!file) return cb(new Error(`缺图 ${p}`), null);
                const sf = new SpriteFrame(p);
                sf.originalSize = imageSize(file);
                return cb(null, sf);
            }
            const file = join(RES, `${path}.json`);
            if (!existsSync(file)) return cb(new Error(`not found ${path}`), null);
            const a = new JsonAsset(path.split('/').pop());
            a.json = JSON.parse(readFileSync(file, 'utf8'));
            cb(null, a);
        }, 0);
    },
    loadDir(path: string, _type: unknown, cb: (err: Error | null, assets: unknown[]) => void) {
        setTimeout(() => {
            const dir = join(RES, path);
            const out = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
                const a = new JsonAsset(f.replace(/\.json$/, ''));
                a.json = JSON.parse(readFileSync(join(dir, f), 'utf8'));
                return a;
            });
            cb(null, out);
        }, 0);
    },
};

export const view = { getVisibleSize: () => ({ width: 750, height: 1334 }) };

const store = new Map<string, string>();
export const sys = {
    localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
    },
};

export function tween<T>(_target: T) {
    const t = { to: () => t, delay: () => t, call: (cb: () => void) => { cb(); return t; }, start: () => t };
    return t;
}
