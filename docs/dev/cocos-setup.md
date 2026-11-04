# Windows：用 Cocos Creator 打开工程 → 构建微信小游戏 → 开发者工具截图

> 本仓库**本身就是一个 Cocos Creator 3.8 工程**：clone 下来直接用 Dashboard 打开即可。
> 界面全部由代码生成，启动场景 `assets/scenes/main.scene` 已经挂好入口组件 `GameRoot`。

## 一、准备

| 软件 | 版本 |
|---|---|
| Cocos Dashboard + Cocos Creator | 3.8.x（工程按 3.8.0 创建，更高的 3.8 小版本打开时会提示升级，点确定即可） |
| 微信开发者工具 | 稳定版最新 |
| Git | 任意 |

## 二、打开工程（只做一次）

```bash
git clone https://github.com/Kunlun-Donkey/rebirth-minigame.git
```
1. Cocos Dashboard → 项目 → **添加** → 选择 `rebirth-minigame` 文件夹 → 打开。
2. 首次打开会导入全部资源并生成 `library/ temp/` 和各文件的 `.meta`（约 1~2 分钟）。
3. 资源管理器里双击 `assets/scenes/main.scene` 打开场景。
4. 点编辑器顶部 **▶ 预览**（浏览器预览），看到「轮回殿」即成功。

> 首次打开后会多出很多 `.meta` 文件，**请提交到 Git**（Cocos 用它们记录资源 uuid，丢了会导致引用失效）：
> `git add -A && git commit -m "Cocos 首次导入生成 meta" && git push`

已预设好的项目设置（一般不用改，可在「项目 → 项目设置」核对）：
- 设计分辨率 **750 × 1334**，适配屏幕宽度 ✔，适配屏幕高度 ✘
- 功能裁剪：只保留 2D / UI / Graphics / Tween / WebGL（3D、物理、粒子等已关闭，减小包体）

## 三、资源分包（主包 4MB 上限）

资源分两个 bundle，两边目录结构相同（`textures/…`、`audio/…`），代码按路径自动找：

| 目录 | 内容 | 微信平台设置 |
|---|---|---|
| `assets/resources` | 命格索引 `index.json`、稀有度表 `rarity.json`、**默认开放命格**（荒漠一株草、一个打工人）的剧本与 `main_bg`，以及 `logo_title`、`btn_*`、`panel`，约 1.6MB | **主包**（压缩类型「合并依赖」或默认，**不要**勾小游戏子包） |
| `assets/subres` | **游玩解锁命格**（土狗、毛毛虫、皮皮虾、鳄鱼）的剧本与 `main_bg`、其余贴图、全部音频，约 8MB | **小游戏子包**（`assets/subres.meta` 已预设，bundle 名 `subres`） |

> **主包预算**：微信主包上限 4MB，Cocos 3.8 的引擎代码（即使勾选「分离引擎 / 引擎插件」）也计入主包，2D 裁剪后约 1.5~2MB。所以 `assets/resources` 控制在 **2.2MB 以内**（`npm test` 的「主包体积」用例会拦）。新命格的剧本、新贴图默认放分包；只有默认开放的命格放主包。构建后在开发者工具「详情 → 基本信息 → 代码包大小」核对主包实际大小。

- 启动时只加载主包，主界面（轮回殿）出来后后台下载 `subres`；分包没下完时，卡框、图标等用纸张兜底，下完后自动显示。
- 上次玩的是解锁命格（剧本在分包）时，启动页会多等分包下载完再进主菜单；切换到解锁命格、接好友挑战同理（`loader.ts` 按 bundle 查找剧本）。
- 点「重生」时如果分包还没下完，会显示「正在加载资源……」等待；下载失败也会放行（缺图兜底、无声）。
- 核对：资源管理器选中 `assets/subres` → 属性检查器「配置为 Bundle」✔、Bundle 名称 `subres`、**小游戏**平台「压缩类型 → 小游戏子包」→「应用」。
- 新增首屏图时放 `assets/resources`，其余一律放 `assets/subres`（`tools/art/gen-art.mjs` 的 `MAIN_FILES` 决定生成到哪边）。

## 四、构建微信小游戏

