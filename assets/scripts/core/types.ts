/**
 * 核心类型定义。core/ 目录为纯 TypeScript，不依赖 Cocos（cc），
 * 可在 Linux 端用 vitest 测试、用 tsx 跑终端试玩。
 */
import type { CondNode } from './condition';

export type Dir = 'up' | 'down' | 'side';
export const DIRS: Dir[] = ['up', 'down', 'side'];

export type Rarity = 'common' | 'rare' | 'epic' | 'legend';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legend'];

// ───────────── 剧本原始数据（JSON 格式，给写手用） ─────────────

/** 效果：属性键（id 或中文名）→ 增量；保留键见 RESERVED_EFFECT_KEYS */
export type RawEffect = Record<string, number | string | boolean | string[] | RawFollow | RawFollow[]>;
export type RawFollow = string | { id: string; delay?: number; ttl?: number };

export interface RawOutcome {
    effect?: RawEffect;
    result?: string;
    next?: string;
}

export interface RawChoice extends RawOutcome {
    text: string;
    /** 不满足时显示为锁定（告诉玩家下一世的目标） */
    require?: string;
    /** 不满足时完全隐藏（天赋/伴生物专属选项） */
    showIf?: string;
    /** 成功率 0~1；配合 fail 使用 */
    chance?: number;
    /** 每点该属性额外增加的成功率 */
    chanceAttr?: string;
    chanceStep?: number;
    fail?: RawOutcome;
    /** 技能交互选项：需要该技能已冷却完毕，选择后进入冷却。通常配合 showIf: "skill:x" */
    useSkill?: string;
    /** 碾压文案：成功率溢出到 100%（显示「稳」）时替代 result */
    easy?: string;
    /** 离谱选项：按钮上标「离谱」（通常成功率低、成了奖励高，失败文案本身好笑） */
    absurd?: boolean;
}

export interface RawEvent {
    id: string;
    dir: Dir | 'any';
    layers?: string[];
    stage?: [number, number];
    weight?: number;
    once?: boolean;
    /** 突发事件：不经方向选择直接触发 */
    sudden?: boolean;
    /** 金色稀有事件，权重受 goldMul 加成 */
    gold?: boolean;
    /** 仅作为 next / enterEvent 链式触发，不参与随机抽取 */
    chainOnly?: boolean;
    /** 只在这些出生地图里出现（省略 = 所有地图） */
    maps?: string[];
    /** 只在这些职业出现（省略 = 所有职业；随机抽取与后续剧情都受限） */
    careers?: string[];
    /** 作为后续（follow）待触发时，在选方向界面显示的预告，如「那只蝎子说它还会回来」 */
    teaser?: string;
    /** 跨命格彩蛋（前世今生）：事件卡标「似曾相识」，选完飘弹幕 */
    cameo?: boolean;
    require?: string;
    text: string;
    choices: RawChoice[];
}

/**
 * 天命之子（天胡通道）：每世开局以 chance 概率触发，开局加成 + 寿元加倍 + 必出奇遇连锁 chain。
 * 概率受 Mods.blessedMul（天命/天赋）与命盘 kind:'blessed'（每级 +value）影响。
 */
export interface BlessedDef {
    chance: number;
    name: string;
    /** 开局弹窗文字 */
    text: string;
    start?: RawEffect;
    lifespanMul?: number;
    /** 奇遇连锁的第一个事件（作为后续剧情在第 2 季触发） */
    chain?: string;
}

export interface Mods {
    /** 每 N 季消耗一次水分（取最大） */
    waterCostEvery?: number;
    qiMul?: number;
    reviveOnce?: boolean;
    pointsMul?: number;
    /** 每个事件有该概率预告一个选项结果 */
    hintChance?: number;
    suddenMul?: number;
    /** 天命之子概率倍率 */
    blessedMul?: number;
    goldMul?: number;
    relicSlots?: number;
    previewDirs?: boolean;
}

export interface AttrDef {
    id: string;
    name: string;
    icon?: string;
    /** HUD 圆标里的单字（缺省取 name 第一个字） */
    short?: string;
    /** HUD 圆标底色 */
    color?: string;
    /** 点开属性时的说明 */
    desc?: string;
    /** 通用属性图标 → textures/common/icon/stat_{stat}（life/down/up/tough/spirit/energy） */
    stat?: string;
    init: number;
    hidden?: boolean;
}

