# 音频来源与授权

**本游戏全部背景音乐与音效均为程序合成的原创作品，不含任何第三方采样、录音或曲目，版权归本项目所有，可商用。**

| 文件 | 内容 | 来源 |
|---|---|---|
| `audio/bgm/bgm_main.mp3` | 主界面「荒漠晨风」：A 小调五声音阶，76 BPM，16 小节无缝循环 | 原创曲谱，程序合成 |
| `audio/bgm/bgm_settle.mp3` | 结算「轮回」：62 BPM，8 小节无缝循环 | 原创曲谱，程序合成 |
| `audio/sfx/*.mp3` | click / card / choose / success / fail / item / skill / breakthrough / death / revive / ending | 原创音色参数，程序合成 |

- 曲谱（音符序列）与音色参数：`tools/audio/gen_audio.py`
- 合成器：纯 Python 标准库实现的 sfxr 风格合成器与步进音序器（波形为正弦 / 三角波数学生成）
- 编码：ffmpeg → 单声道 32kHz mp3（BGM 48kbps、音效 64kbps），共约 600KB

## 替换为正式音乐
1. 同名 mp3 覆盖 `assets/subres/audio/bgm/`（分包） 或 `sfx/` 下的文件即可，代码无需改动。
2. 把对应条目从 `tools/audio/gen_audio.py` 删掉，防止下次 `npm run audio` 覆盖。
3. 外部素材请保留授权证明（购买凭证 / 授权协议 / CC0 声明页截图），并在本文件登记来源。
