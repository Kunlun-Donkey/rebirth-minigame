---
name: rebirth-content
description: 《这一世我重生了》剧本内容写作规范。当需要编写或修改命格事件、天赋、道具、伴生物、死法、传承、结局、墓志铭、突破旁白等游戏文本/数据时使用。触发词：写事件、写剧本、加天赋、加道具、加死法、命格内容、事件池。
---

# 重生游戏剧本写作规范

## 必读
1. 对应命格设计文档：`docs/design/01-plant-destiny.md`（荒漠一株草）、`docs/design/02-dog-destiny.md`（一只土狗）——玩法意图。
2. **数据格式以代码为准**：`assets/scripts/core/types.ts` 中的 `RawEvent / RawChoice / RawEffect` 等。
3. 先看同命格已有数据，保持风格和数值一致：`assets/resources/data/destinies/<命格>/`

## 文件布局
```
assets/resources/data/destinies/index.json   命格索引：新命格必须登记，可加 unlock 解锁条件
assets/resources/data/destinies/<命格id>/
  destiny.json      属性（short/color/desc 给 HUD）、方向、层、境界、死法、传承、结局、rules、settings
                    rules：life/lifeMax 生命属性、lifeDeath/oldAgeDeath 死法、regen/yield 每季回复与产出、
                           growth 成长货币、startLog/loadingText/reviveOnceText/dirPrompt/emptyItems 文案
  talents.json      天赋池        items.json  道具池      companions.json 伴生物池
  skills.json       技能（领悟途径在 destiny.json 死法 skills / 境界 skillPool / 事件效果 skill 中配置）
  events/*.json     事件（按方向/主题分文件，文件名随意，全部合并加载）
```

## 事件格式速查
```jsonc
{
  "id": "d3_shell",            // 全局唯一，小写+下划线，前缀标注层（s0/u1/d3/l2/x=突发）
  "dir": "down",               // up | down | side | any
  "layers": ["D3"],            // 省略 = 该方向所有层
  "stage": [1, 99],            // 境界范围，省略 = 全部
  "weight": 10,                // 默认 10；兜底事件 3；宿敌/剧情推进 20~40
  "once": true,                // 一世只出现一次
  "sudden": false,             // true = 突发事件（不经方向选择）
  "gold": false,               // true = 金色奇遇（受气运加成）
  "chainOnly": false,          // true = 只能被 next / enterEvent 触发
  "require": "根系>=5 & !flag:x",
  "text": "正文 ≤ 60 字",
  "choices": [
    { "text": "选项 ≤ 14 字", "effect": { "灵气": 8 }, "result": "结果 ≤ 40 字" },
    { "text": "高风险", "chance": 0.4, "chanceAttr": "韧性", "chanceStep": 0.05,
      "effect": {}, "result": "...", "fail": { "effect": { "death": "collapse" }, "result": "..." } },
    { "text": "传承专属", "require": "legacy:fire_root>=2" },   // 不满足时显示锁定+条件 → 下一世的目标
    { "text": "天赋专属", "showIf": "talent:bitter" },          // 不满足时完全隐藏
    { "text": "继续", "next": "d3_collapse" },                   // 链式事件
    { "text": "毒刺反击", "showIf": "skill:thorn_burst", "useSkill": "thorn_burst",
      "effect": { "灵气": 8 }, "result": "..." }                 // 技能交互：拥有才可见，冷却中锁定，选后进入冷却
  ]
}
```
- 效果键：属性 id 或中文名（增量）；保留键 `flag` `unflag` `item` `loseItem` `skill`（领悟技能） `death` `ending` `back`（退回上一层） `follow` `stageUp` `feud`（了结的恩怨，≤16 字，结算页「本世恩怨」逐条列出）。
- 条件：`属性>=N` `stage` `season` `life` `legacy:id>=N` `pos:down>=N` `died:死法>=N`（本命格累计死于该死法几次）；`flag:` `talent:` `item:` `companion:` `skill:` `seen:事件` `dead:死法` `ending:结局`；跨命格 `xend:命格id` / `xend:命格id/结局id` / `xlives:命格id>=N` / `xstage:命格id>=N`；`! & | ()`。
- 文本占位：`{died:死法id}` → 累计次数（「它吃过你{died:eaten_camel}回」），`{life}` → 第几世。
- 选项附加字段：`easy`（成功率溢出到 100% 显示「稳」时替代 result 的碾压文案，需配 chanceAttr）、`absurd: true`（离谱选项，标「离谱」）。事件附加 `cameo: true`（跨命格彩蛋，卡片标「似曾相识」）。