export interface DirDef {
    id: Dir;
    name: string;
    require?: string;
}

export interface LayerDef {
    id: string;
    dir: Dir;
    name: string;
    /** 进入该层的条件 */
    require?: string;
    /** 在该层需要走几次才尝试进入下一层 */
    span: number;
    enterText: string;
    blockedText: string;
    /** 进入时强制触发的事件（如熔岩层门槛） */
    enterEvent?: string;
}

export interface StageDef {
    level: number;
    name: string;
    require?: string;
    narration: string;
    /** 寿元：活到第 N 季自然老死 */
    lifespan: number;
    bonus?: RawEffect;
    /** 到达该境界即结局（按顺序匹配第一个满足的） */
    endings?: { id: string; require?: string }[];
    /** 突破时从中领悟一个技能（优先未解锁的） */
    skillPool?: string[];
    /** 寿终结局：在这个境界寿元到头时，满足条件就判为结局而不是寿终死法（如「平凡一生」） */
    oldAgeEndings?: { id: string; require?: string }[];
}

/** 死亡时可能领悟的技能 */
export interface SkillChance {
    id: string;
    /** 默认 1 */
    chance?: number;
    /** 结算传承之后判定，可用 legacy:x>=N */
    require?: string;
}

export interface DeathDef {
    id: string;
    name: string;
    /** 通用图标名 → textures/common/icon/death_{icon} */
    icon?: string;
    epitaph: string;
    legacy?: string;
    skills?: SkillChance[];
}

/**
 * 技能。解锁永久保存（技能图鉴），开局最多携带 settings.skillSlots 个；局内领悟的技能立即可用。
 *   use = 'direction'：选方向阶段使用，结算 effect
 *   use = 'event'    ：事件中使用，boost 成功率 / reveal 看穿 / skip 化解（链式门槛事件不可化解）
 *   无 use           ：只能通过事件里 useSkill 的交互选项使用
 */
export interface SkillDef {
    id: string;
    name: string;
    /** 通用图标名 → textures/common/icon/skill_{icon} */
    icon?: string;
    desc: string;
    /** 冷却季数 */
    cd: number;
    use?: 'direction' | 'event';
    effect?: RawEffect;
    boost?: number;
    reveal?: boolean;
    skip?: boolean;
    useText?: string;
    /** 图鉴里提示如何解锁 */
    hint: string;
}

export interface LegacyDef {
    id: string;
    name: string;
    desc: string;
    max: number;
    /** levels[i] = 第 i+1 级额外提供的开局效果（累加，体现边际递减） */
    levels?: RawEffect[];
}

export interface EndingDef {
    id: string;
    name: string;
    epitaph: string;
}

export interface PoolEntryBase {
    id: string;
    name: string;
    /** 通用图标名 → textures/common/icon/{talent|item}_{icon}（伙伴用命格层 companion_{id}） */
    icon?: string;
    rarity: Rarity;
    desc: string;
    mods?: Mods;
}

export interface TalentDef extends PoolEntryBase {
    start?: RawEffect;
}

export interface ItemDef extends PoolEntryBase {
    /** 主动使用效果；无则为被动道具 */
    use?: RawEffect;
    useText?: string;
    consumable?: boolean;
    /** 持有时抵挡一次死亡（消耗） */
    saveFromDeath?: boolean;
}

export interface CompanionDef extends PoolEntryBase {
    start?: RawEffect;
    every?: { n: number; effect: RawEffect; text: string };
    /** 系统（金手指）：不进开局伙伴池，只能由事件效果 bind 中途绑定；一世最多一个 */
    system?: boolean;
}

/**
 * 命盘（局外永久升级，花轮回点购买，按命格独立）。
 *   start       每级叠加一次 start 开局效果
 *   reroll      每级 +1 次免费「天机重演」（用完后仍可看视频再刷一次）
 *   draftSize   每级开局池 +1 张（3 选 1 → 4 选 1）
 *   relicSlot   每级 +1 个遗物封存格
 *   pointsBonus 每级轮回点 +value（如 0.1 = +10%）
 *   reviveBoost 看视频「逆天改命」时额外获得 start 效果，并回满水分
 * 设计约束：命盘不提供免费复活 / 免费窥探等能替代广告的效果，只放大广告的收益。
 */
