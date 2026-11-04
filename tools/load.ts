/** Node 端读取命格剧本（游戏内由 Cocos resources 加载，组装成同样的 RawDestiny） */
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DestinyIndex, RawDestiny, RawEvent, RawLine } from '../assets/scripts/core/types';

const ASSETS = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'assets');
/** 主包剧本目录：index.json、rarity.json、默认开放的命格 */
export const DATA_ROOT = join(ASSETS, 'resources', 'data', 'destinies');
/** 分包剧本目录：游玩解锁的命格（游戏内由 loader.ts 按 bundle 查找） */
export const SUB_DATA_ROOT = join(ASSETS, 'subres', 'data', 'destinies');

/** 命格剧本所在目录（主包优先，其次分包） */
export function destinyDir(id: string): string {
    const main = join(DATA_ROOT, id);
    return existsSync(main) ? main : join(SUB_DATA_ROOT, id);
}

const readJson = <T>(file: string): T => {
    try {
        return JSON.parse(readFileSync(file, 'utf8')) as T;
    } catch (e) {
        throw new Error(`JSON 解析失败：${file}\n  ${(e as Error).message}`);
    }
};

export function listDestinies(): string[] {
    const dirs = (root: string) => (existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : []);
    return [...dirs(DATA_ROOT), ...dirs(SUB_DATA_ROOT)];
}

export function loadRawDestiny(id: string): { raw: RawDestiny; eventFiles: Record<string, string> } {
    const dir = destinyDir(id);
    const evDir = join(dir, 'events');
    const events: RawEvent[] = [];
    const eventFiles: Record<string, string> = {};
    for (const f of readdirSync(evDir).filter(f => f.endsWith('.json')).sort()) {
        for (const ev of readJson<RawEvent[]>(join(evDir, f))) {
            events.push(ev);
            eventFiles[ev.id] = f;
        }
    }
    // 线路（一条故事一个文件）与交叉事件
    const jsonFiles = (d: string) => (existsSync(d) ? readdirSync(d).filter(f => f.endsWith('.json')).sort() : []);
    const lines: RawLine[] = [];
    for (const f of jsonFiles(join(dir, 'lines'))) {
        const l = readJson<RawLine>(join(dir, 'lines', f));
        lines.push(l);
        for (const ev of l.events ?? []) eventFiles[ev.id.includes('/') ? ev.id : `${l.id}/${ev.id}`] = `lines/${f}`;
    }
    const crossings: RawEvent[] = [];
    for (const f of jsonFiles(join(dir, 'crossings'))) {
        for (const ev of readJson<RawEvent[]>(join(dir, 'crossings', f))) {
            crossings.push(ev);
            eventFiles[ev.id] = `crossings/${f}`;
        }
    }
    return {
        raw: {
            meta: readJson(join(dir, 'destiny.json')),
            talents: readJson(join(dir, 'talents.json')),
            items: readJson(join(dir, 'items.json')),
            companions: readJson(join(dir, 'companions.json')),
            skills: existsSync(join(dir, 'skills.json')) ? readJson(join(dir, 'skills.json')) : [],
            events,
            lines,
            crossings,
        },
        eventFiles,
    };
}

export function loadIndex(): DestinyIndex {
    return readJson(join(DATA_ROOT, 'index.json'));
}
