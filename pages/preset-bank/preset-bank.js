const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        loading: false,
        myBanks: [],
        totalQuestions: 0,
        presetGroups: [],
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
        const [myBanksRes, presets] = await Promise.all([
            store.listBanks(),
            store.listPresetQuestionBanks(),
        ]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const banks = myBanksRes.data || [];
        const counts = await Promise.all(banks.map((b) => store.countQuestions(b.id)));
        const myBanks = banks.map((b, i) => ({
            id: b.id,
            name: b.name,
            description: b.description || '',
            count: counts[i] && counts[i].count != null ? counts[i].count : 0,
        }));
        const totalQuestions = myBanks.reduce((s, b) => s + b.count, 0);
        // 预设题库（可能为空）
        const presetList = presets.data || [];
        const subscribedIds = new Set(banks.map((b) => b.preset_bank_id).filter((id) => id != null));
        const groupsMap = {};
        presetList.forEach((b) => {
            const cat = b.category || '其他';
            if (!groupsMap[cat]) {
                groupsMap[cat] = [];
            }
            groupsMap[cat].push({ ...b, subscribed: subscribedIds.has(b.id) });
        });
        const presetGroups = Object.keys(groupsMap).map((cat) => ({ category: cat, banks: groupsMap[cat] }));
        this.setData({ loading: false, myBanks, totalQuestions, presetGroups });
    },

    // 直接进入某个题库刷题
    goPractice(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: '/pages/practice/practice?bankId=' + id });
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
