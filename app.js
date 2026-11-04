const { cloud } = require('./utils/cloud');

App({
    globalData: {
        appName: '背词刷题',
    },

    // 会话缓存：首次调用时向云端确认登录态，之后复用。
    ensureSession() {
        if (!this.sessionPromise) {
            this.sessionPromise = cloud.auth.getSession();
        }
        return this.sessionPromise;
    },

    resetSession() {
        this.sessionPromise = null;
    },
});
