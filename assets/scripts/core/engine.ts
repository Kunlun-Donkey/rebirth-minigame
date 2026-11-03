/**
 * 局内引擎：状态机
 *
 *   rollDraft() → startRun(pick)
 *   loop:
 *     phase 'direction' : directionOptions() / useItem(id) / useSkill(id) / chooseDirection(dir)
 *     phase 'event'     : eventView() / useSkill(id) / choose(i)
 *     phase 'dying'     : reviveByAd() 或 settle()
 *     phase 'over'      : settle() → sealRelics(ids)
 *
 * 局外：upgradeViews() / buyUpgrade(id) 命盘；todayFate(date) / swapFate(seed) 每日天命（startRun 前调用）
 *
 * 所有局内状态都在 run（可 JSON 序列化），存档只需保存 run + profile。
 */
import { CondCtx, CondNode, describeCond, DescribeNames, evalCond, HasKind, NumRef, walkCond } from './condition';
import {
    DANMAKU, fill, memorySnark, STREAK_BREAK, TIANDAO_BREAK, TIANDAO_REVIVE, TIANDAO_SETTLE, TIANDAO_START, TIANDAO_TIANHU, tiandao, tiandaoTier,
} from './flavor';
import { addUnique, destinyProfile } from './profile';
import { Rng } from './rng';
import {
    Choice, ChoiceView, CodexView, Cond, Destiny, Dir, DirOption, DraftPick, Effect, EventView, GameEvent, Hype, HYPE_ORDER, Mods, Outcome, Profile,
    RARITIES, Rarity, RunState, SettleResult, SkillView, StageProgress, StepResult, UpgradeKind, UpgradeView,
} from './types';

const ATTR_FLOOR = 0;
const MEMORY_TEXT_MAX = 18;
/** 今日首世轮回点加成 */
export const DAILY_FIRST_BONUS = 0.5;
/** 随缘投胎（转盘选命格）结算轮回点加成 */
export const SPIN_BONUS = 0.3;
const EMPTY_EFFECT: Effect = { attrs: {}, flags: [], unflags: [], items: [], loseItems: [], skills: [], follows: [], feuds: [], states: [] };
/** 连胜几次起「势如破竹」，以及单次奖励上限 */
const STREAK_MIN = 3;
const STREAK_BONUS_MAX = 6;
/** 成功率低于此值硬选并因此送命 → 墓志铭「死于过度自信」 */
const RECKLESS_CHANCE = 0.25;
/** 突破时天道插话的概率 */
const TIANDAO_BREAK_CHANCE = 0.5;
/** 有成功率的选项成功后，再判定一次大成功（属性收益翻倍） */
export const CRIT_CHANCE = 0.15;
/** 同一世已遇到过的（非 once）事件再次抽中的权重系数 */
const REPEAT_WEIGHT = 0.25;

export class Engine {
    run!: RunState;
    private rng!: Rng;
    private settled?: SettleResult;
    private doubled = false;

    constructor(readonly data: Destiny, readonly profile: Profile) {}

    get dp() { return destinyProfile(this.profile, this.data.meta.id); }

    // ───────────── 开局 ─────────────

    /** 抽取开局三池（各 draftSize() 个，默认 3） */
    rollDraft(seed: number): DraftPick {
        const holder = { rng: seed };
        const rng = new Rng(holder);
        const w = this.data.meta.settings.rarityWeights;
        const draw = <T extends { id: string; rarity: Rarity }>(pool: T[], n: number): string[] => {
            const left = [...pool];
            const out: string[] = [];
            while (out.length < n && left.length) {
                const rarity = rng.weighted(RARITIES.filter(r => left.some(x => x.rarity === r)), r => w[r])!;
                const cands = left.filter(x => x.rarity === rarity);
                const pick = cands[rng.int(cands.length)];
                out.push(pick.id);
                left.splice(left.indexOf(pick), 1);
            }
            return out;
        };
        const n = this.draftSize();
        return {
            talents: draw([...this.data.talents.values()], n),
            items: draw([...this.data.items.values()], n),
            companions: draw([...this.data.companions.values()].filter(c => !c.system), n),
        };
    }

    /** 已解锁技能数超过携带上限时，开局需要玩家挑选 */
    needSkillLoadout(): boolean {
        return this.dp.skills.length > this.data.meta.settings.skillSlots;
    }

    /** pick.skills 为开局携带的技能；省略时自动携带（最多 skillSlots 个，优先最新领悟的） */
    startRun(pick: { talent: string; item: string; companion: string; skills?: string[]; spin?: boolean }, seed: number): void {
        const d = this.data;
        const dp = this.dp;
        const attrs: Record<string, number> = {};
        for (const a of d.meta.attrs) attrs[a.id] = a.init;

        this.run = {
            destiny: d.meta.id,
            life: dp.lives + 1,
            rng: seed,
            season: 0,
            stage: 0,
            attrs,
            pos: { up: 0, down: 0, side: 0 },
            push: { up: 0, down: 0, side: 0 },
            maxPos: { up: 0, down: 0, side: 0 },
            flags: [],
            items: [],
            found: [],
            talents: [pick.talent],
            companions: [pick.companion],
            seen: [],
            phase: 'direction',
            pending: [],
            threads: [],
            revealAll: false,
            reviveUsed: { talent: false, ad: false },
            log: [],
            skills: [],
            cd: {},
            boost: 0,
            learned: [],
            missed: [],
            lines: {},
        };
        if (pick.spin) this.run.spin = true;
        const slots = d.meta.settings.skillSlots;
        const owned = dp.skills.filter(id => d.skills.has(id));
        this.run.skills = (pick.skills ? pick.skills.filter(id => owned.includes(id)) : [...owned].reverse()).slice(0, slots);
        this.rng = new Rng(this.run);
        this.settled = undefined;
        this.doubled = false;

        const sink = this.newStep();
        // 出生地图（按权重随机）
        const maps = [...d.maps.values()];
        const map = maps.length ? this.rng.weighted(maps, m => m.weight ?? 1) : undefined;
        if (map) {
            this.run.map = map.id;
            if (map.startEffect) this.applyEffect(map.startEffect, sink, false);
        }
        // 传承
        for (const [id, lv] of Object.entries(dp.legacy)) {
            const def = d.legacies.get(id);
            if (!def) continue;
            for (let i = 0; i < Math.min(lv, def.levelEffects.length); i++) this.applyEffect(def.levelEffects[i], sink, false);
        }
        // 命盘
        for (const u of d.upgrades.values()) {
            if (u.kind !== 'start' || !u.startEffect) continue;
            for (let i = 0; i < this.upgradeLevel(u.id); i++) this.applyEffect(u.startEffect, sink, false);
        }
        // 今日天命（由 todayFate 设定）
        const daily = dp.daily;
        if (daily && d.fates.has(daily.fate)) {
            this.run.fate = daily.fate;
            this.run.firstOfDay = daily.first;
            daily.first = false;
            const f = d.fates.get(daily.fate)!;
            if (f.startEffect) this.applyEffect(f.startEffect, sink, false);
        }
        // 天赋 / 伴生物开局效果
        const t = d.talents.get(pick.talent);
        if (t?.startEffect) this.applyEffect(t.startEffect, sink, false);
        const c = d.companions.get(pick.companion);
        if (c?.startEffect) this.applyEffect(c.startEffect, sink, false);
        // 系统认主：上一世认主的系统开局自动绑定
        if (dp.keptSystem && d.companions.get(dp.keptSystem)?.system) this.bindSystem(dp.keptSystem, sink);
        // 道具 + 上一世封存的遗物
        this.gainItem(pick.item, sink);
        for (const id of dp.sealed) this.gainItem(id, sink);
        dp.sealed = [];

        // 天命之子（天胡通道）：命格未配置时不消耗随机数
        const B = d.meta.blessed;
        if (B && this.rng.chance(this.blessedChance())) {
            this.run.blessed = true;
            if (d.blessedStart) this.applyEffect(d.blessedStart, sink, false);
            if (B.chain) this.run.threads!.push({ id: B.chain, at: 2, until: 999 });
            this.run.log.push(`第${this.run.life}世，天降异象：${B.name}。`);
        }

        const R = d.meta.rules;
        this.run.attrs[R.life] = this.run.attrs[R.lifeMax];
        this.run.log.push(`第${this.run.life}世，${map?.startLog ?? R.startLog}`);
        this.startSeason();
    }

