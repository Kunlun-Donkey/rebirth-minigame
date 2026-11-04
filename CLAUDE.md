# 这一世我重生了（微信小游戏）

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
- `npm run rarity` — 40 种子 × 100 世模拟，生成 `data/destinies/rarity.json`（死法/结局每千世出现次数）；改剧本或数值后重跑，结算页与分享卡的稀有度读它
- 广告总开关 `game/config.ts` 的 `CONFIG.adsEnabled`：广告审核通过前为 false（所有看视频入口隐藏，濒死只能接受命运）；通过后填 `rewardedAdUnitId` 并改为 true
- `npm run play` — 终端试玩（`-- --new` 清档，开局选命格，`-- --destiny <id>` 直接指定）；Windows 双击根目录 `play.bat`：bat 只放纯 ASCII（cmd 读 UTF-8 中文会乱码切行），中文菜单在 `tools/menu.mjs`（首次自动 npm install，用 node 直接启动 tsx）；bat 须保持 CRLF（`.gitattributes`）
- `npm run sim` — 随机 AI 2000 世数值统计（依次模拟全部命格；`-- --destiny local_dog` 只模拟一个）
- `npm run persona` — 多画像试玩（小白 / 稳健 / 冒险 / 剧情党 / 速通 × 60 世 × 3 种子）：新鲜感（新事件占比、同世重复、开局雷同）、天胡（天命之子 / 天胡结局 / 首次世数）、结算（结局与死法种类、最常见结果）；改剧本或抽取逻辑后看它
- `npm run story -- <命格> [第几世] [种子]` — 真人视角读一世（全部事件、选项、结果、墓志铭），找文案串台（职业 / 出生地）和重复
- `npm run share:snap` — 用真实结算数据画分享卡并截图到 `/tmp/share-snap/cards.png`
- `npm run audio` — 程序合成 BGM/音效 → `assets/subres/audio/`（曲谱与音色在 `tools/audio/gen_audio.py`，依赖本机 godot skill 的合成器 + ffmpeg）

## 结构
- `assets/scripts/core/` 引擎：`types` · `condition` 条件 DSL · `data` 剧本归一化 · `engine` 局内状态机 + 局外命盘/每日天命 · `profile` 局外存档 · `destinies` 多命格解锁 · `rng`
  - **引擎不认识任何具体属性名**：生命/成长货币/每季回复与产出/饿死渴死/寿终都由 destiny.json 的 `rules` 指定；HUD 读 `attrs[]` 的 `short/color/desc/stat`
  - 多命格并列可选：`data/destinies/index.json` 登记命格与解锁条件（`unlock.bestStage/lives/endings`），玩家选择记在 `profile.current`；轮回点全局通用，传承/技能/命盘按命格独立
  - 当前 6 个命格：荒漠一株草、一个打工人（默认开放）→ 一条毛毛虫（草到嫩芽）/ 一只土狗（草到小草）→ 一只皮皮虾（狗到土狗）→ 一条鳄鱼（虾到拳虾）；设计文档 `docs/design/0{1..6}-*.md`
  - **线路架构**（打工人起使用，所有命格可用）：`lines/*.json` 一条故事一个文件（事件 id / flag 自动加「线路id/」命名空间，`entry` 入口、`states` 导出状态、效果 `state`、条件 `line:线路.状态` / `ever:线路.状态`），`crossings/*.json` 交叉事件只引用导出状态；`npm run lines <命格>` 打印线路图，`npm run sim` 输出线路进入率；写法见 `docs/design/06-worker-lines-brief.md`
  - **职业**（打工人起使用）：destiny.json `careers`（层名覆盖 / 开局效果 / mods / `title` 填进 dirPrompt 的 `{career}`），`rules.careerEvent` = 第 1 季开头强制的择业事件（选项效果 `career: id`，中途转行同样用这个效果）；事件 / 线路 `careers: [...]` 限定职业（每个职业×方向都要有兜底事件，validate 会查），条件 `career:x|any` / `pastcareer:x`（之前某世干过）；地图 `dominant: true` 时层名以地图为准
  - 系统（金手指）= companions 里 `system: true` 的条目，不进开局池，事件效果 `bind` / `unbind` / `keepSystem`（认主后每世自动绑定），条件 `system:any|id`；境界 `oldAgeEndings` = 寿终时满足条件判为结局（如「平凡一生」）
  - 随机出生地图：destiny.json 的 `maps`（每世按 weight 随机，可覆盖层名/旁白、开局效果、mods），事件用 `maps: [...]` 限定地图；`engine.mapDef()/layerName()` 取显示名，兜底事件不能带 maps
  - 重生不限次数；命盘（destiny.json `upgrades`）只放大广告收益、**不提供免费复活/窥探等替代广告的效果**；改价格后用 `npm run sim`（含 `-- --ads`）看全满世数（设计文档 §6.4.2）
