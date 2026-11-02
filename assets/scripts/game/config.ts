/** 游戏配置（上线前在这里填真实的广告位 id） */
export const CONFIG = {
    /** 当前命格 */
    destiny: 'desert_grass',
    /** 微信激励视频广告位 id；为空时使用开发 Mock（直接视为看完） */
    rewardedAdUnitId: '',
    /** 存档 key（结构变更时升级版本号） */
    saveKey: 'rebirth_save_v1',
    /** 每局「窥探天命」次数 */
    peekPerRun: 3,
    /** 设计分辨率（宽度适配） */
    designWidth: 750,
    designHeight: 1334,
    /** 顶部安全区（微信胶囊按钮） */
    safeTop: 96,
};

/**
 * 贴图路径（resources 下，不带扩展名）。目录规范见 docs/art/ai-image-prompts.md §七：
 *   通用层 textures/common/{ui,frame,fx,icon}，命格层 textures/destiny/<id>/
 * 返回数组 = 候选列表，按顺序取第一张存在且比例合适的；全部缺失时 UI 用纸张风格兜底。
 */
const C = 'textures/common';
const D = (f: string) => `textures/destiny/${CONFIG.destiny}/${f}`;
/** 命格版优先，回落通用版 */
const both = (dir: string, f: string) => [D(f), `${C}/${dir}/${f}`];

export const TEX = {
    mainBg: [D('main_bg')],
    settleBg: [D('settle_bg')],
    settleBgEnding: [D('settle_bg_ending')],
    settlePanel: both('ui', 'settle_panel'),
    eventCard: both('ui', 'event_card'),
    eventCardGold: both('ui', 'event_card_gold'),
    eventCardSudden: both('ui', 'event_card_sudden'),
    epitaphCard: both('ui', 'epitaph_card'),
    endingCard: both('ui', 'ending_card'),
    frame: (rarity: string) => [`${C}/frame/frame_${rarity}`],
    badge: (type: 'talent' | 'item' | 'companion' | 'skill') => [`${C}/frame/badge_${type}`],
    fxBreakthrough: [`${C}/fx/fx_breakthrough`],
    /** 境界：命格版形象优先，回落通用突破光效 */
    stage: (lv: number) => [D(`stage_${lv}`), `${C}/fx/fx_breakthrough`],
    companion: (id: string) => [D(`companion_${id}`)],
    icon: (kind: 'death' | 'skill' | 'item' | 'talent', icon?: string) => (icon ? [`${C}/icon/${kind}_${icon}`] : []),
    /** 按钮九宫格（BTN_SLICE） */
    btn: (style: 'normal' | 'primary' | 'ad' | 'locked') => [`${C}/ui/btn_${style}`],
    /** 弹窗面板九宫格（POPUP_SLICE） */
    panel: [`${C}/ui/panel`],
    tool: (id: 'items' | 'skills' | 'companions' | 'codex') => [`${C}/icon/tool_${id}`],
    /** 属性图标：剧本 attrs[].stat → stat_{stat} */
    stat: (stat?: string) => (stat ? [`${C}/icon/stat_${stat}`] : []),
    dir: (dir: string) => [`${C}/icon/dir_${dir}`],
    adIcon: [`${C}/icon/ad_video`],
    logo: [`${C}/ui/logo_title`],
};

/** 九宫格参数 [上, 右, 下, 左]（贴图像素，见 tools/art/gen-art.mjs） */
export const BTN_SLICE: [number, number, number, number] = [36, 36, 48, 36];
export const POPUP_SLICE: [number, number, number, number] = [90, 90, 90, 90];