export type UpgradeKind = 'start' | 'reroll' | 'draftSize' | 'relicSlot' | 'pointsBonus' | 'reviveBoost' | 'blessed';

export interface UpgradeDef {
    id: string;
    name: string;
    desc: string;
    kind?: UpgradeKind;
    /** costs[i] = 升到第 i+1 级的价格；长度即最高等级 */
    costs: number[];
    start?: RawEffect;
    value?: number;
}

/**
 * 出生地图：每一世开局按权重随机一张。可改层的名字/旁白、给开局效果与修正，
 * 事件用 maps 字段限定只在某些地图出现。
 */
export interface MapDef {
    id: string;
    name: string;
    desc: string;
    weight?: number;
    /** 出生旁白（替代 rules.startLog） */
    startLog?: string;
    start?: RawEffect;
    mods?: Mods;
    /** 层覆盖：层 id → 名字 / 进入旁白 / 受阻旁白 */
    layers?: Record<string, { name?: string; enterText?: string; blockedText?: string }>;
    /** 世界线压过职业：层覆盖以地图为准（灵气复苏 / 末世这类改天换地的地图） */
    dominant?: boolean;
}

/**
 * 职业：玩家在开局择业事件里选（效果 career: id），也能中途转行。
 * 可改层的名字/旁白、给开局效果与修正；事件 / 线路用 careers 字段限定只在某些职业出现。
 */
export interface CareerDef {
    id: string;
    name: string;
    desc: string;
    /** 选方向提示里的「{career}」，如「跑外卖」 */
    title: string;
    start?: RawEffect;
    mods?: Mods;
    layers?: Record<string, { name?: string; enterText?: string; blockedText?: string }>;
}

/** 每日天命：当天所有轮回生效的全局修正（同一天所有玩家相同，可看视频换一次） */
export interface FateDef {
    id: string;
    name: string;
    desc: string;
    mods?: Mods;
    start?: RawEffect;
}

export interface DestinyMeta {
    id: string;
    name: string;
    desc: string;
    attrs: AttrDef[];
    dirs: DirDef[];
    layers: LayerDef[];
    stages: StageDef[];
    deaths: DeathDef[];
    legacies: LegacyDef[];
    endings: EndingDef[];
    upgrades?: UpgradeDef[];
    fates?: FateDef[];
    maps?: MapDef[];
    careers?: CareerDef[];
    blessed?: BlessedDef;
    /** 命格规则：生命 / 回复 / 成长等由数据决定，引擎不写死任何属性名 */
    rules: DestinyRules;
    settings: {
        suddenChance: number;
        rarityWeights: Record<Rarity, number>;
        /** 开局可携带技能数 */
        skillSlots: number;
        /** 新手保护：本命格第 1 世的前 N 季不会死（缺省 0 = 关闭） */
        newbieSeasons?: number;
    };
}

export interface DestinyRules {
    /** 生命属性（如水分 / 体力），归零即 lifeDeath */
    life: string;
    /** 生命上限属性（隐藏） */
    lifeMax: string;
    lifeDeath: string;
    /** 活到境界寿元时的死法 */
    oldAgeDeath: string;
    /** 每季回复：生命 + floor(from / per)；每季基础消耗 1（受 waterCostEvery 修正） */
    regen: { from: string; per: number };
    /** 成长货币（如灵气 / 妖气），受 qiMul 加成，用于境界突破 */
    growth: string;
    /** 每季产出：growth + base + floor(from / per)，境界 ≥ minStage 才产出 */
    yield: { from: string; per: number; base: number; minStage?: number };
    /** 开局生平第一句 */
    startLog: string;
    /** 加载界面文字 */
    loadingText?: string;
    /** 「死后复活一次」类天赋触发时的旁白 */
    reviveOnceText?: string;
    /** 寿元将尽时的「最后一搏」事件（每世一次，成功则 stageUp 续命冲境界） */
    lastStand?: string;
    /** 选方向时的提示，{stage} 替换为境界名；换行用 \n */
    dirPrompt?: string;
    /** 道具栏为空时的提示 */
    emptyItems?: string;
    /** 濒死弹窗标题（缺省「你 要 死 了」；人类命格用「这一世要到头了」这类温和说法） */
    dyingTitle?: string;
    /** 开局择业事件：这一世还没有职业时，第 1 季开头强制触发（选项效果里写 career: id） */
    careerEvent?: string;
}

