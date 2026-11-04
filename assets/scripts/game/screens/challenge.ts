/**
 * 好友挑战：好友从分享卡点进来时弹出「TA 的这一世」——称号、墓志铭、稀有度，
 * 「我也投一次胎」直接进同一命格的轮回殿（命格未解锁也可试玩这一世），结算时与 TA 对比。
 */
import type { Destiny } from '../../core';
import { brandTitle, rarityOf, ShareLife } from '../brag';
import type { Game } from '../game';
import { button, COLOR, modal, pop, text, textHeight } from '../ui/kit';

export function showChallenge(g: Game, q: ShareLife, d: Destiny): void {
    const def = q.k === 'ending' ? d.endings.get(q.id) : d.deaths.get(q.id);
    if (!def) return;
    const name = d.meta.name;
    const brand = brandTitle(name, q.l, q.k, def.name);
    const rar = rarityOf(g.rarity, q.d, q.k, q.id);
    const lines = [def.epitaph, ...(rar ? [`【${rar.tier}】${rar.text}`] : [])].join('\n\n');
    const innerW = g.W - 140;
    const h = 330 + textHeight(brand, innerW, 34, 48) + textHeight(lines, innerW, 26, 40) + 220;
    const { panel, panelW, close } = modal(g.overlay, g.W, g.H, h, { dark: true });
    pop(panel);
    text(panel, q.t ? '✦ 好友天胡了 ✦' : '好友的这一世', 0, 40, panelW, { size: 30, color: q.t ? COLOR.legacy : COLOR.ink2, align: 'center', bold: !!q.t });
    let y = 100;
    const b = text(panel, brand, 40, y, innerW, { size: 34, color: COLOR.ochreD, bold: true, wrap: true, lineHeight: 48, align: 'center' });
    y += textHeight(brand, innerW, 34, 48) + 24;
    text(panel, lines, 40, y, innerW, { size: 26, color: COLOR.ink2, wrap: true, lineHeight: 40 });
    y += textHeight(lines, innerW, 26, 40) + 30;
    text(panel, q.k === 'ending' ? `TA 用了 ${q.l} 世。你能更快吗？` : '同样的命，你会怎么活？', 0, y, panelW, { size: 28, color: COLOR.bad, align: 'center', bold: true });
    void b;

    const busy = g.hasActiveRun();
    button(panel, 30, h - 230, panelW - 60, {
        label: '我也投一次胎', style: 'primary', size: 32, align: 'center',
        sub: busy ? '你还有一世没过完：挑战先记下，过完这一世再对比' : `成为「${name}」`,
        onClick: () => { close(); g.acceptChallenge(q); },
    });
    button(panel, 30, h - 110, panelW - 60, { label: '先看看', style: 'ghost', size: 26, align: 'center', onClick: close });
}
