# 好友排行榜（开放数据域）接入

代码已就绪，默认关闭（`assets/scripts/game/config.ts` 的 `CONFIG.rankEnabled = false`）。在 Windows 上按下面步骤验证后再打开。

## 已有的部分
- 数据上报：每世结算时 `Platform.reportScore({ endings, lives })` 调 `wx.setUserCloudStorage`（全命格结局收集数、总轮回世数）。开关关闭时也会上报，打开后好友榜马上有数据。
- 开放数据域代码：`build-templates/wechatgame/openDataContext/index.js`（`wx.getFriendCloudStorage` 取好友 KV，按结局数降序、世数升序排前 10，画在 sharedCanvas 上）。
- 主域入口：主菜单「♛ 好友榜」→ `screens/rank.ts` 弹窗，节点挂 `SubContextView` 显示 sharedCanvas，并 `postMessage({ type: 'rank' })`，关闭时发 `close`。

## Windows 上要做的
1. Cocos Creator 构建面板（微信小游戏）：**开放数据域代码目录** 填 `openDataContext`。构建后检查输出目录的 `game.json` 里有 `"openDataContext": "openDataContext"`，且 `openDataContext/index.js` 已拷过去。
2. 微信开发者工具里打开，`config.ts` 临时把 `rankEnabled` 改为 `true`，点主菜单「♛ 好友榜」：
   - 能看到「好友轮回榜」标题；开发者工具里好友数据可能为空，会显示「还没有好友在轮回」提示，属正常；
   - 真机预览时用两个微信号各玩一世，互为好友后应能互相看到。
3. 显示正常后把 `rankEnabled` 改为 `true` 提交。

## 可能要调的地方
- SubContextView 的显示尺寸跟随挂载节点（弹窗里 `rankView` 节点，宽 = 屏宽 - 100）。如果画面被拉伸，把 `openDataContext/index.js` 里的绘制按 `canvas.width/height` 调整，或在 SubContextView 组件上设置 designResolutionSize。
- 隐私：只读取好友昵称、头像与本游戏写入的数字成绩；如果后台提示需要隐私协议声明「好友关系链」，在小游戏后台「用户隐私保护指引」里补上。