/** 命格索引（data/destinies/index.json）：轮回殿里可选的命格及解锁条件 */
export interface DestinyIndexEntry {
    id: string;
    name: string;
    /** 一句话简介 */
    desc: string;
    /** 解锁条件；省略 = 默认开放。多个字段需同时满足 */
    unlock?: {
        /** 给玩家看的条件说明 */
        text: string;
        /** 某命格的最高境界达到 level */
        bestStage?: { destiny: string; level: number };
        /** 所有命格累计轮回世数 */
        lives?: number;
        /** 所有命格累计达成的结局数 */
        endings?: number;
    };
}

export interface DestinyIndex {
    destinies: DestinyIndexEntry[];
}

export interface RawDestiny {
    meta: DestinyMeta;
    talents: TalentDef[];
    items: ItemDef[];
    companions: CompanionDef[];
    skills: SkillDef[];
    events: RawEvent[];
    /** 线路（lines/*.json）：一条故事一个模块，内部 id / flag 自动加命名空间 */
    lines?: RawLine[];
    /** 交叉事件（crossings/*.json）：引用多条线路导出状态的胶水事件 */
    crossings?: RawEvent[];
}

/**
 * 线路：一条故事线一个文件。
 *   - 事件 id、follow / next、flag / seen 条件里不带「/」的 id 自动加前缀「线路id/」，不同线路互不撞名
 *   - 效果 state: "escaped" → 线路状态 线路id.escaped；跨线写 "其他线路.状态"
 *   - 条件 line:线路id（这一世开始了）、line:线路id.状态、ever:线路id.状态（任何一世到达过）
 *   - entry: true 的事件是入口：自动加条件「这一世还没碰过这条线」，并继承线路的 stage
 *   - 别的线路 / 交叉事件只能引用 states 里登记（导出）的状态
 */
export interface RawLine {
    id: string;
    name: string;
    summary?: string;
    /** 线路所有事件默认只在这些世界线（maps）出现 */
    maps?: string[];
    /** 线路所有事件默认只在这些职业出现（事件自己写了 careers 则以事件为准） */
    careers?: string[];
    /** 入口事件默认的境界范围 */
    stage?: [number, number];
    /** 导出状态：状态 id → 说明 */
    states: Record<string, string>;
    events: (RawEvent & { entry?: boolean })[];
}

// ───────────── 归一化后的数据（引擎使用） ─────────────

export interface Cond {
    src: string;
    ast: CondNode;
}

export interface Effect {
    attrs: Record<string, number>;
    flags: string[];
    unflags: string[];
    items: string[];
    loseItems: string[];
    /** 领悟技能（永久解锁 + 本局立即可用） */
    skills: string[];
    death?: string;
    ending?: string;
    /** 退回该方向的上一层 */
    back?: Dir;
    /** 后续：之后的季节里接着发生的事件（剧情延伸） */
    follows: FollowDef[];
    /** 直接突破 N 个境界（无视条件，奇遇连锁用） */
    stageUp?: number;
    /** 了结的恩怨（结算页「本世恩怨」逐条列出，如「独眼让出了那块石头」） */
    feuds: string[];
    /** 线路状态（已加命名空间：线路id.状态） */
    states: string[];
    /** 绑定系统（companions 里 system: true 的条目） */
    bind?: string;
    /** 解绑当前系统 */
    unbind?: boolean;
    /** 系统认主：当前系统以后每一世开局自动绑定 */
    keepSystem?: boolean;
    /** 入行 / 转行（职业 id） */
    career?: string;
}

/** 后续事件：在 delay 季之后（默认下一季）、玩家选择匹配方向时触发，ttl 季内没走到就作废 */
export interface FollowDef {
    id: string;
    delay: number;
    ttl: number;
}

