const { ensureSession } = require('../../utils/auth');
const { cloud } = require('../../utils/cloud');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        userName: '',
        menus: [
            { key: 'stats', emoji: '📊', text: '学习统计', desc: '进度与正确率', path: '/pages/stats/stats' },
            { key: 'wrong', emoji: '📝', text: '错题回顾', desc: '重做错题巩固', path: '/pages/wrong/wrong' },
            { key: 'import', emoji: '📥', text: '导入内容', desc: '文本或表格粘贴', path: '/pages/import/import' },
            { key: 'tutorial', emoji: '📖', text: '新手教程', desc: '快速上手使用指南', path: '/pages/tutorial/tutorial' },
            { key: 'agreement', emoji: '📄', text: '用户协议与隐私政策', desc: '账号、数据与内容规范', path: '/pages/agreement/agreement' },
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

    goAgreement() {
        wx.navigateTo({ url: '/pages/agreement/agreement' });
    },

    // 用户主动点击才打开登录弹层，弹层内可随时「暂不登录」
    onOpenLogin() {
        const gate = this.selectComponent('#guestGate');
        if (gate) {
            gate.open();
        }
    },

    onMenuTap(e) {
        const path = e.currentTarget.dataset.path;
        if (path) {
            wx.navigateTo({ url: path, fail: () => wx.showToast({ title: '打开失败，请重试', icon: 'none' }) });
        }
    },

    // 注销：删除本人的全部私有学习数据，操作前二次确认
    onDeleteData() {
        wx.showModal({
            title: '删除我的数据',
            content: '将永久删除你的词库、题库、学习记录与计划设置，且不可恢复。确定继续吗？',
            confirmText: '确认删除',
            confirmColor: '#e5484d',
            success: async (res) => {
                if (!res.confirm) {
                    return;
                }
                wx.showLoading({ title: '正在删除', mask: true });
                const r = await store.deleteMyAccountData();
                wx.hideLoading();
                if (r.error || (r.data && r.data.failed && r.data.failed.length > 0)) {
                    wx.showToast({ title: '部分数据删除失败，请稍后重试', icon: 'none' });
                    return;
                }
                await cloud.auth.signOut();
                getApp().resetSession();
                this.setData({ authState: 'signed-out' });
                wx.showToast({ title: '个人数据已删除', icon: 'success' });
            },
        });
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
