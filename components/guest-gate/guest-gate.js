// 游客态登录引导：不自动弹窗、不强制跳转。
// 用户主动点「登录」才出现登录弹层，弹层随时可取消；取消后仍可继续浏览。
const { cloud } = require('../../utils/cloud');

Component({
    properties: {
        tip: {
            type: String,
            value: '可先浏览词库、题库与功能介绍；登录后才会保存你的学习进度。',
        },
    },

    data: {
        dismissed: false,
        sheetOpen: false,
        loggingIn: false,
        error: '',
    },

    methods: {
        // 供页面在需要登录的操作处调用：this.selectComponent('#guestGate').open()
        open() {
            this.setData({ sheetOpen: true, error: '' });
        },

        openLogin() {
            this.open();
        },

        closeSheet() {
            this.setData({ sheetOpen: false, loggingIn: false });
        },

        // 点提示条上的「暂不登录」：只收起提示，不打断浏览
        dismiss() {
            this.setData({ dismissed: true, sheetOpen: false });
        },

        onMaskTap() {
            this.closeSheet();
        },

        noop() {},

        onLogin() {
            if (this.data.loggingIn) {
                return;
            }
            this.setData({ loggingIn: true, error: '' });
            wx.login({
                success: async (res) => {
                    if (!res.code) {
                        this.setData({ loggingIn: false, error: '微信登录失败，请重试' });
                        return;
                    }
                    try {
                        const appid = wx.getAccountInfoSync().miniProgram.appId;
                        const result = await cloud.auth.signInWithWechat(res.code, appid);
                        if (result.error) {
                            this.setData({ loggingIn: false, error: result.error.message || '登录失败，请重试' });
                            return;
                        }
                        this.setData({ loggingIn: false, sheetOpen: false, dismissed: true });
                        this.triggerEvent('signedin', { user: result.data && result.data.user });
                    } catch (error) {
                        this.setData({ loggingIn: false, error: '登录失败，请重试' });
                    }
                },
                fail: () => {
                    this.setData({ loggingIn: false, error: '微信登录失败，请重试' });
                },
            });
        },
    },
});
