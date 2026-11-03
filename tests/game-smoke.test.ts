/**
 * 游戏层冒烟测试：在假 cc 运行时里启动完整游戏，随机「点击」界面上的可点元素几千次。
 * 断言：不抛异常、界面文字没有 undefined/NaN、能走完多次 轮回殿 → 局内 → 结算 → 重生。
 */
import { describe, expect, it } from 'vitest';
import { Label, Node, sys, UITransform } from './fake-cc';
import { Game } from '../assets/scripts/game/game';
import { CONFIG } from '../assets/scripts/game/config';
import { writeSave } from '../assets/scripts/game/save';
import { destinyProfile, Rng } from '../assets/scripts/core';

const flush = () => new Promise(r => setTimeout(r, 0));
// 测试里不等启动页停留时间
CONFIG.splashMs = 0;

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
    it.each([
        [7, false], [42, false], [2026, false],
        [99, true], // 富裕存档：随机点击会买命盘（4 选 1、免费重演、多格封存等界面）
        [123, 'dog'], // 第二命格：土狗
    ] as [number, boolean | 'dog'][])('种子 %i（存档 %s）：随机点击 3000 次，走完多次轮回，无异常、无 undefined/NaN、可点元素都在屏幕内', async (seed, rich) => {
        sys.localStorage.clear?.();
        const host = new Node('Canvas');
        const g = new Game(host as never);
        await g.boot();
        await flush();
        expect(screenName(g)).toBe('menu');
        g.goDraft();
        if (rich === true) {
            g.save.profile.points = 100000;
            g.goDraft();
        }
        if (rich === 'dog') {
            g.save.profile.destinies.desert_grass.bestStage = 2;
            await g.switchDestiny('local_dog');
            expect(g.data.meta.id).toBe('local_dog');
        }

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
            // 回主菜单 / 放弃本局的入口单独测（见「主菜单」用例），随机点击时跳过，保证能走完多次轮回
            const nav = (n: Node) => labels(n).some(l => l === '☰ 菜单' || l === '‹ 菜单' || l === '重新投胎');
            const pool = real.filter(n => !nav(n)).length ? real.filter(n => !nav(n)) : real.length ? real : nodes;
            const pick = pool[rng.int(pool.length)];
            pick.emit(Node.EventType.TOUCH_START);
            pick.emit(Node.EventType.TOUCH_END);
            await flush();
            await flush();

            seen.add(screenName(g));
            const bad = labels(g.screen).concat(labels(g.overlay)).filter(s => /undefined|NaN|\[object/.test(s));
            expect(bad, `第 ${i} 步出现异常文字`).toEqual([]);
            lives = g.save?.profile?.lives ?? 0;
        }
        expect(seen).toContain('run');
        expect(seen).toContain('settle');
        expect(lives).toBeGreaterThan(2);
        if (rich === true) expect(Object.keys(g.engine.dp.upgrades).length).toBeGreaterThan(0);
    }, 60_000);

    it('命盘全满：4 选 1 卡牌、命盘列表、天命弹窗都在屏幕内', async () => {
        sys.localStorage.clear?.();
        const g = new Game(new Node('Canvas') as never);
        await g.boot();
        await flush();
        for (const v of g.engine.upgradeViews()) g.engine.dp.upgrades[v.id] = v.max;
        g.goDraft();
        await flush();
        const root = g.screen.parent!;
        const inScreen = (layer: Node) => {
            for (const n of tappables(layer).filter(n => n.name !== 'modal')) {
                const top = absTop(n, root);
                expect(top, n.name).toBeGreaterThanOrEqual(0);
                expect(top + heightOf(n), `${n.name}（${labels(n).join('|')}）`).toBeLessThanOrEqual(g.H + 1);
            }
        };
        const cards = tappables(g.screen).filter(n => n.name.startsWith('card_'));
        expect(cards.length).toBe(4);
        inScreen(g.screen);
        expect(labels(g.screen).some(l => l.includes('免费刷新'))).toBe(true);
        expect(labels(g.screen).some(l => l.startsWith('今日天命·'))).toBe(true);

        const tap = (label: string) => {
            const n = tappables(g.screen).find(x => labels(x).some(l => l.startsWith(label)))!;
            n.emit(Node.EventType.TOUCH_START); n.emit(Node.EventType.TOUCH_END);
        };
        tap('命盘');
        await flush();
        // 列表放不下时分页：逐页翻完，每页都在屏幕内，合计等于命盘条目数
        const seenLv = new Set<string>();
        for (let p = 0; p < 10; p++) {
            labels(g.overlay).filter(l => /Lv\d\/\d/.test(l)).forEach(l => seenLv.add(l));
            inScreen(g.overlay);
            const next = tappables(g.overlay).find(x => labels(x).some(l => l.startsWith('下一页')));
            if (!next) break;
            next.emit(Node.EventType.TOUCH_START); next.emit(Node.EventType.TOUCH_END);
            await flush();
        }
        expect(seenLv.size).toBe(g.engine.data.upgrades.size);
        g.goDraft();
        await flush();
        tap('今日天命');
        await flush();
        expect(labels(g.overlay).some(l => l.includes('换一个天命'))).toBe(true);
        inScreen(g.overlay);
    });

    it.each(['caterpillar', 'mantis_shrimp', 'crocodile'])('新命格 %s：选择页放得下全部命格；开局弹出生地，HUD 显示出生地，随机点击 800 次不出错', async id => {
        sys.localStorage.clear?.();
        const g = new Game(new Node('Canvas') as never);
        await g.boot();
        await flush();
        g.save.profile.destinies.desert_grass.bestStage = 2;
        destinyProfile(g.save.profile, 'local_dog').bestStage = 1;
        destinyProfile(g.save.profile, 'mantis_shrimp').bestStage = 2;
        g.goDestinySelect();
        await flush();
        const root = g.screen.parent!;
        const cards = tappables(g.screen).filter(n => n.name.startsWith('destiny_'));
        expect(cards.length).toBe(g.index.destinies.length);
        const back = tappables(g.screen).find(n => labels(n).some(l => l.includes('返')))!;
        for (const c of cards) expect(absTop(c, root) + heightOf(c), c.name).toBeLessThanOrEqual(absTop(back, root));
        const card = cards.find(n => n.name === `destiny_${id}`)!;
        card.emit(Node.EventType.TOUCH_START); card.emit(Node.EventType.TOUCH_END);
        for (let i = 0; i < 10; i++) await flush();
        expect(g.data.meta.id).toBe(id);
        for (let i = 0; i < 3; i++) {
            const c = tappables(g.screen).find(n => n.name.startsWith('card_'))!;
            c.emit(Node.EventType.TOUCH_START); c.emit(Node.EventType.TOUCH_END);
            await flush();
        }
        const go = tappables(g.screen).find(n => n.children.some(c => c.getComponent(Label)?.string.includes('重   生')))!;
        go.emit(Node.EventType.TOUCH_START); go.emit(Node.EventType.TOUCH_END);
        for (let i = 0; i < 5; i++) await flush();
        expect(screenName(g)).toBe('run');
        const map = g.engine.mapDef()!;
        expect(map).toBeTruthy();
        expect(labels(g.overlay).some(l => l.includes(`出生在「${map.name}」`))).toBe(true);
        expect(labels(g.screen).some(l => l.includes(map.name))).toBe(true);

        const rng = new Rng({ rng: 5 });
        for (let i = 0; i < 800; i++) {
            const layer = g.overlay.children.length ? g.overlay : g.screen;
            const nodes = tappables(layer).filter(n => n.name !== 'modal');
            const pick = (nodes.length ? nodes : tappables(layer))[rng.int(Math.max(1, nodes.length || tappables(layer).length))];
            if (!pick) continue;
            pick.emit(Node.EventType.TOUCH_START); pick.emit(Node.EventType.TOUCH_END);
            await flush(); await flush();
            const bad = labels(g.screen).concat(labels(g.overlay)).filter(t => /undefined|NaN|\[object/.test(t));
            expect(bad, `第 ${i} 步`).toEqual([]);
        }
    }, 60_000);

    it('多命格：未解锁时点不进；解锁后切换到土狗，HUD 按剧本显示，重启后记住命格', async () => {
        sys.localStorage.clear?.();
        const g = new Game(new Node('Canvas') as never);
        await g.boot();
        await flush();
        g.goDraft();
        await flush();
        const tapNode = (n: Node) => { n.emit(Node.EventType.TOUCH_START); n.emit(Node.EventType.TOUCH_END); };
        const openSelect = async () => {
            tapNode(tappables(g.screen).find(x => labels(x).some(l => l.includes('⇄')))!);
            await flush();
            expect(screenName(g)).toBe('destiny');
        };
        await openSelect();
        const dogCard = () => tappables(g.screen).find(n => n.name === 'destiny_local_dog')!;
        expect(labels(dogCard()).some(l => l.startsWith('🔒'))).toBe(true);
        tapNode(dogCard());
        for (let i = 0; i < 5; i++) await flush();
        expect(g.data.meta.id).toBe('desert_grass');

        // 达成解锁条件
        g.save.profile.destinies.desert_grass.bestStage = 2;
        g.goDraft();
        await flush();
        expect(labels(g.screen).some(l => l.includes('新命格'))).toBe(true);
        await openSelect();
        tapNode(dogCard());
        for (let i = 0; i < 10; i++) await flush();
        expect(g.data.meta.id).toBe('local_dog');
        expect(screenName(g)).toBe('draft');
        expect(labels(g.screen).some(l => l.includes('一只土狗'))).toBe(true);

        // 开一局：HUD 显示体力条与土狗属性
        for (let i = 0; i < 3; i++) {
            tapNode(tappables(g.screen).find(n => n.name.startsWith('card_'))!);
            await flush();
        }
        tapNode(tappables(g.screen).find(n => n.children.some(c => c.getComponent(Label)?.string.includes('重   生')))!);
        for (let i = 0; i < 5; i++) await flush();
        expect(screenName(g)).toBe('run');
        expect(g.engine.run.destiny).toBe('local_dog');
        const hudText = labels(g.screen);
        expect(hudText).toContain('体力');
        expect(hudText.some(l => l.includes('土狗崽'))).toBe(true);
        expect(hudText.some(l => /undefined|NaN/.test(l))).toBe(false);

        // 重启：恢复土狗这一局
        const g2 = new Game(new Node('Canvas2') as never);
        await g2.boot();
        await flush();
        expect(g2.data.meta.id).toBe('local_dog');
        expect(screenName(g2)).toBe('menu');
        expect(labels(g2.screen)).toContain('继续这一世');
        writeSave({ ...g2.save, run: null });
        // 进行中的局结束后，下次启动仍停在土狗命格
        const g3 = new Game(new Node('Canvas3') as never);
        await g3.boot();
        await flush();
        expect(g3.data.meta.id).toBe('local_dog');
        expect(screenName(g3)).toBe('menu');
        expect(labels(g3.screen)).toContain('开始轮回');
    });

    it('主菜单：开始轮回 → 轮回殿 ⇄ 菜单；局内回菜单可继续；重新投胎需确认并放弃本局', async () => {
        sys.localStorage.clear?.();
        const g = new Game(new Node('Canvas') as never);
        await g.boot();
        await flush();
        const tap = (layer: Node, label: string) => {
            const n = tappables(layer).find(x => labels(x).some(l => l.startsWith(label)));
            expect(n, `找不到「${label}」`).toBeTruthy();
            n!.emit(Node.EventType.TOUCH_START); n!.emit(Node.EventType.TOUCH_END);
        };
        const root = g.screen.parent!;
        const inScreen = () => {
            for (const n of tappables(g.screen)) {
                expect(absTop(n, root)).toBeGreaterThanOrEqual(0);
                expect(absTop(n, root) + heightOf(n), labels(n).join('|')).toBeLessThanOrEqual(g.H + 1);
            }
        };
        expect(screenName(g)).toBe('menu');
        const ls = labels(g.screen);
        expect(ls).toContain('开始轮回');
        expect(ls).not.toContain('继续这一世');
        expect(ls).toContain('健康游戏忠告');
        expect(ls).toContain('选择命格');
        inScreen();

        tap(g.screen, '开始轮回');
        await flush();
        expect(screenName(g)).toBe('draft');
        tap(g.screen, '‹ 菜单');
        await flush();
        expect(screenName(g)).toBe('menu');
        tap(g.screen, '选择命格');
        await flush();
        expect(screenName(g)).toBe('destiny');
        tap(g.screen, '返');
        await flush();
        expect(screenName(g)).toBe('menu');

        // 开一局后回菜单
        g.goDraft();
        for (let i = 0; i < 3; i++) {
            const c = tappables(g.screen).find(n => n.name.startsWith('card_'))!;
            c.emit(Node.EventType.TOUCH_START); c.emit(Node.EventType.TOUCH_END);
            await flush();
        }
        tap(g.screen, '重   生');
        for (let i = 0; i < 5; i++) await flush();
        expect(screenName(g)).toBe('run');
        const season = g.engine.run.season;
        tap(g.screen, '☰ 菜单');
        await flush();
        expect(screenName(g)).toBe('menu');
        expect(labels(g.screen)).toContain('继续这一世');
        expect(labels(g.screen).some(l => l.includes('先结束或放弃这一世'))).toBe(true);
        inScreen();
        tap(g.screen, '继续这一世');
        await flush();
        expect(screenName(g)).toBe('run');
        expect(g.engine.run.season).toBe(season);

        // 重新投胎：先弹确认，「再想想」不放弃；确认后本局作废、回轮回殿
        tap(g.screen, '☰ 菜单');
        await flush();
        const lives = g.engine.dp.lives;
        tap(g.screen, '重新投胎');
        await flush();
        expect(labels(g.overlay)).toContain('放弃这一世？');
        tap(g.overlay, '再想想');
        await flush();
        expect(g.hasActiveRun()).toBe(true);
        tap(g.screen, '重新投胎');
        await flush();
        tap(g.overlay, '放弃，重新投胎');
        for (let i = 0; i < 3; i++) await flush();
        expect(screenName(g)).toBe('draft');
        expect(g.hasActiveRun()).toBe(false);
        expect(g.save.run).toBeNull();
        expect(g.engine.dp.lives).toBe(lives);
    });

    it('中途存档：重启后恢复到同一局', async () => {
        sys.localStorage.clear?.();
        const host = new Node('Canvas');
        const g = new Game(host as never);
        await g.boot();
        await flush();
        g.goDraft();
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
        expect(screenName(g2)).toBe('menu');
        const cont = tappables(g2.screen).find(n => labels(n).includes('继续这一世'))!;
        cont.emit(Node.EventType.TOUCH_START); cont.emit(Node.EventType.TOUCH_END);
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
        const { TEX, setTexDestiny } = await import('../assets/scripts/game/config');
        const { Sprite } = await import('./fake-cc');
        setTexDestiny('desert_grass');
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
        for (const n of names) expect(existsSync(`assets/subres/audio/sfx/${n}.mp3`), n).toBe(true);
        for (const n of ['bgm_main', 'bgm_settle']) expect(existsSync(`assets/subres/audio/bgm/${n}.mp3`), n).toBe(true);

        sys.localStorage.clear?.();
        audioLog.length = 0;
        const g = new Game(new Node('Canvas') as never);
        await g.boot();
        for (let i = 0; i < 5; i++) await flush();
        expect(audioLog).toContain('bgm:bgm_main');
        g.goDraft();
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

describe('启动页（备案：游戏名 + 适龄提示 + 健康游戏忠告）', () => {
    it('同屏显示三项，忠告全文与官方一致；点适龄图标弹出说明', async () => {
        const { showSplash, GAME_NAME } = await import('../assets/scripts/game/screens/splash');
        sys.localStorage.clear?.();
        const g = new Game(new Node('Canvas') as never);
        await g.boot();
        g.reset();
        showSplash(g, '正在轮回……');
        const ls = labels(g.screen);
        expect(ls).toContain(GAME_NAME);
        expect(ls).toContain(`${CONFIG.ageRating}+`);
        expect(ls).toContain('健康游戏忠告');
        expect(ls.join('')).toContain('抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。');
        const badge = tappables(g.screen).find(n => n.name === `age_${CONFIG.ageRating}`)!;
        expect(heightOf(badge)).toBeGreaterThanOrEqual(g.W / 10);
        badge.emit(Node.EventType.TOUCH_START); badge.emit(Node.EventType.TOUCH_END);
        await flush();
        expect(labels(g.overlay).some(l => l.includes('适龄提示'))).toBe(true);
    });

    it('随缘投胎：每天首次免费、再转要看视频；转出的命格开局带加成；新命格解锁用转盘揭晓', async () => {
        sys.localStorage.clear?.();
        const g = new Game(new Node('Canvas') as never);
        await g.boot();
        await flush();
        const tapNode = (n: Node) => { n.emit(Node.EventType.TOUCH_START); n.emit(Node.EventType.TOUCH_END); };
        const find = (layer: Node, s: string) => tappables(layer).find(n => labels(n).some(l => l.includes(s)));
        // 只有一个命格时没有转盘
        g.goDestinySelect('menu');
        await flush();
        expect(find(g.screen, '随缘投胎')).toBeUndefined();

        g.save.profile.destinies.desert_grass.bestStage = 2;
        destinyProfile(g.save.profile, 'local_dog').bestStage = 1;
        g.goDestinySelect('menu');
        await flush();
        const root = g.screen.parent!;
        const spin = find(g.screen, '随缘投胎 · 免费')!;
        expect(spin).toBeTruthy();
        expect(absTop(spin, root) + heightOf(spin)).toBeLessThanOrEqual(g.H);
        tapNode(spin);
        for (let i = 0; i < 5; i++) await flush();
        const target = g.save.spinBonus!;
        expect(target).toBeTruthy();
        expect(labels(g.overlay).some(l => l.includes('本世结算轮回点 +30%'))).toBe(true);
        tapNode(find(g.overlay, '投  胎')!);
        for (let i = 0; i < 10; i++) await flush();
        expect(screenName(g)).toBe('draft');
        expect(g.data.meta.id).toBe(target);
        for (let i = 0; i < 3; i++) {
            tapNode(tappables(g.screen).find(n => n.name.startsWith('card_'))!);
            await flush();
        }
        tapNode(find(g.screen, '重   生')!);
        for (let i = 0; i < 5; i++) await flush();
        expect(g.engine.run.spin).toBe(true);
        expect(g.save.spinBonus).toBeNull();
        g.engine.run.over = { kind: 'death', id: g.data.meta.rules.oldAgeDeath };
        const s = g.engine.settle();
        expect(s.breakdown.map(b => b.label)).toContain('随缘投胎 +30%');

        // 今天第二次：看视频
        g.goDestinySelect('menu');
        await flush();
        expect(find(g.screen, '随缘投胎 · 视频')).toBeTruthy();

        // 转出后手动换成别的命格：加成作废
        g.save.spinBonus = 'desert_grass';
        await g.switchDestiny(g.data.meta.id === 'local_dog' ? 'mantis_shrimp' : 'local_dog');
        expect(g.save.spinBonus).toBeNull();

        // 新命格解锁：结算后弹出转盘揭晓
        g.overlay.destroyAllChildren();
        const { showUnlockReveal } = await import('../assets/scripts/game/screens/destiny');
        showUnlockReveal(g, ['local_dog']);
        expect(labels(g.overlay).some(l => l.includes('「一只土狗」已解锁'))).toBe(true);
        tapNode(find(g.overlay, '知  道  了')!);
        expect(g.overlay.children.filter(n => n.isValid).length).toBe(0);
    });
});
