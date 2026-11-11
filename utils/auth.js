// 页面通用的登录态恢复：只读取会话，不触发也不强制登录。
// 未登录时页面仍应展示内容（游客模式），登录一律由用户主动点击触发。
async function ensureSession(page) {
    page.setData({ authState: 'checking' });
    const { data: session, error } = await getApp().ensureSession();
    if (error || !session) {
        getApp().resetSession();
        page.setData({ authState: 'signed-out' });
        return null;
    }
    page.setData({ authState: 'signed-in' });
    return session;
}

// 需要账号的操作：不跳转登录页、不强制登录，只打开可取消的登录弹层。
// 返回 true 表示已登录可继续，false 表示已引导用户自行选择。
function requireLogin(page) {
    if (page && page.data && page.data.authState === 'signed-in') {
        return true;
    }
    const gate = page && page.selectComponent && page.selectComponent('#guestGate');
    if (gate) {
        gate.open();
    } else {
        wx.showToast({ title: '可先浏览，登录后保存进度', icon: 'none' });
    }
    return false;
}

module.exports = { ensureSession, requireLogin };