export interface Outcome {
    effect: Effect;
    result?: string;
    next?: string;
}

export interface Choice {
    text: string;
    require?: Cond;
    showIf?: Cond;
    success: Outcome;
    chance?: number;
    chanceAttr?: string;
    chanceStep?: number;
    fail?: Outcome;
    useSkill?: string;
    easy?: string;
    absurd?: boolean;
}

export interface GameEvent {
    id: string;
    dir: Dir | 'any';
    layers?: string[];
    stage: [number, number];
    weight: number;
    once: boolean;
    sudden: boolean;
    gold: boolean;
    chainOnly: boolean;
    maps?: string[];
    careers?: string[];
    teaser?: string;
    cameo: boolean;
    /** 所属线路 id */
    line?: string;
    /** 交叉事件（多条线路交汇） */
    cross: boolean;
    require?: Cond;
    text: string;
    choices: Choice[];
}

export interface Destiny {
    meta: DestinyMeta;
    attrNames: Record<string, string>;
    talents: Map<string, TalentDef & { startEffect?: Effect }>;
    items: Map<string, ItemDef & { useEffect?: Effect }>;
    companions: Map<string, CompanionDef & { startEffect?: Effect; everyEffect?: Effect }>;
    events: Map<string, GameEvent>;
    layers: Map<string, LayerDef & { cond?: Cond }>;
    /** 每个方向按顺序排列的层 */
    layersByDir: Record<Dir, (LayerDef & { cond?: Cond })[]>;
    dirs: (DirDef & { cond?: Cond })[];
    stages: (StageDef & { cond?: Cond; bonusEffect?: Effect; endingConds?: { id: string; cond?: Cond }[]; oldAgeEndingConds?: { id: string; cond?: Cond }[] })[];
    /** 线路（导出状态表） */
    lines: Map<string, { id: string; name: string; summary?: string; states: Record<string, string> }>;
    deaths: Map<string, DeathDef & { skillConds: { id: string; chance: number; cond?: Cond }[] }>;
    skills: Map<string, SkillDef & { useEffect?: Effect }>;
    legacies: Map<string, LegacyDef & { levelEffects: Effect[] }>;
    endings: Map<string, EndingDef>;
    upgrades: Map<string, UpgradeDef & { kind: UpgradeKind; startEffect?: Effect }>;
    fates: Map<string, FateDef & { startEffect?: Effect }>;
    maps: Map<string, MapDef & { startEffect?: Effect }>;
    careers: Map<string, CareerDef & { startEffect?: Effect }>;
    blessedStart?: Effect;
}

// ───────────── 存档 ─────────────

export interface DestinyProfile {
    lives: number;
    legacy: Record<string, number>;
    /** 下一世开局携带的遗物 */
    sealed: string[];
    /** key = 事件id#选项序号；dead = 这个选项累计害死过你几次 */
    memory: Record<string, { life: number; text: string; dead?: number }>;
    /** 各死法累计次数（宿敌记仇：条件 died:x>=N、文本 {died:x}） */
    deathCount?: Record<string, number>;
    /** 最近连续同一死法：id 与连续世数（墓志铭「下次一定行」） */
    deathRun?: { id: string; n: number };
    /** 任何一世到达过的线路 / 线路状态（「线路id」「线路id.状态」） */
    ever?: string[];
    /** 系统认主：每一世开局自动绑定的系统 */
    keptSystem?: string;
    /** 之前各世干过的职业（条件 pastcareer:x） */
    careers?: string[];
    codex: { deaths: string[]; endings: string[]; items: string[]; events: string[]; tianhu?: number; feuds?: string[] };
    bestStage: number;
    /** 已解锁技能（技能图鉴） */
    skills: string[];
    /** 命盘等级 */
    upgrades: Record<string, number>;
    /** 今日天命（date 为本地日期 YYYY-MM-DD；first = 今日首世奖励尚未领取） */
    daily?: { date: string; fate: string; first: boolean; swapped: boolean };
}

export interface Profile {
    version: 1;
    /** 全局共用的局外货币 */
    points: number;
    lives: number;
    destinies: Record<string, DestinyProfile>;
    /** 玩家上次选择的命格 */
    current?: string;
}