    /** 距离下一境界还差什么：只列「属性/境界 >= N」类条件；「或」分支取完成度最高的一支 */
    stageProgress(): StageProgress | undefined {
        const next = this.data.stages.find(s => s.level === this.run.stage + 1);
        if (!next?.cond) return undefined;
        type Part = StageProgress['parts'][number];
        const ratio = (ps: Part[]) => (ps.length ? ps.reduce((n, p) => n + Math.min(1, p.cur / Math.max(1, p.need)), 0) / ps.length : 1);
        const walk = (n: CondNode): Part[] => {
            switch (n.t) {
                case 'and': return [...walk(n.a), ...walk(n.b)];
                case 'or': { const a = walk(n.a), b = walk(n.b); return ratio(a) >= ratio(b) ? a : b; }
                case 'cmp':
                    if ((n.op !== '>=' && n.op !== '>') || n.left.kind !== 'attr') return [];
                    return [{ label: this.data.attrNames[n.left.id!] ?? n.left.id!, cur: this.run.attrs[n.left.id!] ?? 0, need: n.right + (n.op === '>' ? 1 : 0) }];
                default: return [];
            }
        };
        return { name: next.name, parts: walk(next.cond.ast) };
    }

    /** 本世开局成为天命之子的概率（天命/天赋倍率 × 基础 + 命盘加成） */
    blessedChance(): number {
        const B = this.data.meta.blessed;
        if (!B) return 0;
        const add = [...this.data.upgrades.values()].filter(u => u.kind === 'blessed')
            .reduce((n, u) => n + this.upgradeLevel(u.id) * (u.value ?? 0.005), 0);
        return Math.min(1, B.chance * (this.mods().blessedMul ?? 1) + add);
    }

    /** 从中途存档恢复（run 来自 JSON.parse(JSON.stringify(engine.run))） */
    resume(run: RunState): void {
        this.run = run;
        this.rng = new Rng(this.run);
        this.settled = undefined;
        this.doubled = false;
    }

    // ───────────── 方向阶段 ─────────────

    directionOptions(): DirOption[] {
        return this.data.dirs.map(dd => {
            const layers = this.data.layersByDir[dd.id];
            const cur = layers[this.run.pos[dd.id]];
            const next = layers[this.run.pos[dd.id] + 1];
            const enabled = this.check(dd.cond);
            return {
                dir: dd.id,
                name: dd.name,
                enabled,
                lockText: enabled ? undefined : this.describe(dd.cond),
                layerName: cur ? this.layerText(cur).name : '',
                nextLayer: next ? { name: this.layerText(next).name, lockText: this.check(next.cond) ? undefined : this.describe(next.cond) } : undefined,
                thread: ((t?: string) => t && this.fmt(t))(this.dueThread(dd.id)?.teaser),
            };
        });
    }

    chooseDirection(dir: Dir): void {
        this.expectPhase('direction');
        const opt = this.directionOptions().find(o => o.dir === dir);
        if (!opt?.enabled) throw new Error(`方向不可选：${dir}`);
        this.run.dir = dir;
        // 上一件事还没完：优先接着发生（剧情延伸）
        const thread = this.dueThread(dir);
        if (thread) {
            this.run.threads = (this.run.threads ?? []).filter(t => t.id !== thread.id);
            this.enterEvent(thread.id);
            return;
        }
        const layer = this.data.layersByDir[dir][this.run.pos[dir]];
        const ev = this.drawEvent(e => (e.dir === dir || e.dir === 'any') && !e.sudden && (!e.layers || e.layers.includes(layer.id)));
        if (!ev) throw new Error(`没有可抽取的事件：方向 ${dir} 层 ${layer.id}（请补充兜底事件）`);
        this.enterEvent(ev.id);
    }

    usableItems(): string[] {
        return this.run.items.filter(id => this.data.items.get(id)?.useEffect);
    }

    useItem(id: string): StepResult {
        this.expectPhase('direction');
        const def = this.data.items.get(id);
        if (!def?.useEffect || !this.run.items.includes(id)) throw new Error(`无法使用道具：${id}`);
        const step = this.newStep();
        if (def.consumable !== false) this.loseItem(id, step);
        this.applyEffect(def.useEffect, step);
        step.text = def.useText ?? `你使用了${def.name}。`;
        this.checkVitals(step);
        return step;
    }

    // ───────────── 事件阶段 ─────────────

    eventView(): EventView {
        this.expectPhase('event');
        const ev = this.currentEvent();
        const choices: ChoiceView[] = [];
        ev.choices.forEach((c, index) => {
            if (c.showIf && !this.check(c.showIf)) return;
            let enabled = this.check(c.require);
            const view: ChoiceView = { index, text: c.text, enabled };
            if (!enabled) view.lockText = this.describe(c.require);
            else if (c.useSkill) {
                view.tag = `技能·${this.skillName(c.useSkill)}`;
                const left = this.cdLeft(c.useSkill);
                if (!this.run.skills.includes(c.useSkill)) { enabled = false; view.lockText = `需要技能·${this.skillName(c.useSkill)}`; }
                else if (left > 0) { enabled = false; view.lockText = `技能冷却中（还需${left}季）`; }
                view.enabled = enabled;
            } else if (c.require) view.tag = this.specialTag(c.require) ?? this.specialTag(c.showIf);
            else if (c.showIf) view.tag = this.specialTag(c.showIf);
            const mem = this.dp.memory[`${ev.id}#${index}`];
            if (mem && mem.life < this.run.life) {
                // 同一个坑死过 2 次起，标注越来越嫌弃
                view.memory = (mem.dead ?? 0) >= 2 ? `前世：死过${mem.dead}次·${memorySnark(mem.dead!)}` : `前世：${mem.text}`;
            }
            if (enabled && this.isSure(c)) view.sure = true;
            if (c.absurd) view.absurd = true;
            if (this.run.revealAll || this.run.hint === index) view.preview = this.previewChoice(c);
            view.text = this.fmt(view.text);
            choices.push(view);
        });
        return { id: ev.id, text: this.fmt(ev.text), gold: ev.gold, sudden: ev.sudden, cameo: ev.cameo, cross: ev.cross, choices };
    }

    /** 广告「窥探天命」：预览当前事件所有选项 */
    revealAll(): void {
        this.expectPhase('event');
        this.run.revealAll = true;
    }

