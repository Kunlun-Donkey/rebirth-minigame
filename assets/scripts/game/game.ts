/**
 * 游戏控制器：持有引擎与存档，负责界面切换、存档、广告点位。
 * 界面函数（screens/*）只读取 Game 的状态并回调这里的方法，不直接改存档。
 */
import { Node, view } from 'cc';
import { Destiny, Engine, randomSeed, StepResult } from '../core';
import { CONFIG } from './config';
import { loadDestiny } from './loader';
import { Platform } from './platform';
import { loadSave, SaveData, writeSave } from './save';
import { box, clear, COLOR, rect, text } from './ui/kit';
import { showDraft } from './screens/draft';
import { showRun } from './screens/run';
import { showSettle } from './screens/settle';
import { showDying, showStep } from './screens/popups';

export class Game {
    data!: Destiny;
    engine!: Engine;
    save!: SaveData;
    /** 当前界面根节点（左上角为原点） */
    screen!: Node;
    /** 弹窗层，始终在界面之上 */
    overlay!: Node;
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
        Platform.setupPassiveShare(() => '我重生了，这一世我将拿回属于我的一切');

        const run = this.save.run;
        if (run && run.destiny === this.data.meta.id && run.phase !== 'over') {
            this.engine.resume(run);
            this.goRun();
        } else {
            this.goDraft();
        }
    }

    // ───────────── 界面切换 ─────────────

    goDraft(): void {
        this.save.run = null;
        this.save.peekUsed = 0;
        this.save.rerollUsed = false;
        this.persist();
        this.reset();
        showDraft(this);
    }

    goRun(): void {
        this.reset();
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
        showSettle(this);
    }

    // ───────────── 动作 ─────────────

    startRun(pick: { talent: string; item: string; companion: string; skills?: string[] }): void {
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
        showStep(this, step, () => this.afterStep());
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
        text(this.screen, msg, 0, this.H / 2 - 30, this.W, { size: 30, color: COLOR.ink2, align: 'center' });
    }
}