// ───────────── 局内状态（可直接 JSON 序列化，用于中途存档） ─────────────

export type Phase = 'draft' | 'direction' | 'event' | 'dying' | 'over';

export interface RunState {
    destiny: string;
    life: number;
    rng: number;
    season: number;
    stage: number;
    attrs: Record<string, number>;
    pos: Record<Dir, number>;
    push: Record<Dir, number>;
    maxPos: Record<Dir, number>;
    flags: string[];
    items: string[];
    found: string[];
    talents: string[];
    companions: string[];
    seen: string[];
    lastEvent?: string;
    /** 探路道具（mods.previewDirs）：本季各方向预先抽好的事件 */
    preview?: { season: number; ev: Partial<Record<Dir, string>> };
    phase: Phase;
    event?: string;
    dir?: Dir;
    pending: string[];
    /** 待触发的后续剧情（旧存档可能没有） */
    threads?: { id: string; at: number; until: number }[];
    hint?: number;
    revealAll: boolean;
    dying?: string;
    over?: { kind: 'death' | 'ending'; id: string };
    reviveUsed: { talent: boolean; ad: boolean };
    log: string[];
    /** 本局可用技能 */
    skills: string[];
    /** 技能冷却：第几季起可再次使用 */
    cd: Record<string, number>;
    /** 当前事件的成功率加成（技能 boost） */
    boost: number;
    /** 本世新领悟的技能（结算页展示） */
    learned: string[];
    /** 本世遇到但条件不足而锁定的选项（事件id#选项序号，结算页「下一世的目标」） */
    missed: string[];
    /** 本世的天命 */
    fate?: string;
    /** 本世是今日首世（结算轮回点加成） */
    firstOfDay?: boolean;
    /** 本世出生地图 */
    map?: string;
    /** 本世职业（开局择业 / 中途转行） */
    career?: string;
    /** 本世干过的职业（结算时记入存档，下一世起 pastcareer:x 成立） */
    careers?: string[];
    /** 本世是天命之子 */
    blessed?: boolean;
    /** 本世由「随缘投胎」转盘决定命格（结算轮回点加成） */
    spin?: boolean;
    /** 最后一搏：due = 下季开头触发，used = 本世已用过 */
    lastStand?: 'due' | 'used';
    /** 有成功率的选项连续成功次数（势如破竹） */
    streak?: number;
    /** 本世了结的恩怨 */
    feuds?: string[];
    /** 最近一次失败是低成功率硬选（墓志铭「死于过度自信」） */
    reckless?: boolean;
    /** 新手手气已用（第 1 世第一次冒险必成） */
    luck?: boolean;
    /** 线路状态：线路id → 当前状态（"" = 已开始、尚无状态） */
    lines?: Record<string, string>;
}

export interface UpgradeView {
    id: string;
    name: string;
    desc: string;
    level: number;
    max: number;
    /** 下一级价格；已满级为 undefined */
    cost?: number;
    affordable: boolean;
}

// ───────────── 给 UI 的视图 ─────────────

export interface DraftPick {
    talents: string[];
    items: string[];
    companions: string[];
}

export interface DirOption {
    dir: Dir;
    name: string;
    enabled: boolean;
    lockText?: string;
    layerName: string;
    nextLayer?: { name: string; lockText?: string };
    /** 这个方向上有待续的剧情（显示预告） */
    thread?: string;
    /** 探路道具：这个方向本季会遇到什么（预告文字） */
    preview?: string;
}

export interface ChoiceView {
    index: number;
    text: string;
    enabled: boolean;
    lockText?: string;
    /** 前世记忆 */
    memory?: string;
    /** 满足了传承/天赋/道具/伴生物专属条件 */
    tag?: string;
    /** 直觉 / 窥探天命 预告 */
    preview?: string;
    /** 成功率溢出到 100%：必成（碾压） */
    sure?: boolean;
    /** 离谱选项 */
    absurd?: boolean;
}

export interface EventView {
    id: string;
    text: string;
    gold: boolean;
    sudden: boolean;
    /** 跨命格彩蛋（似曾相识） */
    cameo: boolean;
    /** 命运交汇（交叉事件） */
    cross: boolean;
    choices: ChoiceView[];
}