    choose(index: number): StepResult {
        this.expectPhase('event');
        const ev = this.currentEvent();
        const c = ev.choices[index];
        if (!c) throw new Error(`选项不存在：${ev.id}#${index}`);
        if (c.showIf && !this.check(c.showIf)) throw new Error(`选项不可见：${ev.id}#${index}`);
        if (!this.check(c.require)) throw new Error(`选项未满足条件：${ev.id}#${index}`);
        if (c.useSkill && (!this.run.skills.includes(c.useSkill) || this.cdLeft(c.useSkill) > 0)) {
            throw new Error(`技能不可用：${c.useSkill}`);
        }

        this.recordMissed(ev, index);
        const r = this.run;
        const step = this.newStep();
        if (c.useSkill) this.startCooldown(c.useSkill);
        const key = `${ev.id}#${index}`;
        const prev = this.dp.memory[key];
        let out: Outcome = c.success;
        let easy: string | undefined;
        r.reckless = false;
        if (c.chance !== undefined && c.fail) {
            // 成功率溢出到 100%：必成（碾压），不再掷骰
            const sure = this.isSure(c);
            // 新手手气：本命格第 1 世的第一次冒险必成且大成功（早早给一个爽点）
            const luck = r.life === 1 && !r.luck && !sure;
            if (luck) r.luck = true;
            step.success = sure || luck || this.rng.chance(this.chanceOf(c));
            if (!step.success) {
                out = c.fail;
                r.reckless = this.chanceOf(c) < RECKLESS_CHANCE;
                if ((r.streak ?? 0) >= STREAK_MIN) step.messages.push(fill(STREAK_BREAK, { n: r.streak! }));
                r.streak = 0;
            } else {
                if (luck) step.messages.push('【新手手气】第一次冒险，天道没看住你。');
                if (Object.keys(c.success.effect.attrs).length && (luck || this.rng.chance(CRIT_CHANCE))) step.crit = true;
                if (sure) {
                    easy = c.easy;
                    const dead = prev && prev.life < r.life ? prev.dead ?? 0 : 0;
                    if (dead) {
                        step.messages.push(`【碾压】前世你在这里死过 ${dead} 次。这一世，连眼皮都没抬。`);
                        this.hype(step, 'crush');
                    }
                }
                this.addStreak(step);
            }
        }
        if (ev.cameo) this.hype(step, 'cameo');
        // 前世记忆：记录结果（害死过你的次数累加）
        const deathId = out.effect.death;
        const memText = deathId ? `你在这里${this.data.deaths.get(deathId)?.name ?? '死了'}` : out.result ?? c.text;
        const dead = (prev?.dead ?? 0) + (deathId ? 1 : 0);
        this.dp.memory[key] = { life: r.life, text: clip(this.fmt(memText), MEMORY_TEXT_MAX), ...(dead ? { dead } : {}) };

        return this.resolve(easy ? { ...out, result: easy } : out, step);
    }

    /** 成功率（未封顶）溢出到 100% 的有风险选项 */
    private isSure(c: Choice): boolean {
        return c.chance !== undefined && !!c.fail && this.rawChance(c) >= 1;
    }

    /** 连胜：达到 STREAK_MIN 起每次额外给成长值 */
    private addStreak(step: StepResult): void {
        const r = this.run;
        r.streak = (r.streak ?? 0) + 1;
        if (r.streak < STREAK_MIN) return;
        const bonus = Math.min(r.streak, STREAK_BONUS_MAX);
        const g = this.data.meta.rules.growth;
        this.addAttr(g, bonus, step);
        step.messages.push(`【势如破竹·${r.streak}连】${this.attrName(g)} +${bonus}`);
        if (r.streak === STREAK_MIN || r.streak % 5 === 0) this.hype(step, 'streak');
    }

    /** 标记高光时刻（只保留优先级最高的一个） */
    private hype(step: StepResult, h: Hype): void {
        if (!step.hype || HYPE_ORDER.indexOf(h) < HYPE_ORDER.indexOf(step.hype)) step.hype = h;
    }

    /** 文本占位：{died:死法id} = 累计死于该死法的次数，{life} = 第几世 */
    fmt(s: string): string {
        if (!s.includes('{')) return s;
        return s.replace(/\{died:(\w+)\}/g, (_m, id: string) => String(this.dp.deathCount?.[id] ?? 0))
            .replace(/\{life\}/g, String(this.run?.life ?? this.dp.lives + 1));
    }

    /** 开局天道（只在特定世数说话） */
    startRemark(): string | undefined {
        const t = TIANDAO_START[this.run.life];
        return t ? fill(t, { name: this.data.meta.name }) : undefined;
    }

    /** 弹幕池（{name} 已替换） */
    danmaku(h: Hype): string[] {
        return DANMAKU[h].map(s => fill(s, { name: this.data.meta.name }));
    }

    /** 结算一个事件结果并推进：链式事件 → 方向层推进 → 待触发事件 → 季末 */
    private resolve(out: Outcome, step: StepResult): StepResult {
        this.applyEffect(out.effect, step);
        if (step.crit) {
            // 大成功：正向属性收益再结算一次
            const bonus: Record<string, number> = {};
            for (const [k, v] of Object.entries(out.effect.attrs)) if (v > 0) bonus[k] = v;
            this.applyEffect({ ...EMPTY_EFFECT, attrs: bonus }, step);
            step.messages.unshift('【大成功】收益翻倍！');
            this.hype(step, 'crit');
        }
        step.text = out.result && this.fmt(out.result);
        this.run.revealAll = false;
        this.run.hint = undefined;
        this.run.boost = 0;

        if (out.effect.ending) { this.finish('ending', out.effect.ending, step); return step; }
        if (out.effect.death) { this.die(out.effect.death, step); if (this.phase() === 'dying') return step; }
        this.checkVitals(step);
        if (this.phase() !== 'event') return step;

        if (out.next) { this.enterEvent(out.next); return step; }
        if (this.run.dir) { const d = this.run.dir; this.run.dir = undefined; this.advance(d, step); }
        if (this.run.pending.length) { this.enterEvent(this.run.pending.shift()!); return step; }
        this.endSeason(step);
        return step;
    }

    // ───────────── 技能 ─────────────

    skillName(id: string): string { return this.data.skills.get(id)?.name ?? id; }

    skillViews(): SkillView[] {
        const phase = this.run.phase;
        return this.run.skills.map(id => {
            const s = this.data.skills.get(id)!;
            const cdLeft = this.cdLeft(id);
            let usable = cdLeft === 0 && s.use === phase;
            if (usable && phase === 'event' && s.skip && this.currentEvent().chainOnly) usable = false;
            return { id, name: s.name, desc: s.desc, use: s.use, cdLeft, usable };
        });
    }

    /** 主动使用技能（方向阶段或事件中，取决于技能的 use） */
    useSkill(id: string): StepResult {
        const s = this.data.skills.get(id);
        const view = this.skillViews().find(v => v.id === id);
        if (!s || !view?.usable) throw new Error(`技能当前不可用：${id}`);
        const step = this.newStep();
        this.startCooldown(id);
        step.text = s.useText ?? `你施展了${s.name}。`;
        if (s.useEffect) this.applyEffect(s.useEffect, step);
        if (s.boost) this.run.boost += s.boost;
        if (s.reveal) this.run.revealAll = true;
        if (this.phase() === 'event' && s.skip) return this.resolve({ effect: EMPTY_EFFECT, result: step.text }, step);
        this.checkVitals(step);
        return step;
    }

    /** 记录本事件中可见但被条件锁住的选项，作为「下一世的目标」 */
    private recordMissed(ev: GameEvent, chosen: number): void {
        const r = this.run;
        ev.choices.forEach((c, i) => {
            if (i === chosen || !c.require || this.check(c.require)) return;
            if (c.showIf && !this.check(c.showIf)) return;
            if (this.describe(c.require).includes('？？？')) return; // 隐藏条件不剧透
            const key = `${ev.id}#${i}`;
            r.missed = r.missed.filter(m => m !== key);
            r.missed.push(key);
            if (r.missed.length > 20) r.missed.shift();
        });
    }

