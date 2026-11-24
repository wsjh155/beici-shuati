const share = require('../../utils/share');

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
    onShareAppMessage() {
        return share.toFriend();
    },
    data: {
        authState: 'checking',
        loading: false,
        learnedWords: 0,
        wordBankCount: 0,
        reviewTimes: 0,
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
        const [words, learned, records, wrongs, marks, masteredWords, qmarks, reviews] = await Promise.all([
            store.countAllWords(),
            store.listLearnedWords(),
            store.listPracticeRecords(),
            store.listWrongQuestions(),
            store.listAllMarks(),
            store.countMasteredWords(),
            store.listQuestionMarks(),
            store.getReviewStats(),
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
        // 已学单词 = 累计产生过学习记录的不同单词：
        // ① 当前词库里已学过的词（与学习记录页同源）② 历史复习日志里的词（词库被换掉后仍算学过）
        // ① 中来自单词本的有 id，可与 ② 的 word_id 去重；词库标记是独立文本体系，单独按词计
        const learnedList = learned.data || [];
        const reviewData = reviews.data || {};
        const learnedIds = new Set(learnedList.filter((x) => x.id != null).map((x) => String(x.id)));
        (reviewData.wordIds || []).forEach((id) => learnedIds.add(String(id)));
        const markedOnly = new Set(learnedList.filter((x) => x.id == null && x.word).map((x) => x.word));
        const learnedWords = learnedIds.size + markedOnly.size;
        // 连续学习：刷题记录 ∪ 词库学习 ∪ 做题更新 ∪ 背词复习的日期
        const activity = recs.map((r) => r.created_at)
            .concat(markRows.map((m) => m.updated_at))
            .concat(qmRows.map((m) => m.updated_at))
            .concat(reviewData.dates || []);
        this.setData({
            loading: false,
            learnedWords,
            wordBankCount: words.count || 0,
            reviewTimes: reviewData.total || 0,
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
