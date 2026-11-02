/**
 * 音频：背景音乐（循环）+ 音效（一次性），支持静音。
 * 资源在 resources/audio/{bgm,sfx}/，由 tools/audio/gen_audio.py 程序合成（原创，可商用）。
 * 缺文件 / 加载失败时静默跳过，不影响游戏。
 */
import { AudioClip, AudioSource, Layers, Node, resources } from 'cc';

export type BgmName = 'bgm_main' | 'bgm_settle';
export type SfxName =
    | 'click' | 'card' | 'choose' | 'success' | 'fail' | 'item' | 'skill'
    | 'breakthrough' | 'death' | 'revive' | 'ending';

const BGM_VOLUME = 0.55;
const SFX_VOLUME = 0.9;

const clips = new Map<string, Promise<AudioClip | null>>();
function loadClip(path: string): Promise<AudioClip | null> {
    let p = clips.get(path);
    if (!p) {
        p = new Promise(resolve => resources.load(path, AudioClip, (err, clip) => resolve(err || !clip ? null : clip)));
        clips.set(path, p);
    }
    return p;
}

export class Audio {
    private bgm!: AudioSource;
    private sfx!: AudioSource;
    private current: BgmName | null = null;

    constructor(private muted: boolean) {}

    /** 在常驻节点下创建两个 AudioSource（背景音乐 / 音效） */
    attach(host: Node): void {
        const n = new Node('audio');
        n.layer = Layers.Enum.UI_2D;
        host.addChild(n);
        this.bgm = n.addComponent(AudioSource);
        this.bgm.loop = true;
        this.bgm.volume = BGM_VOLUME;
        this.sfx = n.addComponent(AudioSource);
        this.sfx.volume = SFX_VOLUME;
    }

    get isMuted(): boolean {
        return this.muted;
    }

    setMuted(m: boolean): void {
        this.muted = m;
        if (!this.bgm) return;
        if (m) this.bgm.stop();
        else if (this.current) {
            const name = this.current;
            this.current = null;
            this.playBgm(name);
        }
    }

    playBgm(name: BgmName): void {
        if (this.current === name) return;
        this.current = name;
        if (this.muted || !this.bgm) return;
        loadClip(`audio/bgm/${name}`).then(clip => {
            if (!clip || this.current !== name || this.muted) return;
            this.bgm.stop();
            this.bgm.clip = clip;
            this.bgm.play();
        });
    }

    play(name: SfxName): void {
        if (this.muted || !this.sfx) return;
        loadClip(`audio/sfx/${name}`).then(clip => {
            if (clip && !this.muted) this.sfx.playOneShot(clip, 1);
        });
    }

    /** 启动时预加载常用音效，减少首次播放延迟 */
    preload(names: SfxName[]): void {
        for (const n of names) loadClip(`audio/sfx/${n}`);
    }
}
