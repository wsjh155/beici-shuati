const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        loading: false,
        tab: 'word',
        words: [],
        questions: [],
        wordCount: 0,
        questionCount: 0,
        selectedCount: 0,
        allSelected: false,
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
        const [w, q] = await Promise.all([store.listLearnedWords(), store.listDoneQuestions()]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const words = (w.data || []).map((x) => ({ ...x, selected: false }));
        const questions = (q.data || []).map((x) => ({ ...x, selected: false }));
        this.setData({
            loading: false,
            words,
            questions,
            wordCount: words.length,
            questionCount: questions.length,
            selectedCount: 0,
            allSelected: false,
        });
    },

    switchTab(e) {
        const tab = e.currentTarget.dataset.tab;
        const list = tab === 'word' ? this.data.words : this.data.questions;
        const selectedCount = list.filter((x) => x.selected).length;
        this.setData({ tab, selectedCount, allSelected: selectedCount > 0 && selectedCount === list.length });
    },

    toggleItem(e) {
        const { type, index } = e.currentTarget.dataset;
        const key = type === 'word' ? 'words' : 'questions';
        const list = this.data[key].slice();
        if (!list[index]) {
            return;
        }
        list[index] = { ...list[index], selected: !list[index].selected };
        const selectedCount = list.filter((x) => x.selected).length;
        const patch = { selectedCount, allSelected: selectedCount > 0 && selectedCount === list.length };
        patch[key] = list;
        this.setData(patch);
    },

    toggleAll() {
        const key = this.data.tab === 'word' ? 'words' : 'questions';
        const all = !this.data.allSelected;
        const list = this.data[key].map((x) => ({ ...x, selected: all }));
        const patch = { selectedCount: all ? list.length : 0, allSelected: all };
        patch[key] = list;
        this.setData(patch);
    },

    batchDelete() {
        const tab = this.data.tab;
        const key = tab === 'word' ? 'words' : 'questions';
        const picked = this.data[key].filter((x) => x.selected);
        if (picked.length === 0) {
            wx.showToast({ title: '请先选择', icon: 'none' });
            return;
        }
        wx.showModal({
            title: '批量删除记录',
            content: '删除选中的 ' + picked.length + ' 条记录？删除后可重新' + (tab === 'word' ? '学习' : '练习') + '。',
            confirmColor: '#e5484d',
            success: async (res) => {
                if (!res.confirm) {
                    return;
                }
                if (tab === 'word') {
                    await store.deleteWordRecords(picked.map((x) => x.word));
                } else {
                    await store.deleteQuestionRecords(picked.map((x) => x.question_id));
                }
                wx.showToast({ title: '已删除 ' + picked.length + ' 条', icon: 'success' });
                this.load();
            },
        });
    },

    deleteWord(e) {
        const word = e.currentTarget.dataset.word;
        wx.showModal({
            title: '删除学习记录',
            content: '删除「' + word + '」的学习记录后，它会重新作为新词学习。确定？',
            success: async (res) => {
                if (!res.confirm) {
                    return;
                }
                const r = await store.deleteWordRecord(word);
                if (r.error) {
                    wx.showToast({ title: r.error.message || '删除失败', icon: 'none' });
                    return;
                }
                wx.showToast({ title: '已删除，可重新学习', icon: 'success' });
                this.load();
            },
        });
    },

    deleteQuestion(e) {
        const id = e.currentTarget.dataset.id;
        wx.showModal({
            title: '删除作答记录',
            content: '删除后这道题会重新进入总计划练习。确定？',
            success: async (res) => {
                if (!res.confirm) {
                    return;
                }
                const r = await store.deleteQuestionRecord(id);
                if (r.error) {
                    wx.showToast({ title: r.error.message || '删除失败', icon: 'none' });
                    return;
                }
                wx.showToast({ title: '已删除，可重新练习', icon: 'success' });
                this.load();
            },
        });
    },
});
