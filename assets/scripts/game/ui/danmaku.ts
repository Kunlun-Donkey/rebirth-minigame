/** 弹幕：高光时刻从屏幕右侧飘过几条围观评论（挂在 g.fx 层，切界面不清空，飘完自毁） */
import { Node, tween, Vec3 } from 'cc';
import type { Game } from '../game';
import { box, COLOR, estimateWidth, rect, text } from './kit';

const COUNT = 6;
const LANES = 5;
const SIZE = 28;

export function danmaku(g: Game, pool: string[]): void {
    if (!pool.length || !g.fx) return;
    const lines = shuffle([...pool]).slice(0, COUNT);
    const top = g.H * 0.16;
    lines.forEach((s, i) => {
        const w = Math.ceil(estimateWidth(s, SIZE)) + 32;
        const h = SIZE + 18;
        const lane = i % LANES;
        const y = top + lane * (h + 22) + (i >= LANES ? h / 2 : 0);
        const n: Node = box(g.fx, g.W + 20 + Math.random() * 120, y, w, h, 'danmaku');
        rect(n, { fill: COLOR.mask, fillAlpha: 110, radius: h / 2 });
        text(n, s, 0, 0, w, { size: SIZE, color: i % 3 === 0 ? COLOR.legend : COLOR.white, align: 'center', valign: 'center' }, h);
        const dur = 4.2 + Math.random() * 1.6;
        tween(n)
            .delay(i * 0.45 + Math.random() * 0.3)
            .to(dur, { position: new Vec3(-w - 20, -y, 0) })
            .call(() => n.destroy())
            .start();
    });
}

function shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
