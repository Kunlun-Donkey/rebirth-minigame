/**
 * 主菜单（标题页）：启动加载完成后进入；与启动页共用底板（游戏名 + 适龄提示 + 健康游戏忠告）。
 *   有进行中的一局：继续这一世 / 重新投胎（放弃，需确认）
 *   没有：开始轮回
 *   选择命格（多命格时；进行中的一局要先结束或放弃）· 声音开关
 */
import { destinyStates } from '../../core';
import type { Game } from '../game';
import { button, chip, onTap, sizeOf, text, COLOR } from '../ui/kit';
import { soundToggle } from './draft';
import { showList } from './popups';
import { titleBase } from './splash';

const SEASONS = ['春', '夏', '秋', '冬'];

export function showMenu(g: Game): void {
    const { root, top, bottom } = titleBase(g, 'menu');
    const e = g.engine;
    const bw = g.W - 160;
    const x = 80;
    let y = top;
    const add = (n: ReturnType<typeof button>) => { y += sizeOf(n).h + 20; };

    if (g.hasActiveRun()) {
        const r = e.run;
        add(button(root, x, y, bw, {
            label: '继续这一世', style: 'primary', size: 34, align: 'center',
            sub: `${e.data.meta.name} · 第 ${r.life} 世 · ${e.stageName(r.stage)} · 第 ${r.season} 季（${SEASONS[(r.season - 1) % 4]}）`,
            onClick: () => g.goRun(),
        }));
        add(button(root, x, y, bw, {
            label: '重新投胎', size: 30, align: 'center', sub: '放弃这一世，回轮回殿重新选择',
            onClick: () => showList(g, '放弃这一世？', [{
                title: '放弃，重新投胎',
                desc: '这一世不结算：不获得轮回点、传承与遗物。',
                tag: { text: '确认', color: COLOR.bad },
                onPick: () => { g.abandonRun(); g.goDraft(); },
            }], { closeText: '再想想' }),
        }));
    } else {
        add(button(root, x, y, bw, {
            label: '开始轮回', style: 'primary', size: 34, align: 'center',
            sub: `${e.data.meta.name} · 第 ${e.dp.lives + 1} 世`,
            onClick: () => g.goDraft(),
        }));
    }

    if (g.index.destinies.length > 1) {
        const states = destinyStates(g.index, g.save.profile);
        const unlocked = states.filter(s => s.unlocked).length;
        const fresh = states.some(s => s.unlocked && !s.lives && s.entry.id !== e.data.meta.id);
        const busy = g.hasActiveRun();
        add(button(root, x, y, bw, {
            label: '选择命格', size: 30, align: 'center', style: busy ? 'locked' : 'normal',
            sub: busy ? '先结束或放弃这一世' : `已解锁 ${unlocked}/${states.length}${fresh ? ' · 有新命格！' : ''}`,
            subColor: !busy && fresh ? COLOR.bad : undefined,
            onClick: busy ? undefined : () => g.goDestinySelect('menu'),
        }));
    }

    // 声音开关 + 图鉴墙，同一行居中
    const st = soundToggle(g, root, 0, y);
    const cx = chip(root, '▣ 图鉴墙', 0, y, COLOR.legacy, true, 22);
    onTap(cx, () => g.goCodex());
    const rowW = sizeOf(st).w + 24 + sizeOf(cx).w;
    st.setPosition((g.W - rowW) / 2, -y, 0);
    cx.setPosition((g.W - rowW) / 2 + sizeOf(st).w + 24, -y, 0);
    if (y + 60 > bottom) console.warn('[menu] 按钮区域超出，压到了健康游戏忠告');
    text(root, `轮回点 ${g.save.profile.points}`, 0, y + 56, g.W, { size: 22, color: COLOR.ink2, align: 'center' });
}
