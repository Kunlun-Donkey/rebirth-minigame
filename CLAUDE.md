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
- `npm run play` — 终端试玩（`-- --new` 清档）
- `npm run sim` — 随机 AI 2000 世数值统计
- `npm run audio` — 程序合成 BGM/音效 → `assets/subres/audio/`（曲谱与音色在 `tools/audio/gen_audio.py`，依赖本机 godot skill 的合成器 + ffmpeg）

## 结构
- `assets/scripts/core/` 引擎：`types` · `condition` 条件 DSL · `data` 剧本归一化 · `engine` 局内状态机 · `profile` 局外存档 · `rng`
- `assets/scripts/game/` Cocos 表现层（UI 全部代码生成，入口 `GameRoot` 挂 Canvas）
  - `game.ts` 控制器（界面切换、存档、广告点位）· `config.ts` 配置与贴图路径 `TEX` · `platform.ts` wx 适配（存档/激励视频/分享/埋点，非微信环境自动 Mock）· `loader.ts` · `save.ts`
  - `res.ts` 资源分包：路径在主包 `resources` 找不到就等分包 `subres`（主界面出来后后台下载，点「重生」前确保就绪）
  - `ui/kit.ts` 代码 UI 工具包（左上角坐标系、纸张卡、按钮、弹窗、缺图兜底）
  - `audio.ts` 背景音乐/音效/静音（点击音效经 `kit.setTapFeedback` 注入）
  - `screens/` draft 轮回殿 · run 局内 · settle 结算 · popups 弹窗
- `assets/resources/`（主包，≈0.5MB）：`data/destinies/<命格>/` 剧本数据 + 首屏图（main_bg、logo_title、btn_*、panel）
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
