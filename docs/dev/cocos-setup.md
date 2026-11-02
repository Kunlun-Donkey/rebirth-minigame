# Windows 端接入 Cocos Creator 3.8 并发布微信小游戏

> Linux 端负责写代码、跑测试；Windows 端只做：开工程 → 挂一个组件 → 预览 / 构建。
> 界面全部由代码生成，**不需要在编辑器里拼 UI**。

## 一、建工程（只做一次）

1. Cocos Dashboard → 新建项目 → 选 **3.8.x** 的「Empty (2D)」模板，项目名 `rebirth`。
2. 关掉编辑器，把本仓库的 `assets/` 目录整个复制进新工程，覆盖合并：
   ```
   rebirth/assets/
     resources/data/...      剧本数据（JSON）
     resources/textures/...  美术素材
     scripts/core/...        引擎（纯 TS）
     scripts/game/...        Cocos 表现层
   ```
   其余目录（`docs/ tools/ tests/ typings/ node_modules/` 等）是 Linux 开发用的，不用复制。
3. 重新打开工程，等资源导入完成。

> 之后的同步：只需要用仓库里的 `assets/scripts` 和 `assets/resources` 覆盖工程里的同名目录。
> 以后把 Git 仓库根目录直接设成 Cocos 工程根目录会更省事，`.gitignore` 已经排除了 `library/ temp/ local/ build/`。

## 二、编辑器设置（只做一次）

1. **设计分辨率**：菜单「项目 → 项目设置 → 项目数据」
   - 设计宽度 `750`，设计高度 `1334`
   - 勾选「适配屏幕宽度」，不勾选「适配屏幕高度」
2. **场景**：在 `assets/` 下新建 `scenes/main.scene`，打开它
   - 场景里若没有 Canvas：层级管理器右键 → 创建 → UI 组件 → Canvas
   - 选中 **Canvas** 节点 → 属性检查器底部「添加组件」→ 搜索 `GameRoot` → 添加
   - 保存场景
3. **图片类型**：`resources/textures` 下的图片，属性检查器里 Type 应为 `sprite-frame`（3.8 默认就是）。
4. 点编辑器顶部 ▶ 预览，看到「轮回殿」即成功。

## 三、构建微信小游戏

1. 菜单「项目 → 构建发布」→ 发布平台选「微信小游戏」
2. 初始场景选 `main.scene`，填写 AppID，屏幕方向「竖屏」
3. 构建 → 用微信开发者工具打开 `build/wechatgame`
4. 真机预览：开发者工具「预览」扫码

## 四、上线前要填的配置

`assets/scripts/game/config.ts`：
| 字段 | 说明 |
|---|---|
| `rewardedAdUnitId` | 激励视频广告位 id（微信公众平台 → 流量主 → 广告位）。**为空时广告走 Mock，直接视为看完**，方便测试 |
| `saveKey` | 存档 key，存档结构不兼容时升级版本号 |
| `safeTop` | 顶部安全区高度（微信右上角胶囊按钮），默认 96 |

埋点事件（`Platform.report`）：`start_life`、`life_end`、`ad_reward`、`ad_cancel`，需要在 We 分析后台注册，见 `minigame-event-report` skill。

## 五、广告点位一览

| 位置 | 文案 | 频控 |
|---|---|---|
| 濒死弹窗 | 看视频 · 逆天改命 | 每局 1 次 |
| 轮回殿抽卡 | 天机重演 · 看视频刷新这一组 | 每次开局 1 次 |
| 事件卡右下角 | 窥探天命 · 看视频（n/3） | 每局 3 次 |
| 结算页 | 看视频 · 轮回点翻倍 | 每局 1 次 |

## 六、美术素材接入

代码按下面的路径加载贴图（不带扩展名，`.png/.jpg` 都可以），**缺图时自动用纸张风格兜底，不会报错**：

| 用途 | 路径（resources 下） |
|---|---|
目录规范与 `docs/art/ai-image-prompts.md` §七 一致：**通用层**任何命格共用，**命格层**同名文件优先。

| 用途 | 路径（resources 下） | 显示方式 |
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

（以上路径都省略了前缀 `textures/`。）
- **比例保护**：贴图宽高比和显示区域差太多会自动跳过，换下一个候选；全部不可用时用纸张风格兜底。
- 路径统一定义在 `assets/scripts/game/config.ts` 的 `TEX`，改目录只需改那里。
- 新命格最少只需 3 张：`main_bg`、`settle_bg`、`settle_bg_ending`；剧本数据里给死法 / 技能 / 道具 / 天赋写好 `icon` 字段即可复用通用图标。

## 七、排错

| 现象 | 原因 / 处理 |
|---|---|
| 预览黑屏，控制台「剧本加载失败」 | `resources/data` 没复制进工程，或 JSON 有语法错误（Linux 端先跑 `npm run validate`） |
| 界面偏移 / 被裁切 | 设计分辨率没按第二节设置 |
| 看不到任何界面 | `GameRoot` 没挂在 Canvas 上，或 Canvas 不在场景里 |
| 贴图不显示 | 图片 Type 不是 `sprite-frame`，或路径和上表不一致 |
| 编辑器报 `cc` 某 API 不存在 | Linux 端的 `typings/cc-shim.d.ts` 与真实 API 不一致，把报错发回来修 |
