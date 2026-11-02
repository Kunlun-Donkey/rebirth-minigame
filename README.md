# 我重生了，这一世我将拿回属于我的一切

微信小游戏 · 文字交互 + 轮回 Roguelite · Cocos Creator 3.8 · TypeScript · 竖屏 2D

首个命格《荒漠一株草》：你是荒漠里的一颗草籽，每一季选择向上生长、向下扎根或向旁蔓延。大多数时候你会死——渴死、被骆驼吃掉、被岩浆烤成草干——但每一种死法都会刻进种子里，成为下一世的传承。千百次轮回之后，荒漠会长出一棵树。

## 特色
- **死法即传承**：13 种死法各自对应永久特性，部分区域「第一次去必死，死过才有通行证」
- **前世记忆**：前世选过的选项会标注当时的结果
- **技能领悟**：死亡、做出选择、境界突破都可能领悟技能，并在对应事件中出现专属选项
- **开局三池**：天赋 / 道具 / 伙伴各 3 选 1
- 无内购，仅激励视频（自愿观看）

## 开发
```bash
npm install
npm run play        # 终端试玩
npm test            # 单元测试 + 游戏层无头冒烟测试
npm run typecheck   # 核心层 + 游戏层类型检查
npm run validate    # 剧本校验
npm run sim         # 数值模拟
```
- 引擎（纯 TS，可在 Node 中运行）：`assets/scripts/core/`
- Cocos 表现层（UI 全部代码生成）：`assets/scripts/game/`
- 剧本数据：`assets/resources/data/destinies/`
- 接入 Cocos Creator 与发布微信小游戏：[docs/dev/cocos-setup.md](docs/dev/cocos-setup.md)
- 设计文档：[docs/design/](docs/design/)

## 第三方内容
`.claude/skills/` 下的部分 skill 来自开源项目（MIT 许可，见各目录内 LICENSE）：
weixin-game-skill（wukaikailive）、cocos-creator-dev-skill（Dailiduzhou）、minigame-event-report（helloworldtang）、story-deslop（oh-story-claudecode）。