## 技能
- 每个技能必须有至少一条领悟途径（死法 `skills` / 境界 `skillPool` / 事件效果 `skill`），交互型技能必须有事件用 `useSkill` 用到它（校验会报错）。
- 新增交互型技能时，至少给 2~3 个不同事件写专属选项，结果要比普通选项明显更爽。
- 「做选择领悟」的选项要符合直觉：和动物搭话 → 兽语，吞掉灵物 → 吞噬。

## 写作原则

### 爽感公式
- **因果**：每次死亡都要能指向一个传承或一次「下次我知道了」。新死法必须配传承。
- **对照**：传承/前世相关选项的结果用「前世…这一世…」句式。
- **打脸**：欺负过主角的角色（宿敌）必须有回收，回收要比欺负更夸张。宿敌线用 `dead:` + `flag:` 串起来跨世代推进。
- **反差**：弱小身份 × 宏大结果（一株草让仙人摔跤）。

### 语气
- 旁白 = 冷幽默 + 吐槽，突破/打脸时一句热血收尾。短句。
- 墓志铭：「享年N季，」由引擎拼接，`epitaph` 只写后半句，要离谱又真实。
- 禁止 AI 腔：不用「仿佛」「不禁」「心中涌起」「这一刻」「命运的齿轮」等；批量写完用 `story-deslop` skill 过一遍。

### 审核红线（微信小游戏）
- 不写血腥细节、低俗擦边、真实政治/宗教/民族、真实品牌与人名。
- 死亡用命格化的温和表达（植物：枯萎、被吃、成为草干；动物：被带走、没能回来），保持轻松基调。
- **死亡只写起因和结果，点到为止**：不描写伤口、血、尸体，不写痛苦过程（挣扎、惨叫、垂死）。写到「出事了」就停，用一句冷幽默或留白收尾。
  - ✅「那块肉闻起来，比什么都香。」 ✅「车开往镇上，它最后回头看了一眼村子。」
  - ❌ 写中毒后的抽搐、兽夹夹断腿、被打的过程、尸体样子。
- 动物命格额外注意：不出现「狗肉 / 下锅 / 剥皮 / 宰杀」这类字眼；人类对动物的伤害只写「被带走 / 被赶走」，不写后续。
- 不写自杀、自残、主动寻死；死亡永远是意外或代价，主旨是「死了也能变强」，不美化死亡本身。
- 对外材料（备案、审核说明、分享文案）用「这一世结束 / 轮回」代替「死亡」；游戏内的「死法 / 死得很亮」等冷幽默文案保持不变。

## 叙事技法（剧情线与结局）

