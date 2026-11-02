/**
 * 入口组件：挂在场景的 Canvas 节点上即可，界面全部由代码生成。
 */
import { _decorator, Component } from 'cc';
import { Game } from './game';

const { ccclass } = _decorator;

@ccclass('GameRoot')
export class GameRoot extends Component {
    start(): void {
        new Game(this.node).boot().catch(e => console.error('[GameRoot] 启动失败', e));
    }
}
