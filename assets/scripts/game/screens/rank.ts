/**
 * 好友排行榜：弹窗里放一个 SubContextView 显示开放数据域画的榜（数据与绘制都在
 * build-templates/wechatgame/openDataContext/index.js）。非微信环境显示说明文字。
 */
import { SubContextView } from 'cc';
import type { Game } from '../game';
import { Platform } from '../platform';
import { box, button, COLOR, modal, pop, text } from '../ui/kit';

export function showRank(g: Game): void {
    const PH = Math.min(g.H - 160, 1000);
    const { panel, panelW, close } = modal(g.overlay, g.W, g.H, PH, { dark: true, onClose: () => Platform.postToRank({ type: 'close' }) });
    pop(panel);
    const view = box(panel, 20, 20, panelW - 40, PH - 160, 'rankView');
    if (Platform.isWx()) {
        view.addComponent(SubContextView);
        Platform.postToRank({ type: 'rank' });
    } else {
        text(view, '好友轮回榜只在微信里显示', 0, (PH - 160) / 2 - 20, panelW - 40, { size: 28, color: COLOR.ink2, align: 'center' });
    }
    button(panel, 30, PH - 120, panelW - 60, { label: '关  闭', style: 'ghost', size: 28, align: 'center', onClick: close });
}
