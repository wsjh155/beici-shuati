const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

function answerText(q) {
    if (q.type === 'judge') {
        return q.answer === 'A' ? '正确' : '错误';
    }
    return q.answer || '';
}

Page({
    data: {
        authState: 'checking',
        loading: false,
        wrongList: [],
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
        const wrongs = await store.listWrongQuestions();
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const wrongRows = wrongs.data || [];
        const ids = wrongRows.map((w) => w.question_id);
        const qResult = await store.getQuestionsByIds(ids);
        const qMap = {};
        (qResult.data || []).forEach((q) => {
            qMap[q.id] = q;
        });
        const list = wrongRows
            .map((w) => {
                const q = qMap[w.question_id];
                if (!q) {
                    return null;
                }
                return {
                    wrongId: w.id,
                    questionId: q.id,
                    wrongCount: w.wrong_count,
                    stem: q.stem,
                    answer: answerText(q),
                    answerLabel: q.type === 'subjective' ? '参考答案' : '正确答案',
                    analysis: q.analysis,
                    type: q.type,
                    aiGenerated: q.ai_generated === true,
                };
            })
            .filter(Boolean);
        this.setData({ loading: false, wrongList: list });
    },

    async removeWrong(e) {
        const id = e.currentTarget.dataset.id;
        const r = await store.removeWrongQuestion(id);
        if (r.error) {
            wx.showToast({ title: r.error.message || '操作失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: '已移除', icon: 'success' });
        this.load();
    },
});
