/**
 * 游戏层冒烟测试：在假 cc 运行时里启动完整游戏，随机「点击」界面上的可点元素几千次。
 * 断言：不抛异常、界面文字没有 undefined/NaN、能走完多次 轮回殿 → 局内 → 结算 → 重生。
 */
import { describe, expect, it } from 'vitest';
import { Label, Node, sys, UITransform } from './fake-cc';
import { Game } from '../assets/scripts/game/game';
import { CONFIG } from '../assets/scripts/game/config';
import { Rng } from '../assets/scripts/core';

const flush = () => new Promise(r => setTimeout(r, 0));

function walk(n: Node, fn: (n: Node) => void): void {
    fn(n);
    for (const c of n.children) walk(c, fn);
}

function tappables(n: Node): Node[] {
    const out: Node[] = [];
    walk(n, x => { if (x.isValid && x.listeners.has(Node.EventType.TOUCH_END)) out.push(x); });
    return out;
}

function labels(n: Node): string[] {
    const out: string[] = [];
    walk(n, x => { const l = x.getComponent(Label); if (l) out.push(l.string); });
    return out;
}

/** 节点相对游戏根节点的顶部 y（向下为正）与高度 */
function absTop(n: Node, root: Node): number {
    let y = 0;
    for (let x: Node | null = n; x && x !== root; x = x.parent) y += -x.position.y;
    return y;
}
function heightOf(n: Node): number {
    return n.getComponent(UITransform)?.height ?? 0;
}

function screenName(g: Game): string {
    return (g.screen.children[0]?.name ?? '?');
}