/** 图鉴墙（局外）：结局 / 死法 / 跨命格彩蛋 / 恩怨，未收集的也列出（UI 显示为剪影） */
export interface CodexView {
    endings: { id: string; name: string; epitaph: string; got: boolean }[];
    deaths: { id: string; name: string; epitaph: string; got: boolean; count: number; legacy?: string }[];
    /** hint = 彩蛋条件涉及的其他命格 id（未解锁时提示「与某命格有关」） */
    cameos: { id: string; text: string; got: boolean; hint: string[] }[];
    feuds: { text: string; got: boolean }[];
    tianhu: number;
    /** 故事线（任何一世走进过 = got；states 为导出状态，got = 任何一世到达过） */
    lines: { id: string; name: string; summary: string; got: boolean; states: { id: string; text: string; got: boolean }[] }[];
    /** 技能（未领悟时显示 hint） */
    skills: { id: string; name: string; desc: string; hint: string; got: boolean }[];
    /** 道具（任何一世得到过） */
    items: { id: string; name: string; desc: string; got: boolean }[];
}

/** 本世进行中的故事线；state = 当前状态说明（刚开始时为空） */
export interface LineView { id: string; name: string; summary: string; state: string }

/** 值得飘弹幕的高光时刻（按优先级取一个） */
export type Hype = 'ending' | 'tianhu' | 'breakthrough' | 'feud' | 'crush' | 'streak' | 'cameo' | 'crit' | 'revive';
export const HYPE_ORDER: Hype[] = ['ending', 'tianhu', 'breakthrough', 'feud', 'crush', 'streak', 'cameo', 'crit', 'revive'];

export interface StepResult {
    text?: string;
    deltas: Record<string, number>;
    gained: string[];
    lost: string[];
    messages: string[];
    success?: boolean;
    /** 本步新领悟的技能 */
    skills: string[];
    /** 本步发生了复活（护身道具 / 天赋 / 看视频 / 新手保护） */
    revived?: boolean;
    /** 大成功：成功后额外判定，属性收益翻倍 */
    crit?: boolean;
    /** 高光时刻（UI 飘弹幕） */
    hype?: Hype;
}

/** 距离下一境界：每一项「属性 >= N」的当前值与要求 */
export interface StageProgress {
    name: string;
    parts: { label: string; cur: number; need: number }[];
}

export interface SkillView {
    id: string;
    name: string;
    desc: string;
    use?: 'direction' | 'event';
    /** 剩余冷却季数，0 = 就绪 */
    cdLeft: number;
    /** 当前阶段能否主动使用 */
    usable: boolean;
}

export interface SettleResult {
    kind: 'death' | 'ending';
    id: string;
    title: string;
    epitaph: string;
    life: number;
    seasons: number;
    stage: number;
    stageName: string;
    legacy?: { id: string; name: string; level: number; max: number; isNew: boolean };
    points: number;
    relicCandidates: string[];
    relicSlots: number;
    firstTime: boolean;
    /** 死亡时领悟的技能 */
    skill?: { id: string; name: string; desc: string };
    /** 轮回点明细 */
    breakdown: { label: string; value: number }[];
    /** 三个方向到达的最远层 */
    explore: { dir: Dir; name: string; layer: string }[];
    /** 最终属性（不含隐藏属性） */
    attrs: { id: string; name: string; icon?: string; value: number }[];
    /** 本世领悟的技能（含死亡领悟） */
    learned: { id: string; name: string }[];
    /** 图鉴进度 [已收集, 总数] */
    codex: Record<'deaths' | 'skills' | 'items' | 'endings' | 'events', [number, number]>;
    /** 下一世的目标（本世被锁住的选项，最多 3 条）；ready = 因本次传承/技能已解锁，下一世可选 */
    goals: { text: string; lock: string; ready: boolean }[];
    /** 生平大事 */
    log: string[];
    /** 天胡：天命之子或走完奇遇连锁后达成的结局 */
    tianhu?: boolean;
    /** 本世了结的恩怨 */
    feuds: string[];
    /** 天道的评语 */
    remark: string;
}
