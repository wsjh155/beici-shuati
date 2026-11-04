const { ensureSession } = require('../../utils/auth');
const { cloud } = require('../../utils/cloud');

Page({
    data: {
        authState: 'checking',
        userName: '',
        menus: [
            { key: 'stats', emoji: '📊', text: '学习统计', desc: '进度与正确率', path: '/pages/stats/stats' },
            { key: 'wrong', emoji: '📝', text: '错题回顾', desc: '重做错题巩固', path: '/pages/wrong/wrong' },
            { key: 'import', emoji: '📥', text: '导入内容', desc: '文本或表格粘贴', path: '/pages/import/import' },
            { key: 'tutorial', emoji: '📖', text: '新手教程', desc: '快速上手使用指南', path: '/pages/tutorial/tutorial' },
            { key: 'sponsor', emoji: '❤️', text: '赞助支持', desc: '微信 / 支付宝赞赏', path: '/pages/sponsor/sponsor' },
            { key: 'about', emoji: 'ℹ️', text: '关于小程序', desc: '版本与功能说明', path: '/pages/about/about' },
        ],
    },

    onShow() {
        this.restore();
    },

    async restore() {
        const session = await ensureSession(this);
        if (!session) {
            return;
        }
        const user = session.user || {};
        const name = user.name || '已登录用户';
        this.setData({ userName: name, avatarText: name[0] });
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    onMenuTap(e) {
        const path = e.currentTarget.dataset.path;
        if (path) {
            wx.navigateTo({ url: path, fail: () => wx.showToast({ title: '页面暂未开放', icon: 'none' }) });
        }
    },

    onLogout() {
        wx.showModal({
            title: '退出登录',
            content: '确定要退出登录吗？',
            confirmColor: '#e5484d',
            success: async (res) => {
                if (!res.confirm) {
                    return;
                }
                await cloud.auth.signOut();
                getApp().resetSession();
                this.setData({ authState: 'signed-out' });
            },
        });
    },
});
