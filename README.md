# 这一世我重生了

微信小游戏 · 文字交互 + 轮回 Roguelite · Cocos Creator 3.8 · TypeScript · 竖屏 2D

世间最不起眼的小生灵——荒漠里的一颗草籽、村口的一只土狗、菜园里的一条毛毛虫、海边的一只皮皮虾、河滩上的一条鳄鱼，还有一个普通打工人——在轮回殿里一次次重生。每一季选一个方向，遇到一件事，做一个选择。大多数时候这一世会结束，但每一种结束方式都会变成下一世的本事。

## 特色
- **六个命格**：荒漠一株草、一个打工人默认开放；一只土狗、一条毛毛虫、一只皮皮虾、一条鳄鱼游玩解锁。各有独立的属性、境界、出生地、伙伴与结局（打工人 41 个，其余各 6~7 个）
- **死法即传承**：每种结束方式对应一项永久传承，部分区域「第一次去必死，死过才有通行证」
- **前世记忆与技能**：前世选过的选项会标注结果；死亡、选择、突破都可能领悟技能，开局带三个
- **故事线（打工人）**：39 条人物与职业故事线、交叉事件、6 种职业、12 个系统金手指，图鉴里能看到每条线走到过的结果
- **局外成长**：命盘、每日天命、随缘投胎、图鉴墙（结局 / 死法 / 故事 / 技能 / 道具 / 彩蛋 / 恩怨）
- **分享**：现画墓志铭卡，好友点进来可以接挑战，用同一命格比谁更快
- 单机、无内购；送审版本无广告（激励视频开关 `CONFIG.adsEnabled`）

## 开发
```bash
npm install
npm run play          # 终端试玩（-- --new 清档，-- --destiny <id> 指定命格）
npm test              # 单元测试 + 剧本冒烟 + 游戏层无头冒烟 + 主包体积
npm run typecheck     # 核心层 + 游戏层类型检查
npm run validate      # 剧本静态校验
npm run sim           # 随机 AI 2000 世数值统计（-- --destiny worker 只跑一个）
npm run lines worker  # 打印线路图
npm run rarity        # 重算结局 / 死法稀有度表
npm run ui:snap       # UI 巡检：全部页面截图 + 自动检查溢出 / 重叠 / 越界
npm run art           # 程序化生成通用贴图；npm run art:check 贴图体检
npm run audio         # 程序合成 BGM / 音效；npm run share 生成分享图
```
- 引擎（纯 TS，不依赖 cc，可在 Node 中运行）：`assets/scripts/core/`
- Cocos 表现层（UI 全部代码生成）：`assets/scripts/game/`
- 剧本数据：默认开放命格在 `assets/resources/data/destinies/`（主包），游玩解锁命格在 `assets/subres/data/destinies/`（分包）
- 接入 Cocos Creator 与发布微信小游戏：[docs/dev/cocos-setup.md](docs/dev/cocos-setup.md)
- 上线前检查清单：[docs/dev/launch-checklist.md](docs/dev/launch-checklist.md)
- 设计文档：[docs/design/](docs/design/) · 剧本写作规范：[.claude/skills/rebirth-content/SKILL.md](.claude/skills/rebirth-content/SKILL.md)
- 备案材料：[docs/filing/game-filing.md](docs/filing/game-filing.md)

## 第三方内容
`.claude/skills/` 下的部分 skill 来自开源项目（MIT 许可，见各目录内 LICENSE）：
weixin-game-skill（wukaikailive）、cocos-creator-dev-skill（Dailiduzhou）、minigame-event-report（helloworldtang）、story-deslop（oh-story-claudecode）。