    /** 结算时重新判定：属性类已满足的丢弃；依赖传承/技能且现已满足的标记 ready（下一世可选） */
    private buildGoals(): SettleResult['goals'] {
        const goals: SettleResult['goals'] = [];
        for (const key of [...this.run.missed].reverse()) {
            const [evId, idx] = key.split('#');
            const c = this.data.events.get(evId)?.choices[Number(idx)];
            if (!c?.require) continue;
            let meta = false;
            walkCond(c.require.ast, leaf => {
                if ((leaf.t === 'cmp' && leaf.left.kind === 'legacy') || (leaf.t === 'has' && (leaf.kind === 'skill' || leaf.kind === 'dead'))) meta = true;
            });
            const ok = this.check(c.require);
            if (ok && !meta) continue;
            goals.push({ text: c.text, lock: this.describe(c.require), ready: ok });
        }
        goals.sort((a, b) => Number(b.ready) - Number(a.ready));
        return goals.slice(0, 3);
    }

    private cdLeft(id: string): number {
        return Math.max(0, (this.run.cd[id] ?? 0) - this.run.season);
    }

    private startCooldown(id: string): void {
        const s = this.data.skills.get(id);
        if (s) this.run.cd[id] = this.run.season + s.cd;
    }

    /** 领悟技能：永久解锁，本局立即可用 */
    private grantSkill(id: string, step: StepResult): void {
        const s = this.data.skills.get(id);
        if (!s) return;
        const isNew = addUnique(this.dp.skills, id);
        if (isNew) addUnique(this.run.learned, id);
        const added = addUnique(this.run.skills, id);
        if (isNew || added) {
            step.skills.push(id);
            step.messages.push(`【${isNew ? '领悟技能' : '想起技能'}·${s.name}】${s.desc}`);
        }
    }

    // ───────────── 死亡 / 结算 ─────────────

    canReviveByAd(): boolean {
        return this.run.phase === 'dying' && !this.run.reviveUsed.ad;
    }

    reviveByAd(): StepResult {
        this.expectPhase('dying');
        if (this.run.reviveUsed.ad) throw new Error('本局已使用过逆天改命');
        this.run.reviveUsed.ad = true;
        const step = this.newStep();
        const lines = TIANDAO_REVIVE[tiandaoTier(this.run.life)];
        this.revive(step, lines[this.rng.int(lines.length)]);
        this.hype(step, 'revive');
        // 命盘·续命：放大广告复活的收益
        for (const u of this.data.upgrades.values()) {
            if (u.kind !== 'reviveBoost' || !this.upgradeLevel(u.id)) continue;
            const R = this.data.meta.rules;
            this.addAttr(R.life, this.run.attrs[R.lifeMax] - this.run.attrs[R.life], step);
            if (u.startEffect) this.applyEffect(u.startEffect, step, false);
            step.messages.push(`【命盘·${u.name}】${u.desc}`);
        }
        return step;
    }

    /** 死亡/结局后结算：写入传承、图鉴、轮回点。重复调用返回同一结果。 */
    settle(): SettleResult {
        if (this.settled) return this.settled;
        if (this.run.phase === 'dying') this.run.over = { kind: 'death', id: this.run.dying! };
        if (!this.run.over) throw new Error('本局尚未结束');
        this.run.phase = 'over';
        const { kind, id } = this.run.over;
        const d = this.data;
        const dp = this.dp;
        const mods = this.mods();

        let title: string, epitaph: string, legacy: SettleResult['legacy'], firstTime: boolean, skill: SettleResult['skill'];
        if (kind === 'death') {
            const def = d.deaths.get(id)!;
            title = def.name;
            const count = dp.deathCount ?? (dp.deathCount = {});
            count[id] = (count[id] ?? 0) + 1;
            dp.deathRun = dp.deathRun?.id === id ? { id, n: dp.deathRun.n + 1 } : { id, n: 1 };
            const quip = this.epitaphQuip(id);
            epitaph = `享年${this.run.season}季，${def.epitaph}${quip ? `——${quip}` : ''}`;
            firstTime = addUnique(dp.codex.deaths, id);
            if (def.legacy) {
                const ld = d.legacies.get(def.legacy)!;
                const before = dp.legacy[ld.id] ?? 0;
                const level = Math.min(ld.max, before + 1);
                dp.legacy[ld.id] = level;
                legacy = { id: ld.id, name: ld.name, level, max: ld.max, isNew: level > before };
            }
            // 死亡领悟技能（在传承结算之后判定，可依赖传承等级）
            for (const sc of def.skillConds) {
                if (dp.skills.includes(sc.id) || !this.check(sc.cond) || !this.rng.chance(sc.chance)) continue;
                const s = d.skills.get(sc.id)!;
                dp.skills.push(sc.id);
                addUnique(this.run.learned, sc.id);
                skill = { id: s.id, name: s.name, desc: s.desc };
                break;
            }
        } else {
            const def = d.endings.get(id)!;
            title = def.name;
            epitaph = def.epitaph;
            firstTime = addUnique(dp.codex.endings, id);
            dp.deathRun = undefined;
        }
        for (const it of this.run.found) addUnique(dp.codex.items, it);
        for (const ev of this.run.seen) addUnique(dp.codex.events, ev);

        const r = this.run;
        const posSum = r.maxPos.up + r.maxPos.down + r.maxPos.side;
        const breakdown: SettleResult['breakdown'] = [
            { label: `存活 ${r.season} 季`, value: r.season },
            { label: `探索 ${posSum} 层`, value: posSum * 3 },
            { label: `境界·${this.stageName(r.stage)}`, value: r.stage * 8 },
            { label: `发现 ${r.found.length} 件道具`, value: r.found.length * 2 },
        ];
        if (firstTime) breakdown.push({ label: kind === 'ending' ? '首次达成结局' : '首次解锁死法', value: 10 });
        if (kind === 'ending') breakdown.push({ label: '达成结局', value: 50 });
        const tianhu = kind === 'ending' && (!!this.run.blessed || this.run.flags.includes('tianhu'));
        if (tianhu) {
            breakdown.push({ label: '天胡', value: 100 });
            dp.codex.tianhu = (dp.codex.tianhu ?? 0) + 1;
        }
        let points = breakdown.reduce((n, b) => n + b.value, 0);
        const bonus = (label: string, mul: number) => {
            if (mul === 1) return;
            const extra = Math.round(points * mul) - points;
            breakdown.push({ label, value: extra });
            points += extra;
        };
        const mul = mods.pointsMul ?? 1;
        bonus(`倍率 ×${mul}`, mul);
        const fortune = this.upgradeValue('pointsBonus');
        if (fortune) bonus(`命盘加成 +${Math.round(fortune * 100)}%`, 1 + fortune);
        if (this.run.firstOfDay) bonus(`今日首世 +${Math.round(DAILY_FIRST_BONUS * 100)}%`, 1 + DAILY_FIRST_BONUS);
        if (this.run.spin) bonus(`随缘投胎 +${Math.round(SPIN_BONUS * 100)}%`, 1 + SPIN_BONUS);

        dp.lives += 1;
        dp.bestStage = Math.max(dp.bestStage, this.run.stage);
        this.profile.lives += 1;
        this.profile.points += points;

        this.settled = {
            kind, id, title, epitaph,
            life: this.run.life,
            seasons: this.run.season,
            stage: this.run.stage,
            stageName: this.stageName(this.run.stage),
            legacy,
            points,
            tianhu,
            relicCandidates: [...new Set(this.run.found)],
            relicSlots: 1 + (mods.relicSlots ?? 0) + this.upgradeValue('relicSlot'),
            firstTime,
            skill,
            breakdown,
            explore: this.data.dirs.map(dd => ({
                dir: dd.id,
                name: dd.name,
                layer: this.layerName(dd.id, r.maxPos[dd.id]),
            })),
            attrs: d.meta.attrs.filter(a => !a.hidden).map(a => ({ id: a.id, name: a.name, icon: a.icon, value: r.attrs[a.id] ?? 0 })),
            learned: r.learned.map(id => ({ id, name: this.skillName(id) })),
            codex: {
                deaths: [dp.codex.deaths.length, d.deaths.size],
                skills: [dp.skills.length, d.skills.size],
                items: [dp.codex.items.length, d.items.size],
                endings: [dp.codex.endings.length, d.endings.size],
                events: [dp.codex.events.length, d.events.size],
            },
            goals: this.buildGoals(),
            log: [...r.log],
            feuds: [...(r.feuds ?? [])],
            remark: tianhu ? TIANDAO_TIANHU : this.pickLine(TIANDAO_SETTLE[kind][tiandaoTier(r.life)]),
        };
        return this.settled;
    }

