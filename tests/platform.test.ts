/** 平台适配：模拟 wx 全局对象，验证版本更新检测 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from '../assets/scripts/game/platform';

const g = globalThis as { wx?: unknown };

function fakeWx() {
    const handlers: { ready?: () => void; failed?: () => void } = {};
    const um = {
        onUpdateReady: (fn: () => void) => { handlers.ready = fn; },
        onUpdateFailed: (fn: () => void) => { handlers.failed = fn; },
        applyUpdate: vi.fn(),
    };
    const wx = {
        getSystemInfoSync: () => ({}),
        getUpdateManager: () => um,
        showModal: vi.fn((o: { success?: (r: { confirm: boolean }) => void }) => o.success?.({ confirm: true })),
        showToast: vi.fn(),
    };
    g.wx = wx;
    return { wx, um, handlers };
}

describe('Platform.checkUpdate', () => {
    afterEach(() => { delete g.wx; });

    it('非微信环境直接跳过', () => {
        expect(() => Platform.checkUpdate()).not.toThrow();
    });

    it('新版本下载好：弹窗（不可取消）→ 确认后重启应用', () => {
        const { wx, um, handlers } = fakeWx();
        Platform.checkUpdate();
        expect(um.applyUpdate).not.toHaveBeenCalled();
        handlers.ready!();
        expect(wx.showModal).toHaveBeenCalledWith(expect.objectContaining({ showCancel: false }));
        expect(um.applyUpdate).toHaveBeenCalledTimes(1);
    });

    it('下载失败：提示删除后重新打开', () => {
        const { wx, handlers } = fakeWx();
        Platform.checkUpdate();
        handlers.failed!();
        expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('重新打开') }));
    });

    it('基础库太旧（没有 getUpdateManager）不报错', () => {
        g.wx = { getSystemInfoSync: () => ({}) };
        expect(() => Platform.checkUpdate()).not.toThrow();
    });
});
