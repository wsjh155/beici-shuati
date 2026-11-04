const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

function parseOptions(q) {
    let options = [];
    try {
        options = JSON.parse(q.options || '[]');
    } catch (e) {
        options = [];
    }
    if (!Array.isArray(options)) {
        options = [];
    }
    return options.map((text, i) => ({
        label: String.fromCharCode(65 + i),
        text,
        selected: false,
        correct: false,
        wrong: false,
    }));
}

function answerLabels(q) {
    return (q.answer || '').trim().toUpperCase().replace(/\s+/g, '').split('');
}

Page({
    data: {
        authState: 'checking',
        bankId: null,
        idsStr: '',
        mode: '',
        loading: false,
        questions: [],
        index: 0,
        current: null,
        submitted: false,
        correct: false,
        reveal: false,
        totalCount: 0,
        correctCount: 0,
        done: false,
        finalTotal: 0,
        finalCorrect: 0,
        finalScore: 0,
        orderMode: 'random',
    },

    onLoad(options) {
        this.setData({
            bankId: options.bankId || null,
            idsStr: options.ids || '',
            mode: options.mode || '',
        });
    },

    onShow() {
        this.restore();
    },

    async restore() {
        const session = await ensureSession(this);
        if (!session) {
            return;
        }
        this.loadQuestions();
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    async loadQuestions() {
        this.setData({ loading: true });
        const settingsRes = await store.getPlanSettings();
        const st = settingsRes.data || {};
        const orderMode = st.question_order === 'order' ? 'order' : 'random';
        const daily = st.daily_questions != null ? st.daily_questions : 20;
        let result;
        if (this.data.idsStr) {
            const ids = String(this.data.idsStr).split(',').map((s) => Number(s)).filter((n) => n > 0);
            result = await store.getQuestionsByIds(ids);
        } else if (this.data.mode === 'redo') {
            const r = await store.listDoneQuestions();
            result = {
                data: (r.data || []).map((d) => ({
                    id: d.question_id,
                    bank_id: d.bank_id,
                    type: d.type,
                    stem: d.stem,
                    options: d.options,
                    answer: d.answer,
                    analysis: d.analysis,
                })),
            };
        } else if (this.data.mode === 'plan') {
            const marks = await store.listQuestionMarks();
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const todayDone = (marks.data || []).filter((m) => m.updated_at
                && new Date(m.updated_at).getTime() >= startOfDay.getTime()).length;
            const remain = daily - todayDone;
            result = remain > 0 ? await store.pickDailyQuestions(remain) : { data: [] };
        } else if (this.data.mode === 'planPool') {
            const [planRes, marksRes] = await Promise.all([
                store.listPlanQuestions(),
                store.listQuestionMarks(),
            ]);
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const markRows = marksRes.data || [];
            const todayDone = markRows.filter((m) => m.updated_at
                && new Date(m.updated_at).getTime() >= startOfDay.getTime()).length;
            const remain = Math.max(daily - todayDone, 0);
            const markMap = {};
            markRows.forEach((m) => { markMap[m.question_id] = m; });
            const scored = (planRes.data || []).map((q) => {
                const m = markMap[q.id];
                const score = m ? (m.last_result === 'wrong' ? 0 : 1) : 2;
                return { q, score, times: m ? (m.times || 0) : 0 };
            });
            scored.sort((a, b) => (a.score - b.score) || (a.times - b.times) || (a.q.id - b.q.id));
            result = { data: scored.slice(0, remain).map((s) => s.q) };
        } else {
            result = await store.listQuestions(this.data.bankId);
        }
        if (this.data.authState !== 'signed-in') {
            return;
        }
        // 正序基准（错题优先等筛选顺序），乱序只在展示时打乱
        this.baseQuestions = (result.data || []).map((q) => ({ ...q, options: parseOptions(q) }));
        const questions = store.applyOrder(this.baseQuestions, orderMode);
        this.setData({
            loading: false,
            orderMode,
            questions,
            index: 0,
            current: questions.length > 0 ? questions[0] : null,
            submitted: false,
            correct: false,
            reveal: false,
            totalCount: 0,
            correctCount: 0,
            done: false,
        });
    },

    // 已作答的题（含当前题）保持不动，只重排后面的题
    toggleOrder() {
        const next = this.data.orderMode === 'random' ? 'order' : 'random';
        const base = this.baseQuestions || this.data.questions || [];
        const head = this.data.questions.slice(0, this.data.index + 1);
        const headIds = head.map((q) => q.id);
        const rest = base.filter((q) => headIds.indexOf(q.id) < 0);
        const list = head.concat(store.applyOrder(rest, next));
        this.setData({ orderMode: next, questions: list });
        store.saveOrderMode('question', next);
        wx.showToast({ title: next === 'random' ? '已切换为乱序' : '已切换为正序', icon: 'none' });
    },

    onOptionTap(e) {
        if (this.data.submitted) {
            return;
        }
        const idx = e.currentTarget.dataset.idx;
        const cur = this.data.current;
        const options = cur.options.slice();
        if (cur.type === 'multiple') {
            options[idx].selected = !options[idx].selected;
            this.setData({ 'current.options': options });
        } else {
            options.forEach((o, i) => {
                o.selected = i === idx;
            });
            this.setData({ 'current.options': options });
            this.submit();
        }
    },

    submit() {
        if (this.data.submitted) {
            return;
        }
        const cur = this.data.current;
        const labels = cur.options.filter((o) => o.selected).map((o) => o.label);
        if (labels.length === 0) {
            wx.showToast({ title: '请先选择答案', icon: 'none' });
            return;
        }
        const ans = answerLabels(cur);
        const correct = labels.slice().sort().join('') === ans.slice().sort().join('');
        const options = cur.options.map((o) => ({
            ...o,
            correct: ans.indexOf(o.label) >= 0,
            wrong: o.selected && ans.indexOf(o.label) < 0,
        }));
        this.setData({ submitted: true, correct, 'current.options': options });

        if (correct) {
            store.removeWrongByQuestionId(cur.id);
        } else {
            store.addWrongQuestion(cur.id, this.data.bankId);
        }
        store.recordQuestionResult(cur.id, cur.bank_id || this.data.bankId, correct);
        this.setData({
            totalCount: this.data.totalCount + 1,
            correctCount: this.data.correctCount + (correct ? 1 : 0),
        });
    },

    revealAnswer() {
        this.setData({ reveal: true });
    },

    selfGrade(e) {
        const grade = e.currentTarget.dataset.grade;
        const cur = this.data.current;
        const right = grade === 'right';
        if (right) {
            store.removeWrongByQuestionId(cur.id);
        } else {
            store.addWrongQuestion(cur.id, this.data.bankId);
        }
        store.recordQuestionResult(cur.id, cur.bank_id || this.data.bankId, right);
        this.setData({
            totalCount: this.data.totalCount + 1,
            correctCount: this.data.correctCount + (right ? 1 : 0),
        });
        this.next();
    },

    next() {
        const idx = this.data.index + 1;
        if (idx >= this.data.questions.length) {
            this.finish();
        } else {
            this.setData({
                index: idx,
                current: this.data.questions[idx],
                submitted: false,
                correct: false,
                reveal: false,
            });
        }
    },

    async finish() {
        const total = this.data.totalCount;
        const correct = this.data.correctCount;
        const score = total > 0 ? Math.round((correct / total) * 100) : 0;
        this.setData({ done: true, finalTotal: total, finalCorrect: correct, finalScore: score });
        store.createPracticeRecord({ bank_id: this.data.bankId, total, correct, score });
    },

    goBack() {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/quiz/quiz' }) });
    },
});
