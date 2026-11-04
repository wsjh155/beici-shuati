const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        dailyNew: 20,
        dailyReview: 50,
        dailyQuestions: 20,
        wordOrder: 'random',
        questionOrder: 'random',
        autoAdjust: true,
        dueCount: 0,
        newCount: 0,
        totalWords: 0,
        masteredCount: 0,
        recentAccuracy: 0,
        adjustTip: '',
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
        const [settings, due, fresh, totalWords, mastered, recent, marks] = await Promise.all([
            store.getPlanSettings(),
            store.listDueWords(),
            store.listNewWords(),
            store.countAllWords(),
            store.countMasteredWords(),
            store.recentReviewStats(7),
            store.listMarksWithWords(),
        ]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const s = settings.data || {};
        const markRows = marks.data || [];
        const nowTs = Date.now();
        const dueMarks = markRows.filter((m) => m.status === 'learning'
            && m.next_review_at && new Date(m.next_review_at).getTime() <= nowTs);
        const dueWordsList = due.data || [];
        const dueWordSet = new Set(dueWordsList.map((w) => w.word));
        const dueMarksOnly = dueMarks.filter((m) => !dueWordSet.has(m.word));
        const marksCount = markRows.length;
        const masteredMarks = markRows.filter((m) => m.status === 'mastered').length;
        const total = (totalWords.count || 0) + marksCount;
        const masteredCount = (mastered.count || 0) + masteredMarks;
        const recentData = recent.data || { total: 0, known: 0 };
        const recentAccuracy = recentData.total > 0 ? Math.round((recentData.known / recentData.total) * 100) : 0;
        const autoAdjust = s.auto_adjust != null ? s.auto_adjust : true;
        let dailyNew = s.daily_new != null ? s.daily_new : 20;
        let adjustTip = '';
        let autoAdjusted = false;
        if (recentData.total >= 10) {
            if (autoAdjust && recentAccuracy >= 85 && dailyNew < 50) {
                dailyNew = dailyNew + 5;
                autoAdjusted = true;
                adjustTip = '近期掌握良好，已自动将每日新词增加到 ' + dailyNew + ' 个，保存后生效';
            } else if (autoAdjust && recentAccuracy < 50 && dailyNew > 5) {
                dailyNew = dailyNew - 5;
                autoAdjusted = true;
                adjustTip = '近期遗忘较多，已自动将每日新词减少到 ' + dailyNew + ' 个，保存后生效';
            } else if (recentAccuracy >= 85) {
                adjustTip = '近期掌握良好，可适当增加每日新词';
            } else if (recentAccuracy < 50) {
                adjustTip = '近期遗忘较多，建议减少每日新词、加强复习';
            } else {
                adjustTip = '近期掌握平稳，保持当前计划即可';
            }
        } else {
            adjustTip = '学习记录还不足，先按当前计划学习';
        }
        this.setData({
            dailyNew,
            dailyReview: s.daily_review != null ? s.daily_review : 50,
            dailyQuestions: s.daily_questions != null ? s.daily_questions : 20,
            wordOrder: s.word_order === 'order' ? 'order' : 'random',
            questionOrder: s.question_order === 'order' ? 'order' : 'random',
            autoAdjust,
            dueCount: dueWordsList.length + dueMarksOnly.length,
            newCount: fresh.data ? fresh.data.length : 0,
            totalWords: total,
            masteredCount,
            recentAccuracy,
            adjustTip,
        });
    },

    onNewChange(e) {
        this.setData({ dailyNew: Number(e.detail.value) });
    },
    onReviewChange(e) {
        this.setData({ dailyReview: Number(e.detail.value) });
    },
    onQuestionsChange(e) {
        this.setData({ dailyQuestions: Number(e.detail.value) });
    },
    onAutoToggle(e) {
        this.setData({ autoAdjust: e.detail.value });
    },

    // 顺序切换：kind = word | question（立即保存，无需点保存按钮）
    async onOrderTap(e) {
        const kind = e.currentTarget.dataset.kind === 'question' ? 'question' : 'word';
        const mode = e.currentTarget.dataset.mode === 'order' ? 'order' : 'random';
        const current = kind === 'question' ? this.data.questionOrder : this.data.wordOrder;
        if (mode === current) {
            return;
        }
        if (kind === 'question') {
            this.setData({ questionOrder: mode });
        } else {
            this.setData({ wordOrder: mode });
        }
        const r = await store.saveOrderMode(kind, mode);
        if (r.error) {
            wx.showToast({ title: '保存失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: mode === 'random' ? '已设为乱序' : '已设为顺序', icon: 'none' });
    },

    async save() {
        this.setData({ saving: true });
        const r = await store.savePlanSettings({
            daily_new: this.data.dailyNew,
            daily_review: this.data.dailyReview,
            daily_questions: this.data.dailyQuestions,
            word_order: this.data.wordOrder,
            question_order: this.data.questionOrder,
            auto_adjust: this.data.autoAdjust,
            updated_at: store.nowISO(),
        });
        this.setData({ saving: false });
        if (r.error) {
            wx.showToast({ title: r.error.message || '保存失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: '计划已保存', icon: 'success' });
    },

    goStartPlan() {
        wx.navigateTo({ url: '/pages/study/study?mode=planPool' });
    },
});
