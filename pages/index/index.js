const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        dueCount: 0,
        newCount: 0,
        planReview: 0,
        planNew: 0,
        menus: [
            { key: 'words', emoji: '📖', text: '背单词', desc: '卡片学习与发音', path: '/pages/words/words', tab: true },
            { key: 'quiz', emoji: '✏️', text: '刷题', desc: '题库练习自动判分', path: '/pages/quiz/quiz', tab: true },
            { key: 'word-overview', emoji: '📚', text: '词库总览', desc: '选择词库订阅，自动进总计划', path: '/pages/preset/preset', tab: false },
            { key: 'question-overview', emoji: '🗂️', text: '题库总览', desc: '选择题库订阅，自动进总计划', path: '/pages/preset-bank/preset-bank', tab: false },
            { key: 'preset', emoji: '📚', text: '预设词库', desc: '四六级考研等一键订阅', path: '/pages/preset/preset', tab: false },
            { key: 'learned', emoji: '🌟', text: '学习记录', desc: '删除记录即可重学单词/题目', path: '/pages/learned/learned', tab: false },
            { key: 'plan', emoji: '🗓️', text: '背词计划', desc: '每日计划与复习提醒', path: '/pages/plan/plan', tab: false },
            { key: 'preset-bank', emoji: '📋', text: '预设题库', desc: '四六级考研题一键订阅', path: '/pages/preset-bank/preset-bank', tab: false },
            { key: 'import', emoji: '📥', text: '导入', desc: '导入单词或题目', path: '/pages/import/import', tab: false },
            { key: 'wrong', emoji: '📝', text: '错题回顾', desc: '重做错题巩固', path: '/pages/wrong/wrong', tab: false },
            { key: 'stats', emoji: '📊', text: '学习统计', desc: '进度与正确率', path: '/pages/stats/stats', tab: false },
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
        this.loadOverview();
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    async loadOverview() {
        const [stats, settings] = await Promise.all([
            store.planWordStats(),
            store.getPlanSettings(),
        ]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const s = settings.data || {};
        const dailyNew = s.daily_new != null ? s.daily_new : 20;
        const dailyReview = s.daily_review != null ? s.daily_review : 50;
        const d = stats.data || { due: 0, fresh: 0 };
        this.setData({
            dueCount: d.due,
            newCount: d.fresh,
            planReview: Math.min(d.due, dailyReview),
            planNew: Math.min(d.fresh, dailyNew),
        });
    },

    onMenuTap(event) {
        const { path, tab } = event.currentTarget.dataset;
        if (!path) {
            wx.showToast({ title: '该功能暂未接入', icon: 'none' });
            return;
        }
        if (tab) {
            wx.switchTab({ url: path });
            return;
        }
        wx.navigateTo({ url: path, fail: () => wx.showToast({ title: '页面暂未开放', icon: 'none' }) });
    },

    goDue() {
        if (this.data.dueCount > 0) {
            wx.navigateTo({ url: '/pages/study/study?mode=review' });
        } else {
            wx.showToast({ title: '暂无待复习单词', icon: 'none' });
        }
    },

    goNew() {
        wx.switchTab({ url: '/pages/words/words' });
    },

    goStartPlan() {
        wx.navigateTo({ url: '/pages/study/study?mode=planPool' });
    },
});
