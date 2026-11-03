# 打工人命格 · 线路写作说明（给写剧本的人 / 子任务）

必读：
1. `.claude/skills/rebirth-content/SKILL.md`（格式、语气、审核红线）
2. `docs/design/06-worker-destiny.md`（设计）
3. `assets/resources/data/destinies/worker/destiny.json`（属性、层、境界、死法、结局、世界线 maps）
4. `assets/resources/data/destinies/worker/{items,companions,skills}.json`（可引用的 id）
5. **范例线路**：`assets/resources/data/destinies/worker/lines/boss_zhou.json`（照这个写）

## 线路文件格式
`lines/<线路id>.json`，一个文件一条线：
```jsonc
{ "id": "scam_trip", "name": "海外团建", "summary": "...", "maps": ["city","workshop"], "stage": [0, 2],
  "states": { "joined": "报名了团建", "escaped": "逃出了园区" },   // 导出状态（必须照下表登记的写）
  "events": [ { "id": "offer", "entry": true, ... }, { "id": "bus", "chainOnly": true, "teaser": "...", ... } ] }
```
- 事件 id 写短名（`offer`），引擎自动变成 `scam_trip/offer`；follow / next / flag / seen 写短名即可。引用别的线路的事件写全名 `xxx/yyy`。
- `entry: true` = 入口（自动加「这一世没碰过这条线」），会进普通抽取池；入口一般 1～2 个，weight 14～24。
- 后续事件 `chainOnly: true` + `teaser`（≤18 字），用 `follow` 串起来；`dir` 选合理方向（会走动的人用 `any`）。
- 线路状态：效果 `"state": "escaped"`；条件 `line:scam_trip`、`line:scam_trip.escaped`、`ever:scam_trip.escaped`（任何一世到过）。**引用别的线路只用下表里登记的状态。**
- 方向与层：up 往上卷（U1 工位 / U2 会议室 / U3 总监办公室 / U4 顶楼董事会）；down 往下摸（D1 茶水间 / D2 楼梯间 / D3 地下车库 / D4 地下二层机房）；side 跳出去（L1 楼下小吃街 / L2 夜市与直播间 / L3 远方；side 需 stage>=1）。
- 境界：0 实习牛马 · 1 打工人 · 2 觉醒者 · 3 都市高手 · 4 一方大佬 · 5 地球球主。
- 世界线 maps：city 都市 · workshop 小作坊 · county 县城 · awaken 灵气复苏 · doom 末世。线路可用 `maps` 限定。
- 属性中文名：精力（生命）· 精力上限 · 能力 · 人脉 · 脸皮 · 心态 · 身价（成长货币）。数值参考范例：前期一次 +1～+8 身价，中期 +10～+20，属性一次 +1～+3。
- 系统：效果 `"bind": "sys_xxx"` 绑定，`"unbind": true` 解绑，`"keepSystem": true` 认主；条件 `system:any` / `system:sys_xxx`。系统台词以「【叮！】」开头。

## 每条线的要求
- 6～10 个事件，至少 1 个「三岔路」（不同选项走向不同后续 / 状态）。
- 每个事件 3～4 个选项，混用：稳妥 / 冒险（chance + chanceAttr + fail，可加 `easy` 碾压文案）/ 专属（require 传承 `legacy:` 或道具 `item:` 或技能 showIf+useSkill，或系统 `system:`）/ 离谱（`absurd: true`，成功率 0.1～0.3）。每个事件至少一个无条件选项。
- 至少 1 个「前世…这一世…」的传承专属选项（用本命格的传承 id，见 destiny.json legacies）。
- 复仇 / 打脸的选项写 `feud`（≤16 字）。
- 「这一世结束」用 destiny.json 里的死法 id（`death`）。只写起因和结果，不写过程。
- 字数：正文 ≤60、选项 ≤14、结果 ≤40、teaser ≤18。禁 AI 腔（仿佛、不禁、心中涌起、这一刻、命运的齿轮）。
- 审核红线：不写真实公司 / 品牌 / 地名 / 国家；不写猝死、过劳死、轻生；犯罪只写起因结果，不写暴力；网贷、诈骗线带正向结局（识破、报警、家人拉一把）。