    private pickLine(list: string[]): string {
        return list[this.rng.int(list.length)];
    }

    /** 墓志铭后缀：按死的方式吐槽一句（结算时 deathCount / deathRun 已计入本次） */
    private epitaphQuip(id: string): string | undefined {
        const r = this.run;
        const dp = this.dp;
        const run = dp.deathRun?.id === id ? dp.deathRun.n : 0;
        if (run >= 3) return `连续第${run}世了，下次一定行`;
        if (r.reckless && id !== this.data.meta.rules.oldAgeDeath) return '死于过度自信';
        if (r.season <= 2 && id !== this.data.meta.rules.oldAgeDeath) return '主打一个速通';
        const pg = this.stageProgress();
        if (pg && pg.parts.length && pg.parts.reduce((n, p) => n + Math.min(1, p.cur / Math.max(1, p.need)), 0) / pg.parts.length >= 0.8) {
            return `离「${pg.name}」只差一口气`;
        }
        const n = dp.deathCount?.[id] ?? 0;
        if (n >= 5) return `老熟人了，第${n}回`;
        return undefined;
    }

    /** 广告「双倍轮回点」 */
    doublePoints(): number {
        const s = this.settle();
        if (this.doubled) return s.points;
        this.doubled = true;
        this.profile.points += s.points;
        s.points *= 2;
        return s.points;
    }

    sealRelics(ids: string[], extraSlots = 0): void {
        const s = this.settle();
        const valid = ids.filter(id => s.relicCandidates.includes(id)).slice(0, s.relicSlots + extraSlots);
        this.dp.sealed = valid;
    }

    // ───────────── 命盘（局外升级） ─────────────

    upgradeLevel(id: string): number {
        const def = this.data.upgrades.get(id);
        return def ? Math.min(this.dp.upgrades[id] ?? 0, def.costs.length) : 0;
    }

    /** 某类命盘的总值：pointsBonus 为 等级 × value，其余为等级之和 */
    upgradeValue(kind: UpgradeKind): number {
        let v = 0;
        for (const u of this.data.upgrades.values()) {
            if (u.kind === kind) v += this.upgradeLevel(u.id) * (kind === 'pointsBonus' ? u.value ?? 0.1 : 1);
        }
        return v;
    }

    upgradeViews(): UpgradeView[] {
        return [...this.data.upgrades.values()].map(u => {
            const level = this.upgradeLevel(u.id);
            const cost = u.costs[level];
            return { id: u.id, name: u.name, desc: u.desc, level, max: u.costs.length, cost, affordable: cost !== undefined && this.profile.points >= cost };
        });
    }

    buyUpgrade(id: string): void {
        const v = this.upgradeViews().find(x => x.id === id);
        if (!v) throw new Error(`命盘不存在：${id}`);
        if (v.cost === undefined) throw new Error(`命盘已满级：${id}`);
        if (!v.affordable) throw new Error(`轮回点不足：${id}`);
        this.profile.points -= v.cost;
        this.dp.upgrades[id] = v.level + 1;
    }

    /** 开局池每组张数 */
    draftSize(): number { return 3 + this.upgradeValue('draftSize'); }

    /** 每次开局可免费「天机重演」的次数 */
    freeRerolls(): number { return this.upgradeValue('reroll'); }

    // ───────────── 每日天命 ─────────────

    /** 取今日天命（date = 本地日期 YYYY-MM-DD）；跨天时按日期确定性抽取（同一天所有玩家相同） */
    todayFate(date: string): string | undefined {
        const fates = [...this.data.fates.keys()];
        if (!fates.length) return undefined;
        const dp = this.dp;
        if (dp.daily?.date !== date) {
            dp.daily = { date, fate: fates[hashStr(`${date}|${this.data.meta.id}`) % fates.length], first: true, swapped: false };
        }
        return dp.daily.fate;
    }

    canSwapFate(): boolean {
        return !!this.dp.daily && !this.dp.daily.swapped && this.data.fates.size > 1;
    }

    /** 广告「换一个天命」：每天一次，换成另一个随机天命 */
    swapFate(seed: number): string {
        const daily = this.dp.daily;
        if (!daily || !this.canSwapFate()) throw new Error('今日已换过天命');
        const others = [...this.data.fates.keys()].filter(id => id !== daily.fate);
        daily.fate = others[new Rng({ rng: seed }).int(others.length)];
        daily.swapped = true;
        return daily.fate;
    }

    // ───────────── 查询 ─────────────

    /** 图鉴墙：本命格的结局 / 死法 / 跨命格彩蛋 / 恩怨（含未收集的） */
    codexView(): CodexView {
        const d = this.data;
        const c = this.dp.codex;
        const seen = new Set([...c.events, ...(this.run?.seen ?? [])]);
        const cameos: CodexView['cameos'] = [];
        const feuds = new Set<string>();
        for (const ev of d.events.values()) {
            for (const ch of ev.choices) for (const o of [ch.success, ch.fail]) for (const f of o?.effect.feuds ?? []) feuds.add(f);
            if (!ev.cameo) continue;
            const hint = new Set<string>();
            if (ev.require) walkCond(ev.require.ast, l => {
                if (l.t === 'has' && l.kind === 'xend') hint.add(l.id.split('/')[0]);
                if (l.t === 'cmp' && (l.left.kind === 'xstage' || l.left.kind === 'xlives')) hint.add(l.left.id!);
            });
            cameos.push({ id: ev.id, text: ev.text, got: seen.has(ev.id), hint: [...hint] });
        }
        const got = new Set(c.feuds ?? []);
        return {
            endings: [...d.endings.values()].map(e => ({ id: e.id, name: e.name, epitaph: e.epitaph, got: c.endings.includes(e.id) })),
            deaths: [...d.deaths.values()].map(x => ({
                id: x.id, name: x.name, epitaph: x.epitaph, got: c.deaths.includes(x.id),
                count: this.dp.deathCount?.[x.id] ?? 0, legacy: x.legacy ? d.legacies.get(x.legacy)?.name : undefined,
            })),
            cameos,
            feuds: [...feuds].map(text => ({ text, got: got.has(text) })).sort((a, b) => Number(b.got) - Number(a.got)),
            tianhu: c.tianhu ?? 0,
        };
    }

    attrName(id: string): string { return this.data.attrNames[id] ?? id; }
    stageName(level: number): string { return this.data.stages.find(s => s.level === level)?.name ?? `境界${level}`; }
    itemName(id: string): string { return this.data.items.get(id)?.name ?? id; }

    /** 本世出生地图 */
    mapDef() {
        return this.run?.map ? this.data.maps.get(this.run.map) : undefined;
    }

    /** 层的显示文字（出生地图可覆盖名字与旁白） */
    layerText(layer: { id: string; name: string; enterText: string; blockedText: string }) {
        const o = this.mapDef()?.layers?.[layer.id];
        return { name: o?.name ?? layer.name, enterText: o?.enterText ?? layer.enterText, blockedText: o?.blockedText ?? layer.blockedText };
    }

