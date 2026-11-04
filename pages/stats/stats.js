const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

function dayKey(iso) {
    if (!iso) {
        return '';
    }
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

function calcStreak(records) {
    const days = new Set();
    records.forEach((r) => {
        const k = dayKey(r.created_at);
        if (k) {
            days.add(k);
        }
    });
    let streak = 0;
    const d = new Date();
    const today = dayKey(d.toISOString());
    if (!days.has(today)) {
        d.setDate(d.getDate() - 1);
    }
    while (true) {
        const k = dayKey(d.toISOString());
        if (days.has(k)) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

Page({
    data: {
        authState: 'checking',
        loading: false,
        totalWords: 0,
        practiceCount: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        accuracy: 0,
        wrongCount: 0,
        streak: 0,
        mastered: 0,
        marksCount: 0,
        doneQuestions: 0,
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
        const [words, records, wrongs, marks, masteredWords, qmarks] = await Promise.all([
            store.countAllWords(),
            store.listPracticeRecords(),
            store.listWrongQuestions(),
            store.listAllMarks(),
            store.countMasteredWords(),
            store.listQuestionMarks(),
        ]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const recs = records.data || [];
        const markRows = marks.data || [];
        const qmRows = qmarks.data || [];
        const recQuestions = recs.reduce((s, r) => s + (r.total || 0), 0);
        const recCorrect = recs.reduce((s, r) => s + (r.correct || 0), 0);
        const totalQuestions = qmRows.length > 0 ? qmRows.reduce((s, m) => s + (m.times || 0), 0) : recQuestions;
        const totalCorrect = qmRows.length > 0 ? qmRows.reduce((s, m) => s + (m.correct_count || 0), 0) : recCorrect;
        const marksCount = markRows.length;
        const masteredMarks = markRows.filter((m) => m.status === 'mastered').length;
        const mastered = (masteredWords.count || 0) + masteredMarks;
        // 连续学习：刷题记录 ∪ 词库学习 ∪ 做题更新的日期
        const activity = recs.map((r) => r.created_at)
            .concat(markRows.map((m) => m.updated_at))
            .concat(qmRows.map((m) => m.updated_at));
        this.setData({
            loading: false,
            totalWords: (words.count || 0) + marksCount,
            practiceCount: recs.length,
            totalQuestions,
            totalCorrect,
            accuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
            wrongCount: wrongs.data ? wrongs.data.length : 0,
            streak: calcStreak(activity.map((t) => ({ created_at: t }))),
            mastered,
            marksCount,
            doneQuestions: qmRows.length,
        });
    },
});
