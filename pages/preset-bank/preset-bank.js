const { ensureSession, requireLogin } = require('../../utils/auth');
const store = require('../../utils/store');

// 我的题库 / 词库管理：只看自己的，可单独练习、取消订阅（删除）。
// 订阅统一在「预设题库 · 订阅」页（/pages/community/community）。
Page({
    data: {
        authState: 'checking',
        loading: false,
        tab: 'question',
        myBanks: [],
        myBooks: [],
        totalQuestions: 0,
        totalWords: 0,
        removingId: 0,
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
        const [banksRes, booksRes] = await Promise.all([
            store.listBanks(),
            store.listWordbooks(),
        ]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const banks = banksRes.data || [];
        const books = booksRes.data || [];
        const [counts, wordCounts] = await Promise.all([
            Promise.all(banks.map((b) => store.countQuestions(b.id))),
            Promise.all(books.map((b) => store.countWords(b.id))),
        ]);
        const myBanks = banks.map((b, i) => ({
            id: b.id,
            name: b.name,
            description: b.description || '',
            count: counts[i] && counts[i].count != null ? counts[i].count : 0,
            fromPreset: b.preset_bank_id != null,
        }));
        const myBooks = books.map((b, i) => ({
            id: b.id,
            name: b.name,
            description: b.description || '',
            count: wordCounts[i] && wordCounts[i].count != null ? wordCounts[i].count : 0,
            fromPreset: b.preset_library_id != null || b.preset_id != null,
        }));
        this.setData({
            loading: false,
            myBanks,
            myBooks,
            totalQuestions: myBanks.reduce((s, b) => s + b.count, 0),
            totalWords: myBooks.reduce((s, b) => s + b.count, 0),
        });
    },

    onTabTap(e) {
        this.setData({ tab: e.currentTarget.dataset.tab });
    },

    goPractice(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: '/pages/practice/practice?bankId=' + id });
    },

    goStudy(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({ url: '/pages/study/study?wordbookId=' + id });
    },

    goSubscribe() {
        wx.navigateTo({ url: '/pages/community/community' });
    },

    // 取消订阅 / 删除：连题目、计划、作答记录一起清理
    onRemove(e) {
        if (!requireLogin(this)) {
            return;
        }
        const id = e.currentTarget.dataset.id;
        const kind = e.currentTarget.dataset.kind;
        const name = e.currentTarget.dataset.name || '这份库';
        wx.showModal({
            title: '取消订阅',
            content: '将从「我的' + (kind === 'word' ? '词库' : '题库') + '」移除「' + name + '」，并清除这些' + (kind === 'word' ? '单词的计划与学习记录' : '题目的计划与作答记录') + '。确定吗？',
            success: async (res) => {
                if (!res.confirm) {
                    return;
                }
                this.setData({ removingId: id });
                const r = kind === 'word'
                    ? await store.deleteWordbookCascade(id)
                    : await store.deleteBankCascade(id);
                this.setData({ removingId: 0 });
                if (r.error) {
                    wx.showToast({ title: r.error.message || '操作失败', icon: 'none' });
                    return;
                }
                wx.showToast({ title: '已取消订阅', icon: 'success' });
                this.load();
            },
        });
    },

    goBack() {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/quiz/quiz' }) });
    },
});
