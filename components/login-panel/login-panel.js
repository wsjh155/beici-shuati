// 微信一键登录组件：成功后触发 signedin 事件，只处理登录，不处理页面数据。
const { cloud } = require('../../utils/cloud');

Component({
    data: {
        loggingIn: false,
        error: '',
    },

    methods: {
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
                        this.setData({ loggingIn: false });
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