    /** 某方向第 index 层的显示名 */
    layerName(dir: Dir, index: number): string {
        const l = this.data.layersByDir[dir][index];
        return l ? this.layerText(l).name : '';
    }

    mods(): Mods {
        const list: (Mods | undefined)[] = [
            this.mapDef()?.mods,
            this.run.fate ? this.data.fates.get(this.run.fate)?.mods : undefined,
            ...this.run.talents.map(id => this.data.talents.get(id)?.mods),
            ...this.run.items.map(id => this.data.items.get(id)?.mods),
            ...this.run.companions.map(id => this.data.companions.get(id)?.mods),
        ];
        const m: Mods = {};
        for (const x of list) {
            if (!x) continue;
            if (x.waterCostEvery) m.waterCostEvery = Math.max(m.waterCostEvery ?? 1, x.waterCostEvery);
            if (x.qiMul) m.qiMul = (m.qiMul ?? 1) * x.qiMul;
            if (x.pointsMul) m.pointsMul = (m.pointsMul ?? 1) * x.pointsMul;
            if (x.suddenMul) m.suddenMul = (m.suddenMul ?? 1) * x.suddenMul;
            if (x.goldMul) m.goldMul = (m.goldMul ?? 1) * x.goldMul;
            if (x.blessedMul) m.blessedMul = (m.blessedMul ?? 1) * x.blessedMul;
            if (x.hintChance) m.hintChance = Math.max(m.hintChance ?? 0, x.hintChance);
            if (x.relicSlots) m.relicSlots = (m.relicSlots ?? 0) + x.relicSlots;
            if (x.reviveOnce) m.reviveOnce = true;
            if (x.previewDirs) m.previewDirs = true;
        }
        return m;
    }

    // ───────────── 内部：季节流程 ─────────────

    private startSeason(): void {
        this.run.season += 1;
        this.run.phase = 'direction';
        if (this.run.lastStand === 'due') {
            this.run.lastStand = 'used';
            this.enterEvent(this.data.meta.rules.lastStand!);
            return;
        }
        const chance = this.data.meta.settings.suddenChance * (this.mods().suddenMul ?? 1);
        if (this.run.season > 1 && this.rng.chance(chance)) {
            const ev = this.drawEvent(e => e.sudden);
            if (ev) this.enterEvent(ev.id);
        }
    }

    private endSeason(step: StepResult): void {
        const r = this.run;
        const m = this.mods();
        const R = this.data.meta.rules;

        const cost = r.season % (m.waterCostEvery ?? 1) === 0 ? 1 : 0;
        const regen = Math.floor((r.attrs[R.regen.from] ?? 0) / R.regen.per);
        this.addAttr(R.life, regen - cost, step);
        if (r.stage >= (R.yield.minStage ?? 1)) {
            const gain = R.yield.base + Math.floor((r.attrs[R.yield.from] ?? 0) / R.yield.per);
            this.addAttr(R.growth, gain, step);
        }
        for (const id of r.companions) {
            const c = this.data.companions.get(id);
            if (c?.every && c.everyEffect && r.season % c.every.n === 0) {
                step.messages.push(c.every.text);
                this.applyEffect(c.everyEffect, step);
            }
        }
        this.checkVitals(step);
        if (r.phase !== 'event' && r.phase !== 'direction') return;

        // 境界突破（可连续）
        for (;;) {
            const next = this.data.stages.find(s => s.level === r.stage + 1);
            if (!next || !this.check(next.cond)) break;
            if (this.breakthrough(step)) return;
        }
        // 寿元（天命之子加倍）
        const stage = this.data.stages.find(s => s.level === r.stage);
        const lifespan = stage ? stage.lifespan * (r.blessed ? this.data.meta.blessed?.lifespanMul ?? 1 : 1) : Infinity;
        const lastStand = this.data.meta.rules.lastStand;
        if (r.season >= lifespan && lastStand && !r.lastStand && this.data.events.has(lastStand)
            && this.data.stages.some(s => s.level === r.stage + 1)) {
            // 寿元将尽：给一次最后一搏（下季开头触发）
            r.lastStand = 'due';
            step.messages.push('寿元将尽……还有最后一次机会。');
        } else if (r.season >= lifespan) { this.die(R.oldAgeDeath, step); if (this.phase() === 'dying' || this.phase() === 'over') return; }
        this.startSeason();
    }

    private advance(dir: Dir, step: StepResult): void {
        const r = this.run;
        const layers = this.data.layersByDir[dir];
        r.push[dir] += 1;
        const cur = layers[r.pos[dir]];
        const next = layers[r.pos[dir] + 1];
        if (!next || r.push[dir] < cur.span) return;
        if (this.check(next.cond)) {
            r.pos[dir] += 1;
            r.push[dir] = 0;
            r.maxPos[dir] = Math.max(r.maxPos[dir], r.pos[dir]);
            const t = this.layerText(next);
            if (t.enterText) step.messages.push(t.enterText);
            r.log.push(`第${r.season}季，抵达${t.name}。`);
            if (next.enterEvent) r.pending.push(next.enterEvent);
        } else {
            step.messages.push(`${this.layerText(next).blockedText}（需要：${this.describe(next.cond)}）`);
        }
    }

    /** 本季在该方向上可以触发的后续剧情（方向匹配或 any、条件满足、已到期未过期） */
    private dueThread(dir: Dir): GameEvent | undefined {
        const r = this.run;
        for (const t of r.threads ?? []) {
            if (t.at > r.season || t.until < r.season) continue;
            const ev = this.data.events.get(t.id);
            if (!ev || (ev.dir !== dir && ev.dir !== 'any') || !this.check(ev.require)) continue;
            // 限定了层的后续（如水箱里的事）：所选方向的当前层必须在其中
            if (ev.layers && !ev.layers.includes(this.data.layersByDir[dir][r.pos[dir]]?.id)) continue;
            return ev;
        }
        return undefined;
    }

    /** 待续剧情的预告（选方向界面展示；只列已到期的） */
    threadTeasers(): { dir: Dir | 'any'; text: string }[] {
        const r = this.run;
        return (r.threads ?? [])
            .filter(t => t.at <= r.season && t.until >= r.season)
            .map(t => this.data.events.get(t.id))
            .filter((ev): ev is GameEvent => !!ev && !!ev.teaser && this.check(ev.require) &&
                (!ev.layers || (['up', 'down', 'side'] as Dir[]).some(d => ev.layers!.includes(this.data.layersByDir[d][r.pos[d]]?.id))))
            .map(ev => ({ dir: ev.dir, text: this.fmt(ev.teaser!) }));
    }

    private drawEvent(filter: (e: GameEvent) => boolean): GameEvent | undefined {
        const r = this.run;
        const goldMul = this.mods().goldMul ?? 1;
        const cands = [...this.data.events.values()].filter(e =>
            !e.chainOnly && filter(e) &&
            (!e.maps || (!!r.map && e.maps.includes(r.map))) &&
            r.stage >= e.stage[0] && r.stage <= e.stage[1] &&
            !(e.once && r.seen.includes(e.id)) &&
            e.id !== r.lastEvent &&
            this.check(e.require),
        );
        // 同一世已经遇到过的事件降权，减少重复
        return this.rng.weighted(cands, e => e.weight * (e.gold ? goldMul : 1) * (r.seen.includes(e.id) ? REPEAT_WEIGHT : 1));
    }

