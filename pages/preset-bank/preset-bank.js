const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        loading: false,
        groups: [],
        subscribingId: 0,
    },

    onShow() {
        this.restore();
    },

    async restore() {
        const session = await ensureSession(this);
        if (!session) {
            return;
        }
        this.load();
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    async load() {
        this.setData({ loading: true });
        const [presets, myBanks] = await Promise.all([store.listPresetQuestionBanks(), store.listBanks()]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const presetList = presets.data || [];
        const subscribedIds = new Set((myBanks.data || []).map((b) => b.preset_bank_id).filter((id) => id != null));
        const groupsMap = {};
        presetList.forEach((b) => {
            const cat = b.category || '其他';
            if (!groupsMap[cat]) {
                groupsMap[cat] = [];
            }
            groupsMap[cat].push({ ...b, subscribed: subscribedIds.has(b.id) });
        });
        const groups = Object.keys(groupsMap).map((cat) => ({ category: cat, banks: groupsMap[cat] }));
        this.setData({ loading: false, groups });
    },

    onSubscribe(e) {
        const id = e.currentTarget.dataset.id;
        this.setData({ subscribingId: id });
        wx.showModal({
            title: '订阅题库',
            content: '订阅后将把该题库的题目复制到你的题库，可随时练习。确定订阅吗？',
            success: async (res) => {
                if (!res.confirm) {
                    this.setData({ subscribingId: 0 });
                    return;
                }
                const r = await store.subscribePresetQuestionBank(id);
                this.setData({ subscribingId: 0 });
                if (r.error) {
                    wx.showToast({ title: r.error.message || '订阅失败', icon: 'none' });
                    return;
                }
                wx.showToast({ title: '已订阅 ' + r.data.count + ' 道题', icon: 'success' });
                this.load();
            },
        });
    },

    goBack() {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/quiz/quiz' }) });
    },
});