- `assets/scripts/game/` Cocos 表现层（UI 全部代码生成，入口 `GameRoot` 挂 Canvas）
  - 传播：`brag.ts`（纯逻辑：分享 query 编解码、称号「第 8 世被骆驼吃掉的草」、稀有度）· `screens/challenge.ts` 好友挑战（好友点分享卡进来先看 TA 的这一世，「我也投一次胎」可试玩未解锁命格一世，结算页对比胜负）· 好友榜：`Platform.reportScore` 写托管数据 + `build-templates/wechatgame/openDataContext/index.js` 开放数据域绘制 + `screens/rank.ts`（SubContextView），`CONFIG.rankEnabled` 默认关，接入见 `docs/dev/rank-setup.md`
  - `game.ts` 控制器（界面切换、存档、广告点位）· `config.ts` 配置与贴图路径 `TEX` · `platform.ts` wx 适配（存档/激励视频/分享/埋点，非微信环境自动 Mock）· `loader.ts` · `save.ts`
  - `res.ts` 资源分包：路径在主包 `resources` 找不到就等分包 `subres`（主界面出来后后台下载，点「重生」前确保就绪）
  - `ui/kit.ts` 代码 UI 工具包（左上角坐标系、纸张卡、按钮、弹窗、缺图兜底）
  - `audio.ts` 背景音乐/音效/静音（点击音效经 `kit.setTapFeedback` 注入）
  - `screens/` splash 启动页 · menu 主菜单（继续/开始轮回/选择命格/声音，与启动页共用标题底板） · draft 轮回殿 · destiny 命格选择（含「随缘投胎」转盘：每天首次免费、之后看视频，转出的命格本世轮回点 +30%；新命格解锁也用转盘揭晓） · run 局内 · settle 结算（分享用 `sharecard.ts` 现画墓志铭卡，微信 `wx.createCanvas` → 临时图，失败回退静态分享图） · codex 图鉴墙（主菜单进入：结局/死法/故事/技能/道具/彩蛋/恩怨，空页签自动隐藏，未收集显示剪影） · popups 弹窗；轮回殿在本命格第一世显示「天道替你抓了三样」一键开局页
  - `TEX` 的命格层贴图按当前命格取路径（`setTexDestiny`），缺图一律文字/纸张兜底；新命格的美术需求写在 `docs/art/requests-<id>.md`
- `assets/resources/`（主包，≈1.6MB，`npm test` 限 2.2MB——微信主包 4MB 含引擎代码）：`data/destinies/index.json` 命格索引 + `rarity.json` + **默认开放命格**（荒漠一株草、打工人）的剧本 + 首屏图（这两个命格的 main_bg、logo_title、btn_*、panel）
- `assets/subres/`（微信分包，bundle 名 subres）：**游玩解锁命格**的剧本 `data/destinies/<命格>/` 与 main_bg、其余 `textures/`、全部 `audio/`，目录结构与 resources 一致；**新素材、新命格剧本默认放这里**（`loader.ts` / `tools/load.ts` 两边都会找）
- 上线清单：`docs/dev/launch-checklist.md`（资质、包体、开关、埋点注册）
- `tools/` Node 端加载、校验、试玩、模拟；`tests/fake-cc.ts` 测试用假 cc
- `docs/design/` 设计 · `docs/art/` 生图提示词 · `docs/filing/` 备案材料与界面原型 · `docs/dev/` 接入文档

## 约定
- **开发不管的目录**：`ai-tool-tests/`（以及根目录的 `opus_*.svg` 等 AI 工具测试文件）与本项目无关，由用户单独管理和提交——不读、不改、不删、不随本项目提交（`git add` 只加具体路径）
- 写剧本内容遵循 `.claude/skills/rebirth-content/SKILL.md`
- 游戏层新用到 cc API 时，同步补 `typings/cc-shim.d.ts` 和 `tests/fake-cc.ts`
- 游戏代码避免 ES2021+ 语法（如 `??=`），兼容老版本微信
- `assets/` 下的 `.meta` 由 Cocos 生成，要提交；`GameRoot.ts.meta` 的 uuid 被 main.scene 引用，不要改
- UI 风格以 `docs/filing/mock/style.css` 为准（颜色常量在 `ui/kit.ts` 的 `COLOR`）
- 改动后跑 `npm run typecheck && npm test && npm run validate`
