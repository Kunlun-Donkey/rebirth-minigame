/**
 * 开放数据域：好友排行榜（微信要求好友数据只能在这里读取和绘制）。
 * 主域通过 wx.getOpenDataContext().postMessage({ type: 'rank' | 'close' }) 控制；
 * 画在 sharedCanvas 上，主域用 Cocos 的 SubContextView 组件显示。
 * 数据来自主域 Platform.reportScore 写入的 KV：endings（收集结局数）、lives（总轮回世数）。
 * 构建时在 Cocos 构建面板「开放数据域代码目录」填 openDataContext（见 docs/dev/rank-setup.md）。
 */
/* global wx */
var canvas = wx.getSharedCanvas();
var ctx = canvas.getContext('2d');
var FONT = '"PingFang SC","Microsoft YaHei",sans-serif';

function kv(list, key) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].key === key) return Number(list[i].value) || 0;
    return 0;
}

function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function draw(rows, avatars) {
    var W = canvas.width, H = canvas.height;
    clear();
    ctx.fillStyle = '#fbf3df';
    roundRect(0, 0, W, H, 24);
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7a4a1f';
    ctx.font = 'bold ' + Math.round(W * 0.06) + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('好友轮回榜', W / 2, H * 0.07);
    ctx.font = Math.round(W * 0.032) + 'px ' + FONT;
    ctx.fillStyle = '#8a7356';
    ctx.fillText('按收集的结局数排名', W / 2, H * 0.12);
    if (!rows.length) {
        ctx.fillText('还没有好友在轮回。分享墓志铭，拉 TA 一起投胎吧。', W / 2, H * 0.4);
        return;
    }
    var top = H * 0.16, rowH = Math.min(H * 0.08, (H * 0.82) / rows.length);
    ctx.textAlign = 'left';
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i], y = top + i * rowH;
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(181,121,58,0.08)';
            ctx.fillRect(W * 0.04, y, W * 0.92, rowH);
        }
        ctx.fillStyle = i < 3 ? ['#d68a00', '#8e8e8e', '#b5793a'][i] : '#6b5136';
        ctx.font = 'bold ' + Math.round(rowH * 0.42) + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), W * 0.1, y + rowH / 2);
        var img = avatars[i];
        var s = rowH * 0.7;
        if (img && img.complete) ctx.drawImage(img, W * 0.17, y + (rowH - s) / 2, s, s);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#3b2a1a';
        ctx.font = Math.round(rowH * 0.36) + 'px ' + FONT;
        var name = r.nickname || '';
        if (name.length > 8) name = name.slice(0, 7) + '…';
        ctx.fillText(name, W * 0.17 + s + W * 0.03, y + rowH / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#7a4a1f';
        ctx.font = 'bold ' + Math.round(rowH * 0.34) + 'px ' + FONT;
        ctx.fillText(r.endings + ' 结局 · ' + r.lives + ' 世', W * 0.94, y + rowH / 2);
    }
}

function showRank() {
    wx.getFriendCloudStorage({
        keyList: ['endings', 'lives'],
        success: function (res) {
            var rows = (res.data || []).map(function (u) {
                return { nickname: u.nickname, avatarUrl: u.avatarUrl, endings: kv(u.KVDataList, 'endings'), lives: kv(u.KVDataList, 'lives') };
            }).filter(function (r) { return r.lives > 0; });
            rows.sort(function (a, b) { return b.endings - a.endings || a.lives - b.lives; });
            rows = rows.slice(0, 10);
            var avatars = [];
            draw(rows, avatars);
            rows.forEach(function (r, i) {
                if (!r.avatarUrl) return;
                var img = wx.createImage();
                img.onload = function () { draw(rows, avatars); };
                img.src = r.avatarUrl;
                avatars[i] = img;
            });
        },
        fail: function () {
            clear();
            ctx.fillStyle = '#6b5136';
            ctx.font = '28px ' + FONT;
            ctx.textAlign = 'center';
            ctx.fillText('好友数据暂时取不到，稍后再试', canvas.width / 2, canvas.height / 2);
        },
    });
}

wx.onMessage(function (msg) {
    if (!msg) return;
    if (msg.type === 'rank') showRank();
    else if (msg.type === 'close') clear();
});
