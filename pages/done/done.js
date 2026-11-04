const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        loading: false,
        list: [],
        total: 0,
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
        const r = await store.listDoneQuestions();
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const list = r.data || [];
        this.setData({ loading: false, list, total: list.length });
    },

    addAllToPlan() {
        if (this.data.list.length === 0) {
            return;
        }
        this.addToPlan(this.data.list.map((q) => q.question_id));
    },

    addOneToPlan(e) {
        const id = e.currentTarget.dataset.id;
        this.addToPlan([id]);
    },

    async addToPlan(ids) {
        const added = await store.addQuestionsToPlan(ids);
        await store.resetQuestionMarksToNew(ids);
        if (added.error) {
            wx.showToast({ title: added.error.message || '加入失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: '已加入总计划 ' + (added.data || 0) + ' 道', icon: 'success' });
        this.load();
    },
});
