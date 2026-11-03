/**
 * 把假 cc 运行时里的节点树序列化成 HTML（绝对定位），用于浏览器截图与自动检查。
 * 坐标约定同 ui/kit：节点锚点左上角，position.y 向上为正 → 屏幕 y = -position.y。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Graphics, Label, Node, Sprite, UITransform } from '../../tests/fake-cc';

const ASSETS = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'assets');

function imageFile(path: string): string | null {
    for (const b of ['resources', 'subres']) for (const ext of ['.png', '.jpg', '.jpeg']) {
        const f = join(ASSETS, b, path + ext);
        if (existsSync(f)) return f;
    }
    return null;
}

const rgba = (c: { r: number; g: number; b: number; a: number }, op = 1) => `rgba(${c.r},${c.g},${c.b},${((c.a / 255) * op).toFixed(3)})`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toHtml(root: Node, W: number, H: number, title: string): string {
    const out: string[] = [];
    let z = 0;
    const visit = (n: Node, ax: number, ay: number, s: number, path: string, tapAncestor: string | null) => {
        if (!n.isValid || !n.active) return;
        const t = n.getComponent(UITransform);
        const w = (t?.width ?? 0) * s, h = (t?.height ?? 0) * s;
        const id = `${path}/${n.name}#${n.parent ? n.parent.children.indexOf(n) : 0}`;
        const layer = /\/(screen|overlay)#/.exec(id)?.[1] ?? 'root';
        const tap = n.listeners.has(Node.EventType.TOUCH_END) ? id : null;
        const owner = tap ?? tapAncestor;
        if (tap) out.push(`<div class="tap" data-layer="${layer}" data-id="${esc(id)}" style="left:${ax}px;top:${ay}px;width:${w}px;height:${h}px;z-index:${z++}"></div>`);
        const g = n.getComponent(Graphics);
        if (g) for (const op of g.ops) {
            const left = ax + op.x * s, top = ay - (op.y + op.h) * s;
            const st = op.kind === 'fill' ? `background:${rgba(op.color)}` : `border:${op.lw * s}px solid ${rgba(op.color)}`;
            const rad = op.shape === 'circle' ? '50%' : `${op.r * s}px`;
            out.push(`<div class="g" style="left:${left}px;top:${top}px;width:${op.w * s}px;height:${op.h * s}px;border-radius:${rad};${st};z-index:${z++}"></div>`);
        }
        const sp = n.getComponent(Sprite);
        if (sp?.spriteFrame) {
            const f = imageFile(sp.spriteFrame.name);
            if (f) {
                const sf = sp.spriteFrame;
                if (sp.type === Sprite.Type.SLICED) {
                    const ins = [sf.insetTop, sf.insetRight, sf.insetBottom, sf.insetLeft];
                    out.push(`<div class="sp" data-src="${esc(sf.name)}" style="left:${ax}px;top:${ay}px;width:${w}px;height:${h}px;border-style:solid;border-width:${ins.map(v => v * s + 'px').join(' ')};border-image:url('file://${f}') ${ins.join(' ')} fill / ${ins.map(v => v * s + 'px').join(' ')} stretch;z-index:${z++}"></div>`);
                } else {
                    out.push(`<img class="sp" data-src="${esc(sf.name)}" src="file://${f}" style="left:${ax}px;top:${ay}px;width:${w}px;height:${h}px;z-index:${z++}">`);
                }
            }
        }
        const l = n.getComponent(Label);
        if (l && l.string) {
            const ha = ['left', 'center', 'right'][l.horizontalAlign] ?? 'left';
            const va = ['flex-start', 'center', 'flex-end'][l.verticalAlign] ?? 'flex-start';
            const ai = ['flex-start', 'center', 'flex-end'][l.horizontalAlign] ?? 'flex-start';
            const wrap = l.overflow === Label.Overflow.RESIZE_HEIGHT || l.enableWrapText;
            out.push(`<div class="lb${wrap ? ' wrap' : ' shrink'}" data-layer="${layer}" data-owner="${esc(owner ?? '')}" data-id="${esc(id)}" data-fs="${l.fontSize * s}" style="left:${ax}px;top:${ay}px;width:${w}px;height:${h}px;` +
                `font-size:${l.fontSize * s}px;line-height:${l.lineHeight * s}px;color:${rgba(l.color)};font-weight:${l.isBold ? 700 : 400};` +
                `justify-content:${va};align-items:${wrap ? 'stretch' : ai};text-align:${ha};z-index:${z++}"><span>${esc(l.string)}</span></div>`);
        }
        for (const c of n.children) {
            const cx = ax + c.position.x * s, cy = ay - c.position.y * s;
            visit(c, cx, cy, s * c.scale.x, id, owner);
        }
    };
    visit(root, 0, 0, 1, '', null);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000;font-family:"Noto Sans CJK SC",sans-serif}
#s{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#222}
#s>*{position:absolute;box-sizing:border-box}
.lb{display:flex;flex-direction:column;white-space:pre-wrap;word-break:break-all}
.lb.shrink{white-space:pre}
.tap{pointer-events:none}
#issues{display:none}
</style></head><body><div id="s">${out.join('\n')}</div><pre id="issues"></pre>
<script>${CHECK_JS.replace('__W__', String(W)).replace('__H__', String(H))}</script></body></html>`;
}

/** 浏览器内的自动检查：结果写进 #issues（JSON） */
const CHECK_JS = `
const W=__W__,H=__H__, issues=[];
const TOP=document.querySelector('[data-layer="overlay"]')?'overlay':'screen';
const onTop=el=>el.dataset.layer===TOP;
const rectOf=el=>{const r=el.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}};
const inter=(a,b)=>{const x=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),y=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));return x*y};
const txt=el=>el.textContent.slice(0,24);
// 1) 单行文字：按 Cocos SHRINK 缩字号，缩到 70% 以下记为问题
for(const el of document.querySelectorAll('.lb.shrink')){
  const span=el.firstChild, box=el.getBoundingClientRect(); let fs=+el.dataset.fs, k=1;
  while((span.getBoundingClientRect().width>box.width+1||span.getBoundingClientRect().height>box.height*1.6)&&fs*k>8){k-=0.04;el.style.fontSize=(fs*k)+'px'}
  if(k<0.7) issues.push({type:'文字被压缩过度',text:txt(el),scale:+k.toFixed(2),id:el.dataset.id});
}
// 2) 换行文字：实际高度超出分配高度
for(const el of document.querySelectorAll('.lb.wrap')){
  const span=el.firstChild, need=span.getBoundingClientRect().height, have=el.getBoundingClientRect().height;
  if(need>have+parseFloat(getComputedStyle(el).lineHeight)*0.6) issues.push({type:'换行文字超出预留高度',text:txt(el),need:Math.round(need),have:Math.round(have),id:el.dataset.id});
}
// 3) 文字之间重叠（用实际字形范围）
const labs=[...document.querySelectorAll('.lb')].filter(onTop).map(el=>({el,r:rectOf(el.firstChild)})).filter(o=>o.r.w>0);
for(let i=0;i<labs.length;i++)for(let j=i+1;j<labs.length;j++){
  const a=labs[i],b=labs[j],o=inter(a.r,b.r); if(o>Math.min(a.r.w*a.r.h,b.r.w*b.r.h)*0.25)
    issues.push({type:'文字重叠',a:txt(a.el.firstChild),b:txt(b.el.firstChild)});
}
// 4) 文字超出屏幕
for(const o of labs){ if(o.r.x<-1||o.r.y<-1||o.r.x+o.r.w>W+1||o.r.y+o.r.h>H+1) issues.push({type:'文字超出屏幕',text:txt(o.el.firstChild),r:o.r}); }
// 5) 可点区域互相重叠（不含遮罩和嵌套）
const taps=[...document.querySelectorAll('.tap')].filter(onTop).map(el=>({id:el.dataset.id,r:rectOf(el)})).filter(t=>!/\\/modal#\\d+$/.test(t.id)&&t.r.w>0);
for(let i=0;i<taps.length;i++)for(let j=i+1;j<taps.length;j++){
  const a=taps[i],b=taps[j]; if(a.id.startsWith(b.id+'/')||b.id.startsWith(a.id+'/')) continue;
  if(inter(a.r,b.r)>Math.min(a.r.w*a.r.h,b.r.w*b.r.h)*0.2) issues.push({type:'点击区重叠',a:a.id.split('/').slice(-2).join('/'),b:b.id.split('/').slice(-2).join('/')});
  if(a.r.y+a.r.h>H+1||a.r.y<-1) issues.push({type:'按钮超出屏幕',id:a.id});
}
// 6) 文字溢出所属按钮
for(const o of labs){ const own=o.el.dataset.owner; if(!own) continue; const t=taps.find(t=>t.id===own); if(!t) continue;
  const r=o.r, b=t.r; if(r.x<b.x-2||r.y<b.y-2||r.x+r.w>b.x+b.w+2||r.y+r.h>b.y+b.h+2) issues.push({type:'文字超出按钮',text:txt(o.el.firstChild),btn:own.split('/').slice(-1)[0]}); }
document.getElementById('issues').textContent=JSON.stringify(issues);
`;
