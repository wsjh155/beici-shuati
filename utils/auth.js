// 页面通用的登录态恢复：设置 authState，返回 session 或 null。
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

module.exports = { ensureSession };
