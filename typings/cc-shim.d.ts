/**
 * Linux 端类型检查用的 'cc' 最小声明（只覆盖 assets/scripts/game 用到的 API，签名对照 Cocos Creator 3.8）。
 * 不会进入游戏包：Cocos 编辑器使用自己的 cc 声明（temp/declarations）。
 * 新用到 cc 的 API 时在这里补上对应签名。
 */
declare module 'cc' {
    export namespace _decorator {
        function ccclass(name?: string): <T>(ctor: T) => T;
        function property(...args: unknown[]): (target: unknown, key: string) => void;
    }

    export class Vec3 {
        constructor(x?: number, y?: number, z?: number);
        x: number; y: number; z: number;
    }

    export class Color {
        constructor(r?: number, g?: number, b?: number, a?: number);
        r: number; g: number; b: number; a: number;
        fromHEX(hex: string): Color;
    }

    export class Size { width: number; height: number; }

    export class Layers {
        static Enum: { UI_2D: number; DEFAULT: number };
    }

    export class EventTouch { propagationStopped: boolean; }

    export class Node {
        constructor(name?: string);
        static EventType: { TOUCH_START: string; TOUCH_MOVE: string; TOUCH_END: string; TOUCH_CANCEL: string };
        name: string;
        layer: number;
        active: boolean;
        readonly isValid: boolean;
        readonly children: Node[];
        parent: Node | null;
        addChild(child: Node): void;
        setPosition(x: number, y: number, z?: number): void;
        setScale(x: number, y: number, z?: number): void;
        setSiblingIndex(index: number): void;
        addComponent<T extends Component>(type: new () => T): T;
        getComponent<T extends Component>(type: new () => T): T | null;
        on(type: string, cb: (e: EventTouch) => void, target?: unknown): void;
        off(type: string, cb?: (e: EventTouch) => void, target?: unknown): void;
        destroy(): boolean;
        destroyAllChildren(): void;
        removeFromParent(): void;
    }

    export class Component {
        node: Node;
        readonly isValid: boolean;
    }

    export class UITransform extends Component {
        width: number;
        height: number;
        setContentSize(w: number, h: number): void;
        setAnchorPoint(x: number, y: number): void;
    }

    export class UIOpacity extends Component { opacity: number; }
    export class Canvas extends Component {}

    export class Scene extends Node {
        getComponentInChildren<T extends Component>(type: new () => T): T | null;
    }
    export class Director {
        static EVENT_AFTER_SCENE_LAUNCH: string;
        getScene(): Scene | null;
        once(type: string, cb: (...args: unknown[]) => void, target?: unknown): void;
        on(type: string, cb: (...args: unknown[]) => void, target?: unknown): void;
    }
    export const director: Director;
    export class BlockInputEvents extends Component {}

    export class Label extends Component {
        static Overflow: { NONE: number; CLAMP: number; SHRINK: number; RESIZE_HEIGHT: number };
        static HorizontalAlign: { LEFT: number; CENTER: number; RIGHT: number };
        static VerticalAlign: { TOP: number; CENTER: number; BOTTOM: number };
        string: string;
        fontSize: number;
        lineHeight: number;
        color: Color;
        isBold: boolean;
        enableWrapText: boolean;
        overflow: number;
        horizontalAlign: number;
        verticalAlign: number;
    }

    export class Asset { readonly name: string; }
    export class AudioClip extends Asset {}
    export class AudioSource extends Component {
        clip: AudioClip | null;
        loop: boolean;
        volume: number;
        readonly playing: boolean;
        play(): void;
        stop(): void;
        pause(): void;
        playOneShot(clip: AudioClip, volumeScale?: number): void;
    }
    export class JsonAsset extends Asset { json: unknown; }
    export class ImageAsset extends Asset { readonly width: number; readonly height: number; }
    export class SpriteFrame extends Asset {
        static createWithImage(image: ImageAsset): SpriteFrame;
        insetTop: number; insetBottom: number; insetLeft: number; insetRight: number;
        readonly originalSize: Size;
    }

    export class Sprite extends Component {
        static SizeMode: { CUSTOM: number; TRIMMED: number; RAW: number };
        static Type: { SIMPLE: number; SLICED: number; TILED: number; FILLED: number };
        spriteFrame: SpriteFrame | null;
        sizeMode: number;
        type: number;
        color: Color;
    }

    export class Graphics extends Component {
        fillColor: Color;
        strokeColor: Color;
        lineWidth: number;
        rect(x: number, y: number, w: number, h: number): void;
        roundRect(x: number, y: number, w: number, h: number, r: number): void;
        circle(cx: number, cy: number, r: number): void;
        moveTo(x: number, y: number): void;
        lineTo(x: number, y: number): void;
        fill(): void;
        stroke(): void;
        clear(): void;
    }

    type AssetCtor<T> = new (...args: never[]) => T;
    export const resources: {
        load<T extends Asset>(path: string, type: AssetCtor<T>, cb: (err: Error | null, asset: T) => void): void;
        loadDir<T extends Asset>(path: string, type: AssetCtor<T>, cb: (err: Error | null, assets: T[]) => void): void;
    };

    export const view: { getVisibleSize(): Size };

    export const sys: {
        localStorage: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
    };

    export interface Tween<T> {
        to(duration: number, props: Partial<Record<keyof T, unknown>> | Record<string, unknown>): Tween<T>;
        delay(duration: number): Tween<T>;
        call(cb: () => void): Tween<T>;
        start(): Tween<T>;
    }
    export function tween<T>(target: T): Tween<T>;
}