    private enterEvent(id: string): void {
        const ev = this.data.events.get(id);
        if (!ev) throw new Error(`事件不存在：${id}`);
        const r = this.run;
        r.event = id;
        r.lastEvent = id;
        r.phase = 'event';
        addUnique(r.seen, id);
        // 进入线路的任意事件 = 这条线这一世开始了
        if (ev.line) {
            const lines = r.lines ?? (r.lines = {});
            if (!(ev.line in lines)) lines[ev.line] = '';
            addUnique(this.ever, ev.line);
        }
        r.hint = undefined;
        const hc = this.mods().hintChance ?? 0;
        if (hc > 0 && this.rng.chance(hc)) {
            const visible = ev.choices.map((c, i) => ({ c, i })).filter(x => !x.c.showIf || this.check(x.c.showIf));
            if (visible.length) r.hint = visible[this.rng.int(visible.length)].i;
        }
    }

    private currentEvent(): GameEvent {
        return this.data.events.get(this.run.event!)!;
    }

    // ───────────── 内部：生死 ─────────────

    private checkVitals(step: StepResult): void {
        const R = this.data.meta.rules;
        if ((this.run.attrs[R.life] ?? 0) <= 0 && this.run.phase !== 'dying' && this.run.phase !== 'over') this.die(R.lifeDeath, step);
    }

    private die(deathId: string, step: StepResult): void {
        const r = this.run;
        const def = this.data.deaths.get(deathId);
        // 寿终结局：寿元到头时满足条件，判为结局（如「平凡一生」）
        if (deathId === this.data.meta.rules.oldAgeDeath) {
            const stage = this.data.stages.find(s => s.level === r.stage);
            const end = stage?.oldAgeEndingConds?.find(e => this.check(e.cond));
            if (end) { this.finish('ending', end.id, step); return; }
        }
        // 护身道具
        const guard = r.items.find(id => this.data.items.get(id)?.saveFromDeath);
        if (guard) {
            this.loseItem(guard, step);
            this.revive(step, `${this.itemName(guard)}碎了。它替你挡下了「${def?.name ?? deathId}」。`, false);
            return;
        }
        // 新手保护：本命格第 1 世的前几季命不该绝
        const newbie = this.data.meta.settings.newbieSeasons ?? 0;
        if (r.life === 1 && r.season <= newbie && deathId !== this.data.meta.rules.oldAgeDeath) {
            this.revive(step, `命不该绝：这是你的第一世，天道替你挡下了「${def?.name ?? deathId}」。（前 ${newbie} 季有效）`, false);
            return;
        }
        if (this.mods().reviveOnce && !r.reviveUsed.talent) {
            r.reviveUsed.talent = true;
            this.revive(step, this.data.meta.rules.reviveOnceText ?? '你倒下了，又挣扎着活了过来。', false);
            return;
        }
        r.dying = deathId;
        r.phase = 'dying';
        r.dir = undefined;
        r.pending = [];
        r.log.push(`第${r.season}季，${def?.name ?? deathId}。`);
    }

    private revive(step: StepResult, text: string, fromDying = true): void {
        const r = this.run;
        step.messages.push(text);
        step.revived = true;
        const R = this.data.meta.rules;
        r.attrs[R.life] = Math.max(r.attrs[R.life], Math.ceil(r.attrs[R.lifeMax] / 2));
        if (fromDying) {
            r.log.push(`第${r.season}季，逆天改命，又活了过来。`);
            r.dying = undefined;
            r.phase = 'direction';
            this.startSeason();
        }
        // 非 dying 状态下的复活（护身道具/不死草）：保持当前流程继续
    }

    private finish(kind: 'death' | 'ending', id: string, step: StepResult): void {
        const r = this.run;
        r.over = { kind, id };
        r.phase = 'over';
        r.dir = undefined;
        r.pending = [];
        if (kind === 'ending') {
            const def = this.data.endings.get(id);
            step.messages.push(`【结局·${def?.name ?? id}】`);
            this.hype(step, r.blessed || r.flags.includes('tianhu') ? 'tianhu' : 'ending');
            r.log.push(`结局：${def?.name ?? id}。`);
        }
    }

    // ───────────── 内部：效果 ─────────────

    private newStep(): StepResult {
        return { deltas: {}, gained: [], lost: [], messages: [], skills: [] };
    }

    /** 突破到下一境界（不检查条件）；达成结局时返回 true */
    private breakthrough(step: StepResult): boolean {
        const r = this.run;
        const next = this.data.stages.find(s => s.level === r.stage + 1);
        if (!next) return false;
        r.stage = next.level;
        step.messages.push(`【突破·${next.name}】${next.narration}`);
        if (this.rng.chance(TIANDAO_BREAK_CHANCE)) step.messages.push(tiandao(this.pickLine(TIANDAO_BREAK[tiandaoTier(r.life)])));
        this.hype(step, 'breakthrough');
        r.log.push(`第${r.season}季，突破为${next.name}。`);
        if (next.bonusEffect) this.applyEffect(next.bonusEffect, step);
        if (next.skillPool?.length) {
            // 突破领悟：优先从未解锁过的技能里抽，其次本局未携带的
            const pool = next.skillPool.filter(id => !this.dp.skills.includes(id));
            const pool2 = pool.length ? pool : next.skillPool.filter(id => !r.skills.includes(id));
            if (pool2.length) this.grantSkill(pool2[this.rng.int(pool2.length)], step);
        }
        const ending = next.endingConds?.find(e => this.check(e.cond));
        if (ending) { this.finish('ending', ending.id, step); return true; }
        return false;
    }

    private applyEffect(e: Effect, step: StepResult, mulQi = true): void {
        const r = this.run;
        for (const [id, v] of Object.entries(e.attrs)) {
            const amount = id === this.data.meta.rules.growth && v > 0 && mulQi ? Math.round(v * (this.mods().qiMul ?? 1)) : v;
            this.addAttr(id, amount, step);
        }
        for (const f of e.flags) addUnique(r.flags, f);
        for (const f of e.unflags) r.flags = r.flags.filter(x => x !== f);
        for (const it of e.items) this.gainItem(it, step);
        for (const it of e.loseItems) this.loseItem(it, step);
        for (const sk of e.skills) this.grantSkill(sk, step);
        for (const st of e.states) {
            const [line, state] = st.split('.');
            (r.lines ?? (r.lines = {}))[line] = state;
            addUnique(this.ever, line);
            addUnique(this.ever, st);
        }
        if (e.unbind) this.unbindSystem(step);
        if (e.bind) this.bindSystem(e.bind, step);
        if (e.keepSystem) {
            const sys = r.companions.find(id => this.data.companions.get(id)?.system);
            if (sys) {
                this.dp.keptSystem = sys;
                step.messages.push(`【叮！】系统认主成功。从今往后，每一世都由本系统为宿主服务。`);
            }
        }
        for (const f of e.feuds) {
            r.feuds = r.feuds ?? [];
            addUnique(this.dp.codex.feuds ?? (this.dp.codex.feuds = []), f);
            if (!addUnique(r.feuds, f)) continue;
            step.messages.push(`【恩怨了结】${f}`);
            this.hype(step, 'feud');
        }
        for (const f of e.follows) {
            const threads = (r.threads = r.threads ?? []).filter(t => t.id !== f.id);
            threads.push({ id: f.id, at: r.season + f.delay, until: r.season + f.delay + f.ttl - 1 });
            r.threads = threads;
        }
        for (let i = 0; i < (e.stageUp ?? 0) && r.phase !== 'over'; i++) {
            if (!this.data.stages.some(s => s.level === r.stage + 1)) break;
            if (this.breakthrough(step)) break;
        }
        if (e.back) {
            r.pos[e.back] = Math.max(0, r.pos[e.back] - 1);
            r.push[e.back] = 0;
        }
    }

    /** 任何一世到达过的线路 / 状态（存档） */
    private get ever(): string[] {
        return this.dp.ever ?? (this.dp.ever = []);
    }

    /** 当前绑定的系统 id */
    systemId(): string | undefined {
        return this.run.companions.find(id => this.data.companions.get(id)?.system);
    }