1. 菜单 **项目 → 构建发布**
2. 发布平台：**微信小游戏**
3. 初始场景：`db://assets/scenes/main.scene`（勾选参与构建的场景只需这一个）
4. AppID：填你注册的小游戏 AppID（没有可先填测试号，见下文）
5. 设备方向：**Portrait（竖屏）**
6. 点「构建」→ 完成后点「运行」或手动用开发者工具打开 `build/wechatgame`

## 五、在微信开发者工具里截图（备案用）

1. 微信开发者工具 → 导入项目 → 目录选 `build/wechatgame`，AppID 同上 → 打开
2. 模拟器机型选 **iPhone 6/7/8（375×667）** 或 **iPhone X 系列**，竖屏
3. 在模拟器里玩到需要的画面：

| # | 画面 | 怎么到达 |
|---|---|---|
| 1 | 开局抽卡（轮回殿） | 启动后的第一个界面 |
| 2 | 方向选择 | 抽完三张卡点「重生」 |
| 3 | 事件 + 选项 | 选一个方向 |
| 4 | 境界突破 | 嫩芽通常在第 2 季突破，会弹出突破弹窗 |
| 5 | 轮回结算 | 一世结束后（可在濒死弹窗点「接受命运」） |

4. 截图：模拟器上方工具栏的**截图按钮**，或 Windows 自带截图（Win + Shift + S）只框选模拟器画面。
5. 需要带名称的截图：点模拟器右上角胶囊「···」，面板顶部会显示小游戏名称和头像。

> 正式 AppID + 公众平台已填名称/图标时，模拟器和真机的启动加载页、菜单面板都会显示正式名称；测试号显示的不是正式名称。

## 六、上线前要填的配置

`assets/scripts/game/config.ts`：
| 字段 | 说明 |
|---|---|
| `adsEnabled` | **激励视频总开关**，送审版本为 `false`（所有看视频入口隐藏）。流量主开通、广告位审核通过、备案内容介绍补上广告系统后再改 `true` |
| `rewardedAdUnitId` | 激励视频广告位 id。**为空时广告走 Mock（直接视为看完）**，方便测试和截图；`adsEnabled` 改 true 前必须填 |
| `rankEnabled` | 好友排行榜开关，默认 `false`；Windows 上建好开放数据域并验证后再开（见 `docs/dev/rank-setup.md`），打开前先在后台《用户隐私保护指引》声明「微信朋友关系」，并补备案描述与截图 |
| `defaultDestiny` | 新存档默认命格（`desert_grass`），须是默认开放、剧本在主包的命格 |
| `saveKey` | 存档 key，存档结构不兼容时升级版本号 |
| `safeTop` | 顶部安全区（微信右上角胶囊），默认 96 |
| `ageRating` | 适龄提示（16），须与公众平台「基础设置 → 适龄提示」一致 |
| `peekPerRun` / `splashMs` | 每局窥探天命次数 / 启动页最短停留毫秒数 |

### 埋点（`Platform.report` → `wx.reportEvent`）

**全部事件都要在 We分析 后台先注册**，否则调用静默失败、没有数据（注册流程见 `minigame-event-report` skill）。属性值都是 string 或 number。

| 事件 | 触发 | 属性 |
|---|---|---|
| `start_life` | 点「重生」开始一世 | `life` 世数、`talent` 天赋 id、`map` 出生地 id |
| `life_end` | 一世结束进结算 | `kind`（death / ending）、`cause` 死法或结局 id、`seasons` 季数、`stage` 境界 |
| `abandon_life` | 主菜单「重新投胎」放弃本世 | `life`、`season` |
| `blessed` | 开局成为天命之子 | `life` |
| `switch_destiny` | 轮回殿切换命格 | `id` 命格 id |
| `spin_destiny` | 随缘投胎转出命格 | `id` |
| `upgrade_buy` | 命盘升级 | `id`、`level` |
| `share_life` | 结算页「分享墓志铭」 | `kind`、`cause` |
| `challenge_open` | 好友从分享卡进入，弹出 TA 的这一世 | `destiny`、`kind` |
| `challenge_accept` | 接受好友挑战 | `destiny` |
| `ad_reward` / `ad_cancel` | 激励视频看完 / 中途关闭（广告开通后才有） | `scene`：revive / reroll / peek / double_points / swap_fate / spin_destiny |

属性类型：`life`、`season`、`seasons`、`stage`、`level` 选**数值**，其余（`talent`、`map`、`kind`、`cause`、`id`、`destiny`、`scene`）选**字符串**；属性 ID 与代码逐字一致，建好后不可改。

