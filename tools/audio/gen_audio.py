#!/usr/bin/env python3
"""
程序合成本游戏的全部背景音乐与音效（无任何采样/第三方素材，版权归项目所有，可商用）。

  npm run audio
  python3 tools/audio/gen_audio.py [--only bgm_main,click]

合成器：godot skill 自带的纯 Python 标准库合成器 make_sfx.py / make_music.py（sfxr 风格 + 步进音序器），
路径默认 ~/.claude/skills/godot/scripts/assets，可用环境变量 SYNTH_DIR 覆盖。
曲谱、音色参数都在本文件里，属于本项目原创；生成后用 ffmpeg 转成单声道 mp3 放进
assets/subres/audio/{bgm,sfx}/（分包），文件名与 assets/scripts/game/audio.ts 的 SFX / BGM 一致。

想换成正式音乐时：同名 mp3 直接覆盖即可（并把对应条目从这里删掉，避免被再次覆盖）。
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets' / 'subres' / 'audio'
SYNTH = Path(os.environ.get('SYNTH_DIR', Path.home() / '.claude/skills/godot/scripts/assets'))


# ───────────── 记谱工具 ─────────────
# 一拍 = 4 个十六分音符步；音符写法 ('E5', 拍数)，休止 (None, 拍数)

def phrase(items: list[tuple[str | None, float]]) -> str:
    out: list[str] = []
    for note, beats in items:
        steps = int(round(beats * 4))
        if note is None:
            out += ['.'] * steps
        else:
            out += [note] + ['-'] * (steps - 1)
    return ' '.join(out)


def held(chords: list[str], beats_each: int = 4) -> str:
    """每个和弦（或单音）持续 beats_each 拍"""
    return phrase([(c, beats_each) for c in chords])


# ───────────── 背景音乐 ─────────────
# A 小调五声音阶（A C D E G），柔和的正弦/三角波，模仿笛子 + 古筝铺底的感觉

MAIN_MELODY = [
    [('E5', 2), ('D5', 1), ('C5', 1)], [('A4', 3), (None, 1)],
    [('C5', 1), ('D5', 1), ('E5', 1), ('G5', 1)], [('E5', 3), (None, 1)],
    [('A5', 2), ('G5', 1), ('E5', 1)], [('D5', 2), ('E5', 1), ('D5', 1)],
    [('C5', 2), ('A4', 2)], [('A4', 3), (None, 1)],
    [('G4', 1), ('A4', 1), ('C5', 2)], [('D5', 2), ('C5', 1), ('D5', 1)],
    [('E5', 2), ('G5', 1), ('E5', 1)], [('D5', 4)],
    [('C5', 1), ('D5', 1), ('E5', 1), ('D5', 1)], [('C5', 2), ('A4', 2)],
    [('G4', 2), ('A4', 1), ('C5', 1)], [('A4', 4)],
]
MAIN_CHORDS = ['A3+C4+E4', 'A3+C4+E4', 'C4+E4+G4', 'C4+E4+G4', 'A3+C4+E4', 'G3+B3+D4', 'F3+A3+C4', 'A3+C4+E4',
               'G3+B3+D4', 'G3+B3+D4', 'C4+E4+G4', 'G3+B3+D4', 'F3+A3+C4', 'A3+C4+E4', 'E3+G3+B3', 'A3+C4+E4']
MAIN_BASS = ['A2', 'A2', 'C3', 'C3', 'A2', 'G2', 'F2', 'A2', 'G2', 'G2', 'C3', 'G2', 'F2', 'A2', 'E2', 'A2']

SETTLE_MELODY = [
    [('E5', 2), ('D5', 2)], [('C5', 3), (None, 1)], [('A4', 2), ('C5', 1), ('D5', 1)], [('E5', 4)],
    [('G5', 2), ('E5', 2)], [('D5', 2), ('C5', 2)], [('A4', 2), ('G4', 2)], [('A4', 4)],
]
SETTLE_CHORDS = ['A3+C4+E4', 'F3+A3+C4', 'C4+E4+G4', 'G3+B3+D4', 'A3+C4+E4', 'F3+A3+C4', 'E3+G3+B3', 'A3+C4+E4']
SETTLE_BASS = ['A2', 'F2', 'C3', 'G2', 'A2', 'F2', 'E2', 'A2']

SOFT = {'attack': 0.08, 'decay': 0.2, 'sustain_level': 0.7, 'release': 0.6}
FLUTE = {'attack': 0.03, 'decay': 0.12, 'sustain_level': 0.65, 'release': 0.25}

BGM = {
    'bgm_main': {
        'name': 'bgm_main', 'tempo': 76, 'steps_per_beat': 4, 'beats_per_bar': 4, 'bars': 16, 'master_volume': 0.8,
        'tracks': [
            {'name': 'pad', 'wave': 'sine', 'volume': 0.45, 'pan': -0.2, 'envelope': SOFT, 'notes': held(MAIN_CHORDS)},
            {'name': 'flute', 'wave': 'triangle', 'volume': 0.55, 'pan': 0.2, 'envelope': FLUTE,
             'notes': ' '.join(phrase(b) for b in MAIN_MELODY)},
            {'name': 'bass', 'wave': 'sine', 'volume': 0.6, 'envelope': SOFT, 'notes': held(MAIN_BASS)},
        ],
        # 很轻的手鼓：每小节第 1、3 拍
        'drums': {'volume': 0.18, 'tom': 'x.......x.......'},
    },
    'bgm_settle': {
        'name': 'bgm_settle', 'tempo': 62, 'steps_per_beat': 4, 'beats_per_bar': 4, 'bars': 8, 'master_volume': 0.75,
        'tracks': [
            {'name': 'pad', 'wave': 'sine', 'volume': 0.5, 'pan': -0.2, 'envelope': {**SOFT, 'release': 1.0}, 'notes': held(SETTLE_CHORDS)},
            {'name': 'lead', 'wave': 'sine', 'volume': 0.55, 'pan': 0.2, 'envelope': {**FLUTE, 'release': 0.5},
             'notes': ' '.join(phrase(b) for b in SETTLE_MELODY)},
            {'name': 'bass', 'wave': 'sine', 'volume': 0.55, 'envelope': SOFT, 'notes': held(SETTLE_BASS)},
        ],
    },
}

# ───────────── 音效 ─────────────
# 全部用正弦 / 三角波 + 低通，温和不刺耳；五声音阶的音程（0 3 5 7 10 12）

SFX = {
    # 通用点击：短促的「嘀」
    'click': {'wave': 'sine', 'freq_start': 1046.5, 'attack': 0.001, 'decay': 0.02, 'sustain': 0.01, 'sustain_level': 0.5, 'release': 0.05, 'lowpass': 5000},
    # 抽卡翻牌：上行四度
    'card': {'wave': 'triangle', 'freq_start': 659.25, 'arpeggio': [{'at': 0.35, 'semitones': 5}], 'attack': 0.002, 'decay': 0.03, 'sustain': 0.06, 'sustain_level': 0.7, 'release': 0.15, 'lowpass': 4500},
    # 选择选项：上行五度
    'choose': {'wave': 'triangle', 'freq_start': 523.25, 'arpeggio': [{'at': 0.4, 'semitones': 7}], 'attack': 0.003, 'decay': 0.03, 'sustain': 0.08, 'sustain_level': 0.7, 'release': 0.15, 'lowpass': 4000},
    # 成功：五声上行琶音
    'success': {'wave': 'triangle', 'freq_start': 523.25, 'arpeggio': [0, 2, 4, 7], 'attack': 0.003, 'decay': 0.04, 'sustain': 0.2, 'sustain_level': 0.75, 'release': 0.3, 'lowpass': 4500},
    # 失败：下滑
    'fail': {'wave': 'triangle', 'freq_start': 392.0, 'freq_end': 247.0, 'attack': 0.005, 'decay': 0.08, 'sustain': 0.08, 'sustain_level': 0.6, 'release': 0.2, 'lowpass': 2400},
    # 获得道具：清脆的「叮」
    'item': {'wave': 'sine', 'freq_start': 987.77, 'arpeggio': [{'at': 0.15, 'semitones': 5}], 'attack': 0.001, 'decay': 0.03, 'sustain': 0.08, 'sustain_level': 0.85, 'release': 0.35},
    # 领悟技能：带颤音的高音闪光
    'skill': {'wave': 'sine', 'freq_start': 659.25, 'arpeggio': [0, 7, 12, 19], 'vibrato_depth': 0.25, 'vibrato_rate': 9.0, 'attack': 0.004, 'decay': 0.05, 'sustain': 0.3, 'sustain_level': 0.75, 'release': 0.5},
    # 境界突破：小调五声长琶音 + 低音托底
    'breakthrough': {'wave': 'triangle', 'freq_start': 440.0, 'arpeggio': [0, 3, 5, 7, 10, 12], 'vibrato_depth': 0.2, 'vibrato_rate': 6.0, 'attack': 0.005, 'decay': 0.08, 'sustain': 0.6, 'sustain_level': 0.8, 'release': 0.8, 'sub_level': 0.35, 'sub_freq_start': 110.0, 'sub_freq_end': 110.0, 'sub_decay': 1.0, 'lowpass': 5000},
    # 这一世结束：缓慢下沉（枯萎感，不吓人）
    'death': {'wave': 'sine', 'freq_start': 330.0, 'freq_end': 110.0, 'attack': 0.02, 'decay': 0.3, 'sustain': 0.2, 'sustain_level': 0.5, 'release': 0.7, 'lowpass': 1800},
    # 复活：上升
    'revive': {'wave': 'sine', 'freq_start': 220.0, 'freq_end': 660.0, 'attack': 0.02, 'decay': 0.1, 'sustain': 0.25, 'sustain_level': 0.7, 'release': 0.4, 'lowpass': 3500},
    # 达成结局：大调五声上行 + 长尾
    'ending': {'wave': 'triangle', 'freq_start': 392.0, 'arpeggio': [0, 2, 4, 7, 9, 12, 16], 'vibrato_depth': 0.2, 'vibrato_rate': 6.0, 'attack': 0.005, 'decay': 0.08, 'sustain': 0.9, 'sustain_level': 0.8, 'release': 1.0, 'sub_level': 0.3, 'sub_freq_start': 98.0, 'sub_freq_end': 98.0, 'sub_decay': 1.0, 'lowpass': 5000},
}


def run(cmd: list[str]) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f'命令失败：{" ".join(cmd)}\n{r.stdout}\n{r.stderr}')
    return r.stdout


def to_mp3(wav: Path, mp3: Path, bitrate: str) -> None:
    mp3.parent.mkdir(parents=True, exist_ok=True)
    run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ac', '1', '-ar', '32000', '-b:a', bitrate, str(mp3)])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='逗号分隔，只生成这些（如 bgm_main,click）')
    args = ap.parse_args()
    only = set(args.only.split(',')) if args.only else None
    if not (SYNTH / 'make_sfx.py').exists():
        sys.exit(f'找不到合成器 {SYNTH}（设置环境变量 SYNTH_DIR 指向 make_sfx.py 所在目录）')

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for name, song in BGM.items():
            if only and name not in only:
                continue
            wav = tmp / f'{name}.wav'
            info = json.loads(run([sys.executable, str(SYNTH / 'make_music.py'), '--song-json', json.dumps(song), '--out', str(wav), '--peak-db', '-3']))
            to_mp3(wav, OUT / 'bgm' / f'{name}.mp3', '48k')
            print(f'[bgm] {name}.mp3  {info.get("duration_s", "?")}s  loop_safe={info.get("loop_safe")}')
        for name, params in SFX.items():
            if only and name not in only:
                continue
            wav = tmp / f'{name}.wav'
            run([sys.executable, str(SYNTH / 'make_sfx.py'), '--params', json.dumps(params), '--name', name, '--out', str(wav), '--peak-db', '-3'])
            to_mp3(wav, OUT / 'sfx' / f'{name}.mp3', '64k')
            print(f'[sfx] {name}.mp3')


if __name__ == '__main__':
    main()