    /** 绑定系统：一世最多一个（已有系统时失败） */
    private bindSystem(id: string, step: StepResult): void {
        const def = this.data.companions.get(id);
        if (!def?.system) return;
        if (this.systemId()) {
            step.messages.push('【叮！】宿主已绑定其他系统，本系统绑定失败。');
            return;
        }
        this.run.companions.push(id);
        if (def.startEffect) this.applyEffect(def.startEffect, step, false);
        step.messages.push(`【叮！】系统绑定成功：${def.name}。${def.desc}`);
        this.run.log.push(`第${this.run.season}季，绑定了${def.name}。`);
    }

    private unbindSystem(step: StepResult): void {
        const id = this.systemId();
        if (!id) return;
        this.run.companions = this.run.companions.filter(x => x !== id);
        step.messages.push(`【叮！】${this.data.companions.get(id)?.name ?? '系统'}已解绑。`);
    }

    private addAttr(id: string, v: number, step: StepResult): void {
        if (!v) return;
        const a = this.run.attrs;
        const before = a[id] ?? 0;
        let after = Math.max(ATTR_FLOOR, before + v);
        const R = this.data.meta.rules;
        if (id === R.life) after = Math.min(after, a[R.lifeMax]);
        a[id] = after;
        if (id === R.lifeMax && a[R.life] > after) a[R.life] = after;
        const delta = after - before;
        if (delta) step.deltas[id] = (step.deltas[id] ?? 0) + delta;
    }

    private gainItem(id: string, step: StepResult): void {
        if (!this.data.items.has(id)) return;
        this.run.items.push(id);
        addUnique(this.run.found, id);
        step.gained.push(id);
    }

    private loseItem(id: string, step: StepResult): void {
        const i = this.run.items.indexOf(id);
        if (i < 0) return;
        this.run.items.splice(i, 1);
        step.lost.push(id);
    }

    // ───────────── 内部：条件 ─────────────

    private ctx: CondCtx = {
        num: (ref: NumRef) => {
            const r = this.run;
            switch (ref.kind) {
                case 'attr': return r.attrs[ref.id!] ?? 0;
                case 'stage': return r.stage;
                case 'season': return r.season;
                case 'life': return r.life;
                case 'legacy': return this.dp.legacy[ref.id!] ?? 0;
                case 'pos': return r.pos[ref.id as Dir];
                case 'died': return this.dp.deathCount?.[ref.id!] ?? 0;
                case 'xstage': return this.profile.destinies[ref.id!]?.bestStage ?? 0;
                case 'xlives': return this.profile.destinies[ref.id!]?.lives ?? 0;
            }
        },
        has: (kind: HasKind, id: string) => {
            const r = this.run;
            switch (kind) {
                case 'flag': return r.flags.includes(id);
                case 'talent': return r.talents.includes(id);
                case 'item': return r.items.includes(id);
                case 'companion': return r.companions.includes(id);
                case 'skill': return r.skills.includes(id);
                case 'seen': return this.dp.codex.events.includes(id) || r.seen.includes(id);
                case 'dead': return this.dp.codex.deaths.includes(id);
                case 'ending': return this.dp.codex.endings.includes(id);
                case 'line': {
                    const [line, state] = id.split('.');
                    const cur = r.lines?.[line];
                    return state === undefined ? cur !== undefined : cur === state;
                }
                case 'ever': return this.ever.includes(id) || (() => { const [l, st] = id.split('.'); return st === undefined ? r.lines?.[l] !== undefined : r.lines?.[l] === st; })();
                case 'system': return id === 'any' ? !!this.systemId() : r.companions.includes(id);
                case 'xend': {
                    // xend:命格id 或 xend:命格id/结局id
                    const [did, eid] = id.split('/');
                    const ends = this.profile.destinies[did]?.codex?.endings ?? [];
                    return eid ? ends.includes(eid) : ends.length > 0;
                }
            }
        },
    };

    private check(c?: Cond): boolean {
        return !c || evalCond(c.ast, this.ctx);
    }

    private names: DescribeNames = {
        attr: id => this.attrName(id),
        legacy: id => this.data.legacies.get(id)?.name ?? id,
        talent: id => this.data.talents.get(id)?.name ?? id,
        item: id => this.itemName(id),
        companion: id => this.data.companions.get(id)?.name ?? id,
        skill: id => this.skillName(id),
    };

    private describe(c?: Cond): string {
        return c ? describeCond(c.ast, this.names) : '';
    }

    /** 若条件涉及传承/天赋/道具/伴生物，返回一个标签，如「传承·耐火根」 */
    private specialTag(c?: Cond): string | undefined {
        if (!c) return undefined;
        let tag: string | undefined;
        walkCond(c.ast, leaf => {
            if (tag) return;
            if (leaf.t === 'cmp' && leaf.left.kind === 'legacy') tag = `传承·${this.names.legacy(leaf.left.id!)}`;
            else if (leaf.t === 'has' && leaf.kind === 'talent') tag = `天赋·${this.names.talent(leaf.id)}`;
            else if (leaf.t === 'has' && leaf.kind === 'item') tag = `道具·${this.names.item(leaf.id)}`;
            else if (leaf.t === 'has' && leaf.kind === 'companion') tag = `伴生·${this.names.companion(leaf.id)}`;
            else if (leaf.t === 'has' && leaf.kind === 'skill') tag = `技能·${this.names.skill(leaf.id)}`;
            else if ((leaf.t === 'has' && leaf.kind === 'xend') || (leaf.t === 'cmp' && (leaf.left.kind === 'xstage' || leaf.left.kind === 'xlives'))) tag = '前世今生';
            else if (leaf.t === 'cmp' && leaf.left.kind === 'died') tag = '宿怨';
        });
        return tag;
    }

    chanceOf(c: Choice): number {
        if (c.chance === undefined) return 1;
        return Math.min(0.95, Math.max(0.05, this.rawChance(c)));
    }

    /** 未封顶的成功率（≥1 即「稳」） */
    private rawChance(c: Choice): number {
        if (c.chance === undefined) return 1;
        const bonus = (c.chanceAttr ? (this.run.attrs[c.chanceAttr] ?? 0) * (c.chanceStep ?? 0) : 0) + (this.run.boost ?? 0);
        return c.chance + bonus;
    }

    private previewChoice(c: Choice): string {
        const fmt = (o: Outcome) => {
            if (o.effect.death) return `死亡：${this.data.deaths.get(o.effect.death)?.name}`;
            const parts = Object.entries(o.effect.attrs).map(([k, v]) => `${this.attrName(k)}${v > 0 ? '+' : ''}${v}`);
            if (o.effect.items.length) parts.push(`获得${o.effect.items.map(i => this.itemName(i)).join('、')}`);
            return parts.join(' ') || '无事发生';
        };
        if (c.chance !== undefined && c.fail) {
            if (this.isSure(c)) return `稳了｜${fmt(c.success)}`;
            return `成功率${Math.round(this.chanceOf(c) * 100)}%｜成功：${fmt(c.success)}｜失败：${fmt(c.fail)}`;
        }
        return fmt(c.success);
    }

    /** 读取当前阶段（避免 TS 在副作用调用后仍沿用旧的收窄类型） */
    private phase(): RunState['phase'] {
        return this.run.phase;
    }

    private expectPhase(p: RunState['phase']): void {
        if (this.run.phase !== p) throw new Error(`当前阶段是 ${this.run.phase}，不是 ${p}`);
    }
}

function clip(s: string, n: number): string {
    return s.length > n ? s.slice(0, n) + '…' : s;
}

/** FNV-1a 字符串哈希（每日天命用，跨平台稳定） */
function hashStr(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
