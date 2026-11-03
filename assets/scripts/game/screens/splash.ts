/**
 * 启动页（备案要求）：游戏名称 + 适龄提示 + 健康游戏忠告，三者同屏。
 * 备案「玩法」第 1 张截图就截这一页。只用主包资源（logo、主背景），分包未下载也能完整显示。
 *
 * 适龄提示图标：优先用 textures/common/ui/age_<N>（请放中国音数协官方标识，不要自行改动样式），
 * 缺图时用代码画的同款样式兜底。点击图标显示适龄说明。
 */
import { Node } from 'cc';
import { CONFIG, TEX } from '../config';
import type { Game } from '../game';
import { box, COLOR, image, onTap, rect, text } from '../ui/kit';
import { showInfo } from './popups';

export const GAME_NAME = '这一世我重生了';

/** 健康游戏忠告（全文、语序、标点须与官方一致，勿改） */
export const HEALTH_ADVICE = [
    '抵制不良游戏，拒绝盗版游戏。',
    '注意自我保护，谨防受骗上当。',
    '适度游戏益脑，沉迷游戏伤身。',
    '合理安排时间，享受健康生活。',
];

/** 适龄标识底色（按 CADPA 标识：8+ 绿、12+ 蓝、16+ 黄） */
const AGE_COLOR: Record<number, string> = { 8: '#4caf50', 12: '#2f7fd1', 16: '#f2b01e' };

const AGE_DESC = (age: number) => [
    `本游戏适合 ${age} 周岁及以上的用户。`,
    '本游戏为文字选择类单机休闲游戏，以荒漠植物的成长与轮回为题材，画面温和，无真人形象，无血腥暴力内容。',
    CONFIG.adsEnabled ? '游戏无充值、无联网互动，仅有玩家自愿观看的激励视频广告。' : '游戏无充值、无联网互动。',
    '请合理安排游戏时间，注意休息。',
];

/**
 * 标题页底板（启动页与主菜单共用）：背景、logo + 游戏名、适龄提示、健康游戏忠告。
 * 返回根节点、游戏名下方可用区域的顶部 y、健康游戏忠告的顶部 y。
 */
export function titleBase(g: Game, name: string): { root: Node; top: number; bottom: number } {
    const root = box(g.screen, 0, 0, g.W, g.H, name);
    rect(root, { fill: COLOR.bg });
    image(root, TEX.mainBg, 0, 0, g.W, g.H, { cover: true });

    // 游戏名称：logo 图（含完整游戏名）；logo 缺失时显示文字
    const lw = g.W - 80;
    const ly = g.H * 0.16;
    const nameText = text(root, GAME_NAME, 30, ly + lw * 0.36 + 16, g.W - 60, { size: 30, color: COLOR.ochreD, align: 'center', bold: true });
    image(root, TEX.logo, 40, ly, lw, lw * 0.36, { onLoaded: () => { nameText.active = false; } });

    // 适龄提示：左上角、胶囊按钮下方；边长 ≥ 屏幕短边 1/10（设计宽 750 → ≥75）
    ageBadge(g, root, CONFIG.ageRating, 30, CONFIG.safeTop + 10);

    // 健康游戏忠告：底部居中
    const lh = 40;
    const y0 = g.H - 60 - lh * (HEALTH_ADVICE.length / 2 + 1);
    // 底部插画较花（叶子、花、沙丘），衬一层半透明纸色保证文字可读
    const back = box(root, 20, y0 - 14, g.W - 40, lh * (HEALTH_ADVICE.length / 2 + 1) + 28, 'healthBack');
    rect(back, { fill: COLOR.paper, fillAlpha: 200, radius: 16 });
    text(root, '健康游戏忠告', 0, y0, g.W, { size: 26, color: COLOR.ink, align: 'center', bold: true });
    for (let i = 0; i < HEALTH_ADVICE.length; i += 2) {
        text(root, HEALTH_ADVICE[i] + HEALTH_ADVICE[i + 1], 0, y0 + lh * (i / 2 + 1), g.W, { size: 24, color: COLOR.ink, align: 'center' });
    }
    return { root, top: ly + lw * 0.36 + 70, bottom: y0 - 20 };
}

/** 画启动页，返回状态文字节点（加载中提示可更新） */
export function showSplash(g: Game, status: string): Node {
    const { root, top, bottom } = titleBase(g, 'splash');
    return text(root, status, 0, (top + bottom) / 2 - 20, g.W, { size: 28, color: COLOR.ink2, align: 'center' });
}

/** 适龄提示标识（官方图优先，缺图时画兜底样式），点击查看说明 */
export function ageBadge(g: Game, parent: Node, age: number, x: number, y: number): Node {
    const w = 96, h = 120;
    const n = box(parent, x, y, w, h, `age_${age}`);
    rect(n, { fill: AGE_COLOR[age] ?? COLOR.legacy, radius: 12, stroke: '#ffffff', lineWidth: 3 });
    text(n, `${age}+`, 0, 18, w, { size: 44, color: '#ffffff', align: 'center', bold: true }, 56);
    text(n, 'CADPA', 0, 80, w, { size: 18, color: '#ffffff', align: 'center', bold: true });
    image(n, TEX.age(age), 0, 0, w, h, { maxAspectDiff: 0.6 });
    onTap(n, () => showInfo(g, `适龄提示 · ${age}+`, AGE_DESC(age)), false);
    return n;
}
