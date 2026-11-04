# 上线前检查清单

> 2026-11-04 整理。平台规则会变，提审前到微信公众平台和开放文档再核一遍。
> 本游戏定位：**单机、免费、无内购（不开虚拟支付）、送审版本无广告**。下面的结论都基于这个前提；一旦加内购，版号、防沉迷接入都要重做。

## 一、资质与合规（只能你在后台做）

| 项 | 要求 | 本游戏状态 |
|---|---|---|
| 小程序备案（ICP） | 2023 年底起强制，未备案不能发布 | 备案材料见 `docs/filing/game-filing.md` |
| 游戏内容介绍 | 公众平台 → 小程序备案 →「游戏内容介绍」；截图须是模拟器 / 真机实拍 | 文案已写好，**截图待拍**（清单在 game-filing.md 第九节，20 张） |
| 适龄提示 | 后台「基础设置 → 适龄提示」选 16+，游戏启动页显示同样等级 | 启动页已有；**官方标识图待放**：`assets/resources/textures/common/ui/age_16.png` |
| 软著 / 电子版权认证 + 游戏自审自查报告 | 不开内购的游戏提审时提交，不需要版号 | 待准备 |
| 版号 | 只有开通虚拟支付（内购）才需要 | 不需要（无内购） |
| 实名认证 / 防沉迷 | 不开虚拟支付时由微信平台统一接入国家实名认证系统，开发者无需操作 | 无需开发 |
| 用户隐私保护指引 | 调用了隐私接口才需要在后台声明 | 主域只用存储、分享、振动、激励视频、写托管数据（`setUserCloudStorage` 不在隐私接口清单内），**送审版本无需声明**；打开好友榜（开放数据域 `getFriendCloudStorage`）前要声明「微信朋友关系」 |
| 健康游戏忠告 | 启动页全文展示 | 已有（`screens/splash.ts`） |

## 二、构建与包体

- [ ] Windows 用 Cocos Creator 3.8 打开工程，首次导入后**提交生成的 `.meta`**（`docs/dev/cocos-setup.md` 第二节）。
- [ ] `assets/subres` 配置为 Bundle、小游戏平台「压缩类型 → 小游戏子包」（第三节）。
- [ ] 项目设置 → 功能裁剪只保留 2D / UI / Graphics / Tween / WebGL。
- [ ] 构建后在开发者工具「详情 → 代码包大小」确认**主包 < 4MB**、总包 < 20MB。Linux 端 `npm test` 已限制 `assets/resources` ≤ 2.2MB，留给引擎约 1.8MB。
- [ ] 真机预览：安卓、iOS 各一台，走一遍 首次启动 → 一键开局 → 一世结束 → 轮回殿 → 切换命格（解锁命格的剧本在分包，看加载是否正常）→ 图鉴墙 → 分享。
- [ ] 断网 / 弱网下打开：分包下载失败时缺图有兜底、不卡死。

## 三、配置开关（`assets/scripts/game/config.ts`）

| 开关 | 送审版本 | 以后改 |
|---|---|---|
| `adsEnabled` | `false` | 流量主开通 + 广告位审核通过 + **先更新备案的游戏内容介绍（加广告系统与截图）**，再填 `rewardedAdUnitId` 改 `true` |
| `rankEnabled` | `false` | 开放数据域在 Windows 验证通过 + 隐私指引声明「微信朋友关系」+ 备案补好友榜描述后再开（`docs/dev/rank-setup.md`） |
| `saveKey` | `rebirth_save_v1` | 存档结构不兼容时升级 |

## 四、数据与埋点

- [ ] We分析 后台注册全部 11 个事件（表在 `docs/dev/cocos-setup.md` 第六节「埋点」），注册后用开发者工具「实时日志」验证一次上报。
- [ ] 分享卡：`build-templates/wechatgame/share/*.jpg` 已随构建拷到包根目录（`npm run share` 生成）。

## 五、内容自查（每次改剧本后）

- [ ] `npm run typecheck && npm test && npm run validate` 全过。
- [ ] `npm run ui:snap` 0 问题（约 870 页截图在 `/tmp/ui-snap`）。
- [ ] `npm run art:check` 0 问题。
- [ ] 改了剧本或数值：`npm run sim` 看结局率与分布，`npm run rarity` 重算稀有度表。
- [ ] 审核红线（`.claude/skills/rebirth-content/SKILL.md`）：不写真实品牌 / 地名 / 国家，不写猝死、过劳死、轻生，诈骗 / 网贷线有正向结局；分享不设奖励（微信禁止诱导分享）。

## 参考
- 微信《小游戏隐私合规开发指南》：https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.html
- 微信 `wx.setUserCloudStorage` 文档：https://developers.weixin.qq.com/minigame/dev/api/open-api/data/wx.setUserCloudStorage.html
- 微信开放社区：小游戏实名与防沉迷接入说明：https://developers.weixin.qq.com/community/minigame/doc/000ecaf1354190701d0c53f7a5b401
- Cocos 3.8 微信小游戏引擎插件说明：https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/wechatgame-plugin.html