## 线路与导出状态表（必须照此登记 states，可以额外加，但下列必须有且能被设置到）

| 线路 id | 名字 | maps | 必须导出的状态 | 必须触发的结局（ending） |
|---|---|---|---|---|
| boss_zhou | 画饼老板老周 | 全部 | fooled exposed pie_system bought arrested | boss_of_boss（已写） |
| wang_juanjuan | 卷王王卷卷 | 全部 | rival broken saved | — |
| layoff | 优化专员 | city workshop | listed laid_off negotiated | — |
| xiaolin | 同期实习生小林 | 全部 | friend close parted | on_time |
| project | 年终大项目 | city workshop county | credited stolen | — |
| old_guard | 地下车库老保安 | 全部 | buddy apprentice founder_known | slacker_master |
| parents | 老家爸妈 | 全部 | close home distant | hometown_shop |
| jianbing | 煎饼大爷 | 全部 | friend shop | — |
| roommate | 合租室友 | city workshop | friend landed | — |
| rider_aqiang | 外卖小哥阿强 | city workshop county | friend riding | — |
| cleaner | 保洁阿姨 | city workshop | helped revealed | — |
| scam_trip | 海外团建 | city workshop | joined escaped refused reported | —（死法 no_return） |
| pig_butcher | 网恋杀猪盘 | 全部 | hooked busted | —（死法 scammed） |
| fund_crash | 理财暴雷 | 全部 | invested crashed dodged | —（死法 scammed） |
| loan | 网贷 | 全部 | borrowed cleared | —（死法 debt） |
| night_market | 夜市摆摊 | 全部 | stall chain | night_king（死法 stall_broke） |
| livestream | 直播 | 全部 | live viral crashed | internet_worker（死法 stream_crash） |
| startup | 创业 | city workshop | founded betrayed listed | — |
| go_abroad | 出海 | city workshop county | abroad settled | —（死法 abroad_fail） |
| system | 系统 | 全部 | bound tasked owned deleted | system_boss · delete_system · i_am_system（死法 overload / banned） |
| awaken | 灵气复苏 | awaken | awakened sect | —（境界结局「都市仙尊」读 sect；死法 realm_lost） |
| doom | 末世 | doom | shelter leader | doom_savior |
| starsea | 卷出地球 | 全部 | orbit colony | —（境界结局「宇宙打工人」读 line:starsea；入口要求 stage>=4） |
| tiandao | 天道真相 | 全部 | met notebook | tiandao（require 其他 5 个命格都有结局：xend:desert_grass & xend:local_dog & xend:caterpillar & xend:mantis_shrimp & xend:crocodile）· off_with_tiandao |

## system 线（特别说明）
7 个系统（companions.json 里 system: true）：sys_signin 签到 · sys_shenhao 神豪 · sys_slack 摸鱼 · sys_eye 天眼 · sys_undying 不死 · sys_antijuan 反卷 · sys_pie 画饼（老周线夺取，已写）。
- 每个系统一个「找上门」的绑定事件（entry 或普通事件，require `!system:any` + 触发情境，如存款为零 → 神豪），选项：绑定 / 拒绝（天道对你另眼相看）/ 讨价还价（离谱）。
- 每个系统 1～2 个任务事件（require `system:sys_xxx`），完成奖励 / 失败惩罚。
- 系统也会出事：升级、被天道没收（unbind）、系统过载（death overload）、天道封号（death banned）、双系统打架（稀有）。
- 认主（keepSystem）路线；三个结局：系统给我打工（system_boss）、删除系统（delete_system，unbind 后选择做回普通人）、我成了系统（i_am_system）。
- 可以拆成多个线路文件（如 system.json 放绑定与结局，任务事件也放同一个 line 下），但 `system` 线必须存在并导出上表状态。

## 交叉事件
不用写——主线程统一写 `crossings/`。写好你的线路，保证上表状态都能被设置到即可。

## 自检
写完运行：`./node_modules/.bin/tsx tools/validate.ts worker`，只看和你的文件有关的 ✖ 错误与 ⚠ 字数警告，改到没有。
`./node_modules/.bin/tsx tools/lines.ts worker` 可以看你的线路图。