> 提炼自 [oh-story-claudecode](https://github.com/zenstory-ai/oh-story-claudecode)（MIT）story-short-write 的 emotional-methods / short-reversal / villain-and-reveal，按「正文 60 字、一世几十季、跨世轮回」的体量改写。

### 后续剧情 follow（让每一季接着上一季发展，避免重复）
- 选项效果写 `"follow": "事件id"` 或 `{ "id": "...", "delay": 2, "ttl": 6 }`：delay 季后（默认 1）、玩家选到**该事件的方向**时优先触发（`dir: "any"` 则任意方向），ttl 季内（默认 4）没走到就作废。
- 后续事件可写 `layers` 限定在哪几层才触发（如「水箱里」的事，逃到海里后就不再发生）。
- 后续事件一般 `chainOnly: true`，必须写 `teaser`（≤18 字），显示在对应方向按钮上「后续：……」（any 的显示在提示卡「未完的事」）。
- 同一世已遇到的事件抽中权重 ×0.25；所以**大部分普通事件至少一个选项要带 follow**，不同选项接不同后续（善待 → 报恩，结仇 → 报复升级）。
- 后续事件可以再 follow，形成 2~3 步的小剧情（例：甲虫打洞 → 地下空腔 → 甲虫一家）；地下的事用 `dir: "down"`，会走动的生物用 `any`。
- 荒漠一株草的后续剧情集中在 `events/threads.json`，可作范例。

### 剧情线 = 跨事件的弧线，用 flag / item / seen / dead 串起来
一条线至少 3 个节点，分散在不同层或境界，后一个节点 `require` 前一个节点设的 flag：

| 线型 | 节点 | 例 |
|---|---|---|
| 宿敌（打脸） | 受压 → 升级 → 亮底牌兑现 | 黑虎抢食 → 黑虎栽赃 → 妖王咬回去 |
| 羁绊（温情） | 具体物件铺设 → 离别/撕裂 → 余韵 | 小翠取名 → 系狗牌 → 出嫁 → 京城重逢 |
| 反转 | 误导 → 证据 → 揭示 | 二皮骗你 → 「问它为什么」→ 猎户抓了它的崽 |
| 跨世 | 前世死法 → 传承选项 → 「前世…这一世…」 | 黄鼠狼骗死你 → 识人 → 当场拆穿 |

### 情感三板斧（温情线）
1. **羁绊要具体**：物件（狗牌、半个馒头）、名字（小黄）、重复动作（每天掰一块供饼）。不写「他们感情很好」。
2. **撕裂要有触发事件**：出嫁、被赶走、被冤枉；转折前必须有铺垫节点。
3. **余韵靠动作和留白**：「你在村口坐到了天黑」「她过得很好。你转身回村了」。不哭、不解释。

### 宿敌记仇 / 恩怨 / 离谱 / 跨命格彩蛋（每个命格都要有，放 `events/grudge.json`、`events/crossover.json`）
- **宿敌记仇**：主要死法各一个 `require: "died:x>=2"` 的事件，正文用 `{died:x}` 点出「它X过你N回」；报仇选项带 `chance + chanceAttr`（属性够高变「稳」）、`easy` 碾压文案、`feud` 恩怨。死得越多，复仇越解气。
- **恩怨 feud**：已有的复仇/打脸选项都加 `feud`（「老刀扎了满嘴刺」），结算页集中展示，也会飘弹幕。
- **离谱选项**：`absurd: true` + 低成功率（0.1~0.3）+ 成了奖励高；失败文案本身要好笑，可以送命（「他们愣了一下，然后很高兴。」）——同一个坑死多了，前世标注会越来越嫌弃。
- **跨命格彩蛋**：`cameo: true` + `require` 用 `xlives`（玩过就出）或 `xend`（通了某结局才出，`gold` 奖励更高）；其他命格的角色/结局在这里客串（前世是狗，这一世是被狗浇的草）。每个命格至少：每个其他命格 1 个 xlives 彩蛋 + 1~2 个 xend 彩蛋 + 1 个「全命格都玩过」的大彩蛋。
- 天道（系统角色）、弹幕、墓志铭后缀、连胜、「稳」由引擎通用实现（`core/flavor.ts`），剧本不用写。

### 线路（lines/）与交叉事件（crossings/）——新命格推荐写法
- 一条故事线一个文件，格式与要求见 `docs/design/06-worker-lines-brief.md`，范例 `data/destinies/worker/lines/boss_zhou.json`。
- 线路内 id / flag / follow 写短名，自动加命名空间；对外只通过 `states` 导出状态交互（`line:线路.状态`、`ever:线路.状态`、效果 `state`）。
- 交叉事件放 `crossings/`，require 引用两条以上线路的状态；新增线路不改旧线，只加交叉事件。
- 系统（金手指）：companions 里 `system: true`，事件效果 `bind / unbind / keepSystem`，台词「【叮！】」开头。
- 寿终结局：境界 `oldAgeEndings`，平凡安稳也可以是结局。
- 写完跑 `npm run validate`、`npm run lines <命格>`、`npm run sim -- --destiny <命格>`（看线路进入率与结局分布）。

### 宿敌与报应
- 嚣张度逐级上升，不重复同一种恶：小恶（抢食、嘲笑）→ 中恶（栽赃、抓走同伴）→ 大恶（要你的命）。
- 报应与恶行**对应**：抢食的被抢、抓狗的被抓、笑你的来求你。2~3 句带过，爽在对应感，不在描写长度。
- 打脸三步：受压 → 亮底牌（传承/技能/道具选项）→ 兑现时写旁人反应（「全村的狗都看见了」）。
- 宿敌按自己的信息做合理判断，不为衬托主角降智。

### 反转
- 一条线最多 1 次反转；揭示前至少 2 处铺垫（伙伴描述「眼神有点怪」、事件正文里的细节）。
- 不引入前文没有的信息；揭示用一个选项结果完成，不用大段解释。
- 反转要同时改变情绪判断（恨 → 同情，或信任 → 警惕）。

### 天胡通道（每个命格都要有）
- `destiny.json` 的 `blessed`：`chance` 约 0.01（天命之子），`start` 开局加成、`lifespanMul` 寿元倍率、`chain` 奇遇连锁第一个事件。
- 奇遇连锁放 `events/tianhu.json`：3 步，第 1 步是 `gold + sudden`、`stage [1,2]`、`weight 0.25`（普通玩家早期也有极小概率遇到），后两步 `chainOnly`；每步成功 `stageUp` 直接突破，最后一步 `stageUp: 2` + `flag: "tianhu"`。
- 命盘加一档 `kind: "blessed"`（每级 +0.3%），天命加一个 `mods.blessedMul: 3`。
- 用 `npm run sim` 看「天命之子 / 天胡结局」占比，控制在 1%～2%，且整体结局率不明显上升。

### 最后一搏与新手保护（每个命格都要有）
- `rules.lastStand` 指向 `events/last_stand.json` 的 `z_last_stand`：寿元将尽时触发一次。三个选项：普通境界冲关（`showIf: stage<=3`，成功率 35% + 灵性加成）、终境前冲关（`showIf: stage>=4`，12%），以及安然离去；成功 `stageUp: 1`，失败寿终。
- `settings.newbieSeasons: 8`：该命格第 1 世前 8 季的死亡会被挡下。

### 结局设计
- 每个命格 4~6 个结局，覆盖不同情绪：**爽**（登顶）、**温情**（为某人放弃登顶）、**守护**（救下别人）、**黑化/另类**（走歪了也是一种圆满）。
- 两种触发：
  - **突破终境时分支**：最终境界 `endings` 按顺序取第一个满足条件的（最后一个无条件兜底）。条件引用整局的选择（flag / item / legacy）。
  - **事件当场结局**：选项效果 `"ending": "id"`，不必修到满级。用于「放弃修炼换另一种人生」，选项要 `require` 一条完整剧情线的终点（如持有狗牌 + 小翠已出嫁），避免随手点到。
- 每个结局都要能从剧情里倒推出「为什么是这个结局」；`epitaph` 一两句，用画面收尾。
- 结局要能被玩家发现：相关线的前置节点要在 sim 里触发过（`npm run sim` 输出结局分布）。

## 设计约束
- 每个事件至少一个无条件可选的选项（校验会报错）。必死点只能是有传承解锁的门槛。
- 选项之间要有可感知差异（属性/风险/收益），不写三个结果一样的选项。
- 单事件属性收益一般 1~3，稀有/高风险 ≤ 8，灵气可到 15~40（金色/雷劫）。
- 新 flag 必须既有设置也有检查（校验会报 error/warning）——warning 可作为后续剧情伏笔保留。

## 产出流程
1. 确认命格、层/区域、境界范围、数量。
2. 写入 `events/*.json`。
3. `npm run validate` —— 修复所有 ✖；⚠ 酌情处理（字数超限必须改）。
4. `npm test` —— 300 世随机 AI 不卡死。
5. `npm run sim` —— 看死因分布/从未触发的事件，必要时调 weight / chance。
6. 抽 3 条自检：有没有爽点？选项有没有差异？
