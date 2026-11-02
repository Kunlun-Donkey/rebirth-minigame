---
name: rebirth-content
description: 《我重生了，这一世我将拿回属于我的一切》剧本内容写作规范。当需要编写或修改命格事件、天赋、道具、伴生物、死法、传承、结局、墓志铭、突破旁白等游戏文本/数据时使用。触发词：写事件、写剧本、加天赋、加道具、加死法、命格内容、事件池。
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
- 效果键：属性 id 或中文名（增量）；保留键 `flag` `unflag` `item` `loseItem` `skill`（领悟技能） `death` `ending` `back`（退回上一层）。
- 条件：`属性>=N` `stage` `season` `life` `legacy:id>=N` `pos:down>=N`；`flag:` `talent:` `item:` `companion:` `skill:` `seen:事件` `dead:死法` `ending:结局`；`! & | ()`。

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
- 死亡用植物化表达（枯萎、被吃、成为草干），保持轻松基调。

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