## 七、广告点位

| 位置 | 文案 | 频控 |
|---|---|---|
| 濒死弹窗 | 看视频 · 逆天改命 | 每局 1 次 |
| 轮回殿抽卡 | 天机重演 · 看视频刷新这一组（命盘·天机的免费次数用完后出现） | 每次开局 1 次 |
| 事件卡右下角 | 窥探天命 · 看视频（n/3） | 每局 3 次 |
| 结算页 | 看视频 · 轮回点翻倍 | 每局 1 次 |
| 轮回殿「今日天命」弹窗 | 看视频 · 换一个天命 | 每天 1 次 |
| 命格选择「随缘投胎」 | 看视频 · 再转一次（每天首次免费） | 不限 |

以上入口全部受 `CONFIG.adsEnabled` 控制，送审版本一个都不显示。

## 八、美术素材接入

目录规范与 `docs/art/ai-image-prompts.md` §七 一致：**通用层**任何命格共用，**命格层**同名文件优先。

| 用途 | 路径（`textures/` 下；首屏图在 `assets/resources/`，其余在 `assets/subres/`） | 显示方式 |
|---|---|---|
| 主界面背景（轮回殿 / 局内） | `destiny/<命格>/main_bg` | cover 等比铺满 |
| 结算背景 | `destiny/<命格>/settle_bg`、`settle_bg_ending` | cover 等比铺满 |
| 结算面板 | `common/ui/settle_panel`（命格版优先） | 九宫格 上350 右280 下360 左280，按 0.36 显示 |
| 事件卡 | `common/ui/event_card`、`event_card_gold`、`event_card_sudden` | 拉伸 |
| 墓志铭卡 / 结局卡 | `common/ui/epitaph_card`、`ending_card`（命格版优先） | 3:2，比例不合自动跳过 |
| 抽卡卡框 | `common/frame/frame_{common|rare|epic|legend}` + 徽记 `badge_{talent|item|companion|skill}` | |
| 天赋 / 道具 / 死法 / 技能图标 | `common/icon/{talent|item|death|skill}_{icon}` | `icon` 取自剧本数据 |
| 伙伴头像（可选） | `destiny/<命格>/companion_{id}` | |
| 境界形象（可选） | `destiny/<命格>/stage_{1..5}`，缺省回落 `common/fx/fx_breakthrough` | |
| 适龄提示 | `common/ui/age_16`（主包；放中国音数协官方标识图，缺图时代码画兜底） | |

- 缺图 / 比例不合时自动换下一个候选，全部不可用时用纸张风格兜底，不报错。
- 图片导入类型无论是 sprite-frame 还是 texture 都能加载（代码会自动兜底）。
- 路径统一定义在 `assets/scripts/game/config.ts` 的 `TEX`。
- 大图建议压缩：`ending_card.png`（730KB）、`settle_panel.png`（590KB）可用 TinyPNG 或转 JPG。

## 九、排错

| 现象 | 原因 / 处理 |
|---|---|
| 预览只有沙色背景、控制台「剧本加载失败」 | `assets/resources/data` 或 `assets/subres/data` 缺失、JSON 语法错误（Linux 端 `npm run validate`），或 `subres` 没配置成 Bundle（解锁命格的剧本在分包） |
| 控制台「Canvas 上未挂 GameRoot，已自动补挂」 | 场景里的组件绑定丢了，代码已自动兜底，可忽略；也可在 Canvas 上手动重新添加 `GameRoot` |
| 预览黑屏 / 什么都没有 | 打开的不是 `main.scene`；或构建时初始场景没选 `main.scene` |
| 界面偏移、被裁切 | 项目设置的设计分辨率不是 750×1334 适配宽度 |
| 构建报「主包超过 4M」 | 第三节的子包没配置；或功能裁剪没关掉 3D / 物理等模块（项目设置 → 功能裁剪） |
| 编辑器报 `cc` 某个 API 不存在 / 类型不对 | Linux 端的 `typings/cc-shim.d.ts` 与真实 API 有出入：**把完整报错发回来修** |
| VSCode 里大量 `cc` 类型报错 | 先用 Cocos 打开一次工程生成 `temp/declarations`；`typings/` 已被根 tsconfig 排除 |
