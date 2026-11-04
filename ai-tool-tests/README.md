# AI 工具测试

用来横向对比不同 AI 工具的生成效果，与游戏工程无关：放在 `assets/` 之外，Cocos 不导入，tsc / vitest / validate 也不扫描。

每个测试一个子目录：`prompt.md`（提示词 + 各工具的耗时与 token）+ 各工具产出的文件和渲染截图（文件名带工具/模型名，如 `opus_5.5_*.svg` / `opus_5.5_preview.png`）。

## 测试方法（保证各工具可比）

1. 新开会话，只发子目录 `prompt.md` 里的完整提示词，不追加修改要求；返工了就如实记录轮数
2. 耗时：从发出提示词到产出完成的时间（不含人看图、打字的间隔）
3. token：优先用工具自带的用量统计，并注明是否含思考 token
   - Claude Code：会话记录 `~/.claude/projects/<项目>/<会话>.jsonl`，每条 assistant 消息的 `timestamp` 和 `message.usage`（`output_tokens`，以及 `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`）
4. 验证：XML 能解析，用浏览器或 headless Chrome 截一帧放进子目录
   ```
   google-chrome --headless=old --no-sandbox --disable-gpu --hide-scrollbars \
     --window-size=512,512 --virtual-time-budget=400 \
     --screenshot=<工具>_preview.png file://$PWD/<文件>.svg
   ```

| 测试 | 工具 / 模型 | 产出 | 耗时 | 输出 token | 备注 |
|---|---|---|---|---|---|
| [章鱼骑自行车 SVG](zhangyu_ridebike/prompt.md) | Claude Code · Opus 5.5 | [opus_5.5_zhangyu_ridebike.svg](zhangyu_ridebike/opus_5.5_zhangyu_ridebike.svg) | 91 秒 | 8,960 | 完整提示词一次成功；同会话非冷启动，偏乐观 |
| 同上 | Claude Code · MiMo v2.6（mimo-v2.6-pro-ultraspeed） | [mimo_v2.6_zhangyu_ridebike.svg](zhangyu_ridebike/mimo_v2.6_zhangyu_ridebike.svg) | 252 秒 | 91,992 | 冷启动；22 次调用，首次用满 32k 输出上限没有产出，之后自己改了 7 次；文件名写成了 opus 的，覆盖过 Opus 的文件 |
