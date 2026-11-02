# 我重生了，这一世我将拿回属于我的一切（微信小游戏）

文字交互 + 轮回 Roguelite。Cocos Creator 3.8.x · TypeScript · 2D 竖屏 · 仅激励视频变现。

## 开发环境
- 仓库本身就是 Cocos Creator 3.8 工程（package.json 的 creator 字段、settings/v2、assets/scenes/main.scene 已挂 GameRoot）
- Linux 写代码 / 跑测试 → GitHub → Windows 上 Cocos 打开、构建微信小游戏、开发者工具截图（步骤：`docs/dev/cocos-setup.md`）
- Linux 无 Cocos 编辑器：**核心逻辑必须是纯 TS（不 import 'cc'）**，放在 `assets/scripts/core/`
- 系统 `npx` 已损坏，用 `npm run <script>` 或 `./node_modules/.bin/<bin>`

## 命令
- `npm test` — vitest：条件 DSL、引擎、剧本 300 世冒烟、**游戏层冒烟**（假 cc 运行时随机点击 3000 次 × 3 种子，含屏幕越界检查）
- `npm run typecheck` — tsc：核心层（tsconfig.tools.json）+ 游戏层（tsconfig.game.json，用 `typings/cc-shim.d.ts`）
- 根目录 `tsconfig.json` 是 Cocos 的（继承 temp/tsconfig.cocos.json）；Linux 端由 `tools/ensure-cocos-temp.mjs`（npm pre 钩子）生成占位 temp 文件
- package.json 的 `"type": "2d"` 是 Cocos 要求的，Node 会按 ESM 处理工具脚本：不要用 `__dirname`，用 `import.meta.url`
- `npm run validate` — 剧本静态校验
- `npm run play` — 终端试玩（`-- --new` 清档，开局选命格，`-- --destiny <id>` 直接指定）；Windows 双击根目录 `play.bat`：bat 只放纯 ASCII（cmd 读 UTF-8 中文会乱码切行），中文菜单在 `tools/menu.mjs`（首次自动 npm install，用 node 直接启动 tsx）；bat 须保持 CRLF（`.gitattributes`）
- `npm run sim` — 随机 AI 2000 世数值统计（依次模拟全部命格；`-- --destiny local_dog` 只模拟一个）
- `npm run audio` — 程序合成 BGM/音效 → `assets/subres/audio/`（曲谱与音色在 `tools/audio/gen_audio.py`，依赖本机 godot skill 的合成器 + ffmpeg）

## 结构
- `assets/scripts/core/` 引擎：`types` · `condition` 条件 DSL · `data` 剧本归一化 · `engine` 局内状态机 + 局外命盘/每日天命 · `profile` 局外存档 · `destinies` 多命格解锁 · `rng`
  - **引擎不认识任何具体属性名**：生命/成长货币/每季回复与产出/饿死渴死/寿终都由 destiny.json 的 `rules` 指定；HUD 读 `attrs[]` 的 `short/color/desc/stat`
  - 多命格并列可选：`data/destinies/index.json` 登记命格与解锁条件（`unlock.bestStage/lives/endings`），玩家选择记在 `profile.current`；轮回点全局通用，传承/技能/命盘按命格独立
  - 当前 4 个命格：荒漠一株草（默认）→ 一条毛毛虫（草到嫩芽）/ 一只土狗（草到小草）→ 一只皮皮虾（狗到土狗）；设计文档 `docs/design/0{1..4}-*.md`
  - 随机出生地图：destiny.json 的 `maps`（每世按 weight 随机，可覆盖层名/旁白、开局效果、mods），事件用 `maps: [...]` 限定地图；`engine.mapDef()/layerName()` 取显示名，兜底事件不能带 maps
  - 重生不限次数；命盘（destiny.json `upgrades`）只放大广告收益、**不提供免费复活/窥探等替代广告的效果**；改价格后用 `npm run sim`（含 `-- --ads`）看全满世数（设计文档 §6.4.2）
- `assets/scripts/game/` Cocos 表现层（UI 全部代码生成，入口 `GameRoot` 挂 Canvas）
  - `game.ts` 控制器（界面切换、存档、广告点位）· `config.ts` 配置与贴图路径 `TEX` · `platform.ts` wx 适配（存档/激励视频/分享/埋点，非微信环境自动 Mock）· `loader.ts` · `save.ts`
  - `res.ts` 资源分包：路径在主包 `resources` 找不到就等分包 `subres`（主界面出来后后台下载，点「重生」前确保就绪）
  - `ui/kit.ts` 代码 UI 工具包（左上角坐标系、纸张卡、按钮、弹窗、缺图兜底）
  - `audio.ts` 背景音乐/音效/静音（点击音效经 `kit.setTapFeedback` 注入）
  - `screens/` draft 轮回殿 · destiny 命格选择 · run 局内 · settle 结算 · popups 弹窗
  - `TEX` 的命格层贴图按当前命格取路径（`setTexDestiny`），缺图一律文字/纸张兜底；新命格的美术需求写在 `docs/art/requests-<id>.md`
- `assets/resources/`（主包，≈0.5MB）：`data/destinies/index.json` 命格索引 + `data/destinies/<命格>/` 剧本数据 + 首屏图（main_bg、logo_title、btn_*、panel）
- `assets/subres/`（微信分包，bundle 名 subres）：其余 `textures/` 与全部 `audio/`，目录结构与 resources 一致；**新素材默认放这里**
- `tools/` Node 端加载、校验、试玩、模拟；`tests/fake-cc.ts` 测试用假 cc
- `docs/design/` 设计 · `docs/art/` 生图提示词 · `docs/filing/` 备案材料与界面原型 · `docs/dev/` 接入文档

## 约定
- 写剧本内容遵循 `.claude/skills/rebirth-content/SKILL.md`
- 游戏层新用到 cc API 时，同步补 `typings/cc-shim.d.ts` 和 `tests/fake-cc.ts`
- 游戏代码避免 ES2021+ 语法（如 `??=`），兼容老版本微信
- `assets/` 下的 `.meta` 由 Cocos 生成，要提交；`GameRoot.ts.meta` 的 uuid 被 main.scene 引用，不要改
- UI 风格以 `docs/filing/mock/style.css` 为准（颜色常量在 `ui/kit.ts` 的 `COLOR`）
- 改动后跑 `npm run typecheck && npm test && npm run validate`
