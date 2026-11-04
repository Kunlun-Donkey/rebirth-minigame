# AI 工具测试

用来横向对比不同 AI 工具的生成效果，与游戏工程无关：放在 `assets/` 之外，Cocos 不导入，tsc / vitest / validate 也不扫描。

每个测试一个子目录：`prompt.md`（提示词 + 各工具的耗时与 token）+ 各工具产出的文件（文件名带工具/模型名）。

| 测试 | 工具 / 模型 | 产出 | 耗时 | 输出 token |
|---|---|---|---|---|
| [章鱼骑自行车 SVG](zhangyu_ridebike/prompt.md) | Claude Code · Opus 5.5 | [opus_5.5_zhangyu_ridebike.svg](zhangyu_ridebike/opus_5.5_zhangyu_ridebike.svg) | 静态 74 秒；动画版共约 4 分 34 秒 | 静态 7,574；动画版合计约 26,800 |
