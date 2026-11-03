/**
 * 游戏控制器：持有引擎与存档，负责界面切换、存档、广告点位。
 * 界面函数（screens/*）只读取 Game 的状态并回调这里的方法，不直接改存档。
 */
import { Label, Node, view } from 'cc';
import { Destiny, DestinyIndex, destinyStates, Engine, pickDestiny, randomSeed, StepResult } from '../core';
import { Audio, SfxName } from './audio';
import { CONFIG, setTexDestiny, TEX } from './config';
import { loadDestiny, loadDestinyIndex } from './loader';
import { Platform } from './platform';
import { loadSubBundle } from './res';
import { loadSave, SaveData, writeSave } from './save';
import { box, clear, COLOR, image, rect, setTapFeedback, text } from './ui/kit';
import { showDestinySelect, showUnlockReveal } from './screens/destiny';
import { showMenu } from './screens/menu';
import { showDraft } from './screens/draft';
import { showRun } from './screens/run';
import { showSettle } from './screens/settle';
import { showSplash } from './screens/splash';
import { showDying, showInfo, showStep } from './screens/popups';

/** 本地日期 YYYY-MM-DD（每日天命按玩家本地日期切换） */
export function todayKey(d = new Date()): string {
    const p = (n: number) => (n < 10 ? '0' : '') + n;
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class Game {
    /** 所有命格（轮回殿可切换） */
    index!: DestinyIndex;
    data!: Destiny;
    engine!: Engine;
    save!: SaveData;
    /** 当前界面根节点（左上角为原点） */
    screen!: Node;
    /** 弹窗层，始终在界面之上 */
    overlay!: Node;
    audio!: Audio;
    W = CONFIG.designWidth;
    H = CONFIG.designHeight;

    constructor(private host: Node) {}

    async boot(): Promise<void> {
        const vs = view.getVisibleSize();
        this.W = CONFIG.designWidth;
        this.H = Math.round(vs.height * (CONFIG.designWidth / vs.width));
        const root = box(this.host, -vs.width / 2, 0, this.W, this.H, 'game');
        root.setPosition(-vs.width / 2, vs.height / 2, 0);
        root.setScale(vs.width / this.W, vs.width / this.W, 1);
        this.screen = box(root, 0, 0, this.W, this.H, 'screen');
        this.overlay = box(root, 0, 0, this.W, this.H, 'overlay');

        this.save = loadSave();
        const run = this.save.run;
        // 启动页（游戏名 + 适龄提示 + 健康游戏忠告），加载期间显示，至少停留 splashMs
        const t0 = Date.now();
        const status = showSplash(this, '正在轮回……');
        try {
            this.index = await loadDestinyIndex();
            await this.useDestiny(pickDestiny(this.index, this.save.profile, run?.destiny ?? this.save.profile.current ?? CONFIG.defaultDestiny));
        } catch (e) {
            console.error('[game] 剧本加载失败', e);
            const l = status.getComponent(Label);
            if (l) l.string = '剧本加载失败，请重启游戏';
            return;
        }
        const wait = CONFIG.splashMs - (Date.now() - t0);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        this.audio = new Audio(this.save.muted);
        this.audio.attach(this.host);
        this.audio.preload(['click', 'choose', 'success', 'fail', 'item']);
        setTapFeedback(() => this.audio.play('click'));
        Platform.setupPassiveShare(() => ({
            title: `这一世我重生了，成了${this.data.meta.name}`,
            imageUrl: TEX.share(this.data.meta.id),
        }));

        // 有中途存档就恢复到引擎里，由主菜单「继续」进入
        if (run && run.destiny === this.data.meta.id && run.phase !== 'over') this.engine.resume(run);
        this.goMenu();
        // 主界面出来后再后台拉分包（其余贴图、音频）
        loadSubBundle().then(b => { if (b) this.subReady = true; });
    }

    /** 加载命格剧本并切换引擎（剧本有缓存，来回切换不重复加载） */
    private destinyCache = new Map<string, Destiny>();
    private async useDestiny(id: string): Promise<void> {
        let d = this.destinyCache.get(id);
        if (!d) {
            d = await loadDestiny(id);
            this.destinyCache.set(id, d);
        }
        this.data = d;
        this.engine = new Engine(d, this.save.profile);
        this.save.profile.current = id;
        setTexDestiny(id);
    }

    /** 轮回殿切换命格（只能在开局前切换，进行中的一局不受影响） */
    private switching = false;
    async switchDestiny(id: string, then: 'draft' | 'menu' = 'draft'): Promise<void> {
        if (this.switching || id === this.data.meta.id) return;
        const st = destinyStates(this.index, this.save.profile).find(s => s.entry.id === id);
        if (!st?.unlocked) return;
        this.switching = true;
        if (id !== this.save.spinBonus) this.save.spinBonus = null;
        const prev = this.data.meta.id;
        this.loading(`正在投胎为「${st.entry.name}」……`);
        try {
            await this.useDestiny(id);
            Platform.report('switch_destiny', { id });
        } catch (e) {
            console.error('[game] 命格加载失败', e);
            Platform.toast('命格加载失败，请稍后再试');
            await this.useDestiny(prev).catch(() => undefined);
        } finally {
            this.switching = false;
        }
        if (then === 'menu') this.goMenu();
        else this.goDraft();
    }

    /** 随缘投胎：今天的免费次数还在吗 */
    canFreeSpin(): boolean {
        return this.save.spinDay !== todayKey();
    }

    /** 随缘投胎：每天首次免费、之后看视频，在已解锁命格里随机一个（看视频取消返回 null） */
    async rollSpin(): Promise<string | null> {
        const pool = destinyStates(this.index, this.save.profile).filter(s => s.unlocked).map(s => s.entry.id);
        if (pool.length < 2) return null;
        if (this.canFreeSpin()) this.save.spinDay = todayKey();
        else if (!(await this.watchAd('spin_destiny'))) return null;
        const id = pool[Math.floor(Math.random() * pool.length)];
        this.save.spinBonus = id;
        this.persist();
        Platform.report('spin_destiny', { id });
        return id;
    }

    /** 命格选择；from = 从哪个界面进来（返回时回到那里） */
    goDestinySelect(from: 'draft' | 'menu' = 'draft'): void {
        this.reset();
        showDestinySelect(this, from);
    }

    /** 分包是否已就绪 */
    private subReady = false;
    /** 分包没下完时显示加载提示并等待；下载失败也放行（缺图有兜底） */
    private async ensureSub(): Promise<void> {
        if (this.subReady) return;
        this.loading(this.data.meta.rules.loadingText ?? '正在加载资源……');
        if (await loadSubBundle()) this.subReady = true;
    }

    // ───────────── 界面切换 ─────────────

    /** 是否有进行中的一局（主菜单显示「继续」） */
    hasActiveRun(): boolean {
        const r = this.engine?.run;
        return !!r && r.phase !== 'over';
    }

    goMenu(): void {
        this.reset();
        this.audio.playBgm('bgm_main');
        showMenu(this);
    }

    /** 放弃进行中的一局（不结算），回到开局前状态 */
    abandonRun(): void {
        if (!this.hasActiveRun()) return;
        Platform.report('abandon_life', { life: this.engine.run.life, season: this.engine.run.season });
        this.engine = new Engine(this.data, this.save.profile);
        this.save.run = null;
        this.persist();
    }

    goDraft(): void {
        this.save.run = null;
        this.save.peekUsed = 0;
        this.save.rerollUsed = false;
        this.save.freeRerollUsed = 0;
        this.engine.todayFate(todayKey());
        this.persist();
        this.reset();
        this.audio.playBgm('bgm_main');
        showDraft(this);
    }

    goRun(): void {
        this.reset();
        this.audio.playBgm('bgm_main');
        if (this.engine.run.phase === 'dying') {
            showRun(this);
            showDying(this);
        } else if (this.engine.run.phase === 'over') {
            this.goSettle();
        } else {
            showRun(this);
        }
    }

    goSettle(): void {
        const before = new Set(destinyStates(this.index, this.save.profile).filter(st => st.unlocked).map(st => st.entry.id));
        const s = this.engine.settle();
        this.save.run = null;
        this.persist();
        const fresh = destinyStates(this.index, this.save.profile).filter(st => st.unlocked && !before.has(st.entry.id));
        Platform.report('life_end', { kind: s.kind, cause: s.id, seasons: s.seasons, stage: s.stage });
        this.reset();
        this.audio.playBgm('bgm_settle');
        if (s.kind === 'ending') this.audio.play('ending');
        showSettle(this);
        // 新命格解锁：转盘揭晓（停在新命格上）
        if (fresh.length) showUnlockReveal(this, fresh.map(st => st.entry.id));
    }

    // ───────────── 动作 ─────────────

    private starting = false;
    async startRun(pick: { talent: string; item: string; companion: string; skills?: string[] }): Promise<void> {
        if (this.starting) return;
        this.starting = true;
        try {
            await this.ensureSub();
        } finally {
            this.starting = false;
        }
        const spin = this.save.spinBonus === this.data.meta.id;
        this.save.spinBonus = null;
        this.engine.startRun({ ...pick, spin }, randomSeed());
        this.save.peekUsed = 0;
        this.persist();
        const map = this.engine.mapDef();
        Platform.report('start_life', { life: this.engine.run.life, talent: pick.talent, map: map?.id ?? '' });
        this.goRun();
        const B = this.data.meta.blessed;
        if (this.engine.run.blessed && B) {
            // 天命之子：金色开局（天胡通道）
            Platform.report('blessed', { life: this.engine.run.life });
            this.audio.play('ending');
            Platform.vibrate();
            showInfo(this, `✦ ${B.name} ✦`, [
                B.text,
                `本世：全属性大幅提升${B.lifespanMul && B.lifespanMul > 1 ? `，寿元 ×${B.lifespanMul}` : ''}，奇遇将至。`,
                ...(map ? [`出生地：${map.name}`] : []),
            ]);
        } else if (map) showInfo(this, `这一世，你出生在「${map.name}」`, [map.desc]);
    }

    /** 执行一个会产生结果的动作（选项/道具/技能），弹出结果后推进 */
    act(fn: () => StepResult): void {
        let step: StepResult;
        try {
            step = fn();
        } catch (e) {
            console.warn('[game] 动作无效', e);
            return;
        }
        this.persist();
        this.audio.play(this.stepSound(step));
        showStep(this, step, () => this.afterStep());
    }

    /** 按结果挑一个最重要的音效 */
    private stepSound(s: StepResult): SfxName {
        const phase = this.engine.run.phase;
        if (phase === 'dying') return 'death';
        if (s.messages.some(m => m.startsWith('【突破·'))) return 'breakthrough';
        if (s.revived) return 'revive';
        if (s.crit) return 'breakthrough';
        if (s.skills.length) return 'skill';
        if (s.success === false) return 'fail';
        if (s.success === true) return 'success';
        if (s.gained.length) return 'item';
        return 'choose';
    }

    toggleMute(): boolean {
        this.save.muted = !this.save.muted;
        this.audio.setMuted(this.save.muted);
        this.persist();
        return this.save.muted;
    }

    afterStep(): void {
        const phase = this.engine.run.phase;
        if (phase === 'over') this.goSettle();
        else if (phase === 'dying') { this.reset(); showRun(this); showDying(this); }
        else { this.reset(); showRun(this); }
    }

    async reviveByAd(): Promise<void> {
        if (!this.engine.canReviveByAd()) return;
        if (!(await this.watchAd('revive'))) {
            if (this.engine.run.phase === 'dying') showDying(this);
            return;
        }
        this.act(() => this.engine.reviveByAd());
    }

    acceptDeath(): void {
        if (this.engine.run.phase !== 'dying' && this.engine.run.phase !== 'over') return;
        this.goSettle();
    }

    async peekByAd(): Promise<void> {
        if (this.save.peekUsed >= CONFIG.peekPerRun || this.engine.run.phase !== 'event') return;
        if (!(await this.watchAd('peek'))) return;
        if (this.engine.run.phase !== 'event') return;
        this.save.peekUsed += 1;
        this.engine.revealAll();
        this.persist();
        this.reset();
        showRun(this);
    }

    /** 命盘升级（花轮回点） */
    buyUpgrade(id: string): boolean {
        try {
            this.engine.buyUpgrade(id);
        } catch (e) {
            console.warn('[game] 命盘升级失败', e);
            return false;
        }
        this.persist();
        Platform.report('upgrade_buy', { id, level: this.engine.upgradeLevel(id) });
        return true;
    }

    /** 看视频换一个今日天命（每天一次） */
    async swapFateByAd(): Promise<boolean> {
        if (!this.engine.canSwapFate()) return false;
        if (!(await this.watchAd('swap_fate'))) return false;
        this.engine.swapFate(randomSeed());
        this.persist();
        return true;
    }

    async doublePointsByAd(): Promise<boolean> {
        if (!(await this.watchAd('double_points'))) return false;
        this.engine.doublePoints();
        this.persist();
        return true;
    }

    /** 看激励视频（防连点：广告期间重复点击直接忽略） */
    private adBusy = false;
    async watchAd(scene: string): Promise<boolean> {
        if (this.adBusy) return false;
        this.adBusy = true;
        try {
            const ok = await Platform.showRewardedAd(scene);
            Platform.report(ok ? 'ad_reward' : 'ad_cancel', { scene });
            return ok;
        } finally {
            this.adBusy = false;
        }
    }

    persist(): void {
        const phase = this.engine?.run?.phase;
        this.save.run = this.engine?.run && phase !== 'over' ? this.engine.run : null;
        writeSave(this.save);
    }

    // ───────────── 工具 ─────────────

    reset(): void {
        clear(this.screen);
        clear(this.overlay);
    }

    private loading(msg: string): void {
        clear(this.screen);
        rect(this.screen, { fill: COLOR.bg });
        image(this.screen, TEX.mainBg, 0, 0, this.W, this.H, { cover: true });
        const lw = this.W - 80;
        image(this.screen, TEX.logo, 40, this.H * 0.28, lw, lw * 0.36);
        text(this.screen, msg, 0, this.H / 2 + 40, this.W, { size: 30, color: COLOR.ink2, align: 'center' });
    }
}
