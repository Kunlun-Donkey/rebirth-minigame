/**
 * 游戏控制器：持有引擎与存档，负责界面切换、存档、广告点位。
 * 界面函数（screens/*）只读取 Game 的状态并回调这里的方法，不直接改存档。
 */
import { Node, view } from 'cc';
import { Destiny, Engine, randomSeed, StepResult } from '../core';
import { Audio, SfxName } from './audio';
import { CONFIG, TEX } from './config';
import { loadDestiny } from './loader';
import { Platform } from './platform';
import { loadSubBundle } from './res';
import { loadSave, SaveData, writeSave } from './save';
import { box, clear, COLOR, image, rect, setTapFeedback, text } from './ui/kit';
import { showDraft } from './screens/draft';
import { showRun } from './screens/run';
import { showSettle } from './screens/settle';
import { showDying, showStep } from './screens/popups';

/** 本地日期 YYYY-MM-DD（每日天命按玩家本地日期切换） */
export function todayKey(d = new Date()): string {
    const p = (n: number) => (n < 10 ? '0' : '') + n;
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class Game {
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

        this.loading('荒漠里，一颗种子正在醒来……');
        try {
            this.data = await loadDestiny(CONFIG.destiny);
        } catch (e) {
            console.error('[game] 剧本加载失败', e);
            this.loading('剧本加载失败，请重启游戏');
            return;
        }
        this.save = loadSave();
        this.engine = new Engine(this.data, this.save.profile);
        this.audio = new Audio(this.save.muted);
        this.audio.attach(this.host);
        this.audio.preload(['click', 'choose', 'success', 'fail', 'item']);
        setTapFeedback(() => this.audio.play('click'));
        Platform.setupPassiveShare(() => '我重生了，这一世我将拿回属于我的一切');

        const run = this.save.run;
        if (run && run.destiny === this.data.meta.id && run.phase !== 'over') {
            this.engine.resume(run);
            this.goRun();
        } else {
            this.goDraft();
        }
        // 主界面出来后再后台拉分包（其余贴图、音频）
        loadSubBundle().then(b => { if (b) this.subReady = true; });
    }

    /** 分包是否已就绪 */
    private subReady = false;
    /** 分包没下完时显示加载提示并等待；下载失败也放行（缺图有兜底） */
    private async ensureSub(): Promise<void> {
        if (this.subReady) return;
        this.loading('正在加载资源……');
        if (await loadSubBundle()) this.subReady = true;
    }

    // ───────────── 界面切换 ─────────────

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
        const s = this.engine.settle();
        this.save.run = null;
        this.persist();
        Platform.report('life_end', { kind: s.kind, cause: s.id, seasons: s.seasons, stage: s.stage });
        this.reset();
        this.audio.playBgm('bgm_settle');
        if (s.kind === 'ending') this.audio.play('ending');
        showSettle(this);
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
        this.engine.startRun(pick, randomSeed());
        this.save.peekUsed = 0;
        this.persist();
        Platform.report('start_life', { life: this.engine.run.life, talent: pick.talent });
        this.goRun();
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
        if (s.messages.some(m => m.includes('又活了过来') || m.includes('替你挡下') || m.includes('新芽'))) return 'revive';
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
