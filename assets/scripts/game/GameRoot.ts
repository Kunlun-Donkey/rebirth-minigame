/**
 * 入口组件：挂在场景的 Canvas 节点上（assets/scenes/main.scene 已挂好），界面全部由代码生成。
 * 兜底：若场景里的组件绑定丢失，场景启动后会自动在 Canvas 上补挂 GameRoot。
 */
import { _decorator, Canvas, Component, director, Director } from 'cc';
import { Game } from './game';

const { ccclass } = _decorator;
let booted = false;

@ccclass('GameRoot')
export class GameRoot extends Component {
    start(): void {
        if (booted) return;
        booted = true;
        new Game(this.node).boot().catch(e => console.error('[GameRoot] 启动失败', e));
    }
}

director.once(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
    const canvas = director.getScene()?.getComponentInChildren(Canvas);
    if (!canvas) {
        console.error('[GameRoot] 场景中没有 Canvas，无法启动游戏');
        return;
    }
    if (!canvas.node.getComponent(GameRoot)) {
        console.warn('[GameRoot] Canvas 上未挂 GameRoot，已自动补挂');
        canvas.node.addComponent(GameRoot);
    }
});