describe('游戏层冒烟（假 cc 运行时）', () => {
    it.each([7, 42, 2026])('种子 %i：随机点击 3000 次，走完多次轮回，无异常、无 undefined/NaN、可点元素都在屏幕内', async seed => {
        sys.localStorage.clear?.();
        const host = new Node('Canvas');
        const g = new Game(host as never);
        await g.boot();
        await flush();
        expect(screenName(g)).toBe('draft');

        const rng = new Rng({ rng: seed });
        const seen = new Set<string>();
        let lives = 0;
        for (let i = 0; i < 3000; i++) {
            // 有弹窗时只能点弹窗
            const layer = g.overlay.children.length ? g.overlay : g.screen;
            const nodes = tappables(layer);
            expect(nodes.length, `第 ${i} 步：${screenName(g)} 界面没有可点元素`).toBeGreaterThan(0);
            // 偏好非遮罩元素（遮罩点击无效果）
            const real = nodes.filter(n => n.name !== 'modal');
            const root = g.screen.parent!;
            for (const n of real) {
                const top = absTop(n, root);
                expect(top, `第 ${i} 步：${n.name} 超出屏幕顶部`).toBeGreaterThanOrEqual(0);
                expect(top + heightOf(n), `第 ${i} 步：${screenName(g)} 的 ${n.name} 超出屏幕底部（${labels(n).join('|')}）`).toBeLessThanOrEqual(g.H + 1);
            }
            const pick = (real.length ? real : nodes)[rng.int((real.length ? real : nodes).length)];
            pick.emit(Node.EventType.TOUCH_START);
            pick.emit(Node.EventType.TOUCH_END);
            await flush();
            await flush();

            seen.add(screenName(g));
            const bad = labels(g.screen).concat(labels(g.overlay)).filter(s => /undefined|NaN|\[object/.test(s));
            expect(bad, `第 ${i} 步出现异常文字`).toEqual([]);
            lives = g.engine?.dp?.lives ?? 0;
        }
        expect(seen).toContain('run');
        expect(seen).toContain('settle');
        expect(lives).toBeGreaterThan(2);
    }, 60_000);

    it('中途存档：重启后恢复到同一局', async () => {
        sys.localStorage.clear?.();
        const host = new Node('Canvas');
        const g = new Game(host as never);
        await g.boot();
        await flush();
        // 依次点三张卡 + 重生
        for (let i = 0; i < 3; i++) {
            const card = tappables(g.screen).find(n => n.name.startsWith('card_'))!;
            card.emit(Node.EventType.TOUCH_START); card.emit(Node.EventType.TOUCH_END);
            await flush();
        }
        const rebirth = tappables(g.screen).find(n => n.children.some(c => c.getComponent(Label)?.string.includes('重   生')))!;
        rebirth.emit(Node.EventType.TOUCH_START); rebirth.emit(Node.EventType.TOUCH_END);
        await flush();
        expect(screenName(g)).toBe('run');
        const life = g.engine.run.life;
        const season = g.engine.run.season;

        const g2 = new Game(new Node('Canvas2') as never);
        await g2.boot();
        await flush();
        expect(screenName(g2)).toBe('run');
        expect(g2.engine.run.life).toBe(life);
        expect(g2.engine.run.season).toBe(season);
        expect(sys.localStorage.getItem(CONFIG.saveKey)).toBeTruthy();
    });
});

describe('贴图接入（真实素材）', () => {
    it('命格版优先/回落通用版；比例不合的贴图被跳过', async () => {
        const { image } = await import('../assets/scripts/game/ui/kit');
        const { TEX } = await import('../assets/scripts/game/config');
        const { Sprite } = await import('./fake-cc');
        const host = new Node('host');
        // 3:4 的结局背景用 cover：等比放大铺满 750x1334，不拉伸、居中溢出
        const bg = image(host as never, TEX.settleBgEnding, 0, 0, 750, 1334, { cover: true }) as unknown as Node;
        // 命格版 epitaph_card 是竖版 → 比例不合被跳过，回落到通用版（若通用版也缺则无贴图）
        const ep = image(host as never, TEX.epitaphCard, 0, 0, 690, 300, { maxAspectDiff: 0.5 }) as unknown as Node;
        // event_card 只有通用版 → 回落通用版
        const ev = image(host as never, TEX.eventCard, 0, 0, 690, 434) as unknown as Node;
        for (let i = 0; i < 10; i++) await flush();
        const bgT = bg.getComponent(UITransform)!;
        expect(bg.getComponent(Sprite)!.spriteFrame?.name).toBe('textures/destiny/desert_grass/settle_bg_ending');
        expect(bgT.width).toBeGreaterThanOrEqual(750);
        expect(bgT.height).toBeGreaterThanOrEqual(1334);
        expect(Math.abs(bgT.width / bgT.height - 896 / 1200)).toBeLessThan(0.01);
        expect(ep.getComponent(Sprite)!.spriteFrame?.name ?? null).not.toBe('textures/destiny/desert_grass/epitaph_card');
        expect(ev.getComponent(Sprite)!.spriteFrame?.name).toBe('textures/common/ui/event_card');
    });
});

describe('贴图加载兜底', () => {
    it('图片未导入为 sprite-frame 时，改读 ImageAsset 生成 SpriteFrame', async () => {
        const { loadSpriteFrame } = await import('../assets/scripts/game/loader');
        const { resources } = await import('./fake-cc');
        resources.spriteFrameDisabled = true;
        try {
            const sf = await loadSpriteFrame('textures/common/frame/frame_rare');
            expect(sf).not.toBeNull();
            expect(sf!.originalSize).toEqual({ width: 600, height: 900 });
            expect(await loadSpriteFrame('textures/common/frame/not_exist')).toBeNull();
        } finally {
            resources.spriteFrameDisabled = false;
        }
    });
});

describe('音频', () => {
    it('所有音效/BGM 文件存在，游戏流程中会播放 BGM 与音效，静音后不再播放', async () => {
        const { existsSync } = await import('node:fs');
        const { audioLog } = await import('./fake-cc');
        const names = ['click', 'card', 'choose', 'success', 'fail', 'item', 'skill', 'breakthrough', 'death', 'revive', 'ending'];
        for (const n of names) expect(existsSync(`assets/resources/audio/sfx/${n}.mp3`), n).toBe(true);
        for (const n of ['bgm_main', 'bgm_settle']) expect(existsSync(`assets/resources/audio/bgm/${n}.mp3`), n).toBe(true);

        sys.localStorage.clear?.();
        audioLog.length = 0;
        const g = new Game(new Node('Canvas') as never);
        await g.boot();
        for (let i = 0; i < 5; i++) await flush();
        expect(audioLog).toContain('bgm:bgm_main');
        // 点一张卡 → 翻卡音效
        const card = tappables(g.screen).find(n => n.name.startsWith('card_'))!;
        card.emit(Node.EventType.TOUCH_START); card.emit(Node.EventType.TOUCH_END);
        for (let i = 0; i < 3; i++) await flush();
        expect(audioLog).toContain('sfx:card');

        // 静音后点击不再出声
        g.toggleMute();
        const before = audioLog.length;
        const next = tappables(g.screen).find(n => n.name.startsWith('card_'))!;
        next.emit(Node.EventType.TOUCH_START); next.emit(Node.EventType.TOUCH_END);
        for (let i = 0; i < 3; i++) await flush();
        expect(audioLog.length).toBe(before);
        expect(g.save.muted).toBe(true);
    });
});
