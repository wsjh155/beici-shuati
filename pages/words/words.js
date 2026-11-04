const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        loading: false,
        total: 0,
        due: 0,
        fresh: 0,
        mastered: 0,
        learning: 0,
        dailyNew: 20,
        dailyReview: 50,
        planNew: 0,
        planReview: 0,
        orderMode: 'random',
        showCreate: false,
        formName: '',
        formDesc: '',
        saving: false,
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
        const [stat, settings] = await Promise.all([store.planWordStats(), store.getPlanSettings()]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const s = settings.data || {};
        const dailyNew = s.daily_new != null ? s.daily_new : 20;
        const dailyReview = s.daily_review != null ? s.daily_review : 50;
        const d = stat.data || { total: 0, due: 0, fresh: 0, mastered: 0, learning: 0 };
        this.setData({
            loading: false,
            total: d.total,
            due: d.due,
            fresh: d.fresh,
            mastered: d.mastered,
            learning: d.learning,
            dailyNew,
            dailyReview,
            planNew: Math.min(d.fresh, dailyNew),
            planReview: Math.min(d.due, dailyReview),
            orderMode: s.word_order === 'order' ? 'order' : 'random',
        });
    },

    // 乱序 / 正序切换（立即保存）
    async onOrderTap(e) {
        const mode = e.currentTarget.dataset.mode === 'order' ? 'order' : 'random';
        if (mode === this.data.orderMode) {
            return;
        }
        this.setData({ orderMode: mode });
        const r = await store.saveOrderMode('word', mode);
        if (r.error) {
            wx.showToast({ title: '保存失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: mode === 'random' ? '已设为乱序' : '已设为正序', icon: 'none' });
    },

    // 底部「单词」标签点按：直接进入学习
    onTabItemTap() {
        wx.navigateTo({ url: '/pages/study/study?mode=planPool' });
    },

    goStart() {
        wx.navigateTo({ url: '/pages/study/study?mode=planPool' });
    },

    goPlan() {
        wx.navigateTo({ url: '/pages/plan/plan' });
    },

    goPreset() {
        wx.navigateTo({ url: '/pages/preset/preset' });
    },

    goRecords() {
        wx.navigateTo({ url: '/pages/learned/learned' });
    },

    goImport() {
        wx.navigateTo({ url: '/pages/import/import' });
    },

    openCreate() {
        this.setData({ showCreate: true, formName: '', formDesc: '' });
    },
    closeCreate() {
        this.setData({ showCreate: false });
    },
    onNameInput(e) {
        this.setData({ formName: e.detail.value });
    },
    onDescInput(e) {
        this.setData({ formDesc: e.detail.value });
    },
    noop() {},

    async submitCreate() {
        const name = (this.data.formName || '').trim();
        if (!name) {
            wx.showToast({ title: '请输入名称', icon: 'none' });
            return;
        }
        this.setData({ saving: true });
        const r = await store.createWordbook({ name, description: (this.data.formDesc || '').trim() || null });
        this.setData({ saving: false });
        if (r.error) {
            wx.showToast({ title: r.error.message || '创建失败', icon: 'none' });
            return;
        }
        this.setData({ showCreate: false });
        wx.showToast({ title: '已创建', icon: 'success' });
    },
});
