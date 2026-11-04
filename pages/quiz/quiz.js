const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        loading: false,
        dailyQuestions: 20,
        todayDone: 0,
        planTotal: 0,
        planDone: 0,
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
        const [settings, stats, marks] = await Promise.all([
            store.getPlanSettings(),
            store.planQuestionStats(),
            store.listQuestionMarks(),
        ]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const dailyQuestions = settings.data && settings.data.daily_questions != null ? settings.data.daily_questions : 20;
        const s = stats.data || { total: 0, done: 0 };
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todayDone = (marks.data || []).filter((m) => m.updated_at
            && new Date(m.updated_at).getTime() >= startOfDay.getTime()).length;
        this.setData({
            loading: false,
            dailyQuestions,
            todayDone,
            planTotal: s.total,
            planDone: s.done,
            orderMode: settings.data && settings.data.question_order === 'order' ? 'order' : 'random',
        });
    },

    // 乱序 / 正序切换（立即保存）
    async onOrderTap(e) {
        const mode = e.currentTarget.dataset.mode === 'order' ? 'order' : 'random';
        if (mode === this.data.orderMode) {
            return;
        }
        this.setData({ orderMode: mode });
        const r = await store.saveOrderMode('question', mode);
        if (r.error) {
            wx.showToast({ title: '保存失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: mode === 'random' ? '已设为乱序' : '已设为正序', icon: 'none' });
    },

    // 底部「刷题」标签点按：直接进入刷题
    onTabItemTap() {
        wx.navigateTo({ url: '/pages/practice/practice?mode=planPool' });
    },

    goStart() {
        wx.navigateTo({ url: '/pages/practice/practice?mode=planPool' });
    },

    goPlan() {
        wx.navigateTo({ url: '/pages/plan/plan' });
    },

    goPresetBank() {
        wx.navigateTo({ url: '/pages/preset-bank/preset-bank' });
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
        const r = await store.createBank({ name, description: (this.data.formDesc || '').trim() || null });
        this.setData({ saving: false });
        if (r.error) {
            wx.showToast({ title: r.error.message || '创建失败', icon: 'none' });
            return;
        }
        this.setData({ showCreate: false });
        wx.showToast({ title: '已创建', icon: 'success' });
    },
});
