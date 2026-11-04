const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        mode: 'book',
        wordbookId: null,
        libraryId: null,
        singleWord: '',
        loading: false,
        wordList: [],
        currentIndex: 0,
        current: null,
        flipped: false,
        total: 0,
        done: false,
        learnedCount: 0,
    },

    onLoad(options) {
        const mode = options.mode;
        const allowed = ['review', 'library', 'learned', 'plan', 'planPool'];
        this.setData({
            mode: allowed.indexOf(mode) >= 0 ? mode : 'book',
            wordbookId: options.wordbookId || null,
            libraryId: options.libraryId || null,
            singleWord: options.word ? decodeURIComponent(options.word) : '',
        });
        this.audioCtx = null;
    },

    onShow() {
        this.restore();
    },

    onUnload() {
        if (this.audioCtx) {
            this.audioCtx.destroy();
            this.audioCtx = null;
        }
    },

    async restore() {
        const session = await ensureSession(this);
        if (!session) {
            return;
        }
        this.loadWords();
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    async loadWords() {
        this.setData({ loading: true });
        let list = [];
        if (this.data.mode === 'review') {
            const r = await store.listDueWords();
            list = (r.data || []).map((w) => ({ ...w, source: 'word' }));
        } else if (this.data.mode === 'library') {
            // 云端子词库：排除已背会单词
            const r = await store.listLibraryWords(this.data.libraryId, true);
            list = (r.data || []).map((w) => ({ ...w, source: 'mark' }));
        } else if (this.data.mode === 'learned') {
            const r = await store.listLearnedWords();
            list = r.data || [];
            if (this.data.singleWord) {
                list = list.filter((w) => w.word === this.data.singleWord);
            }
        } else if (this.data.mode === 'plan') {
            list = await this.buildPlanList();
        } else if (this.data.mode === 'planPool') {
            // 总计划池：仅学总计划里的单词，按每日配额
            const [planRes, marksRes, settingsRes] = await Promise.all([
                store.listPlanWordInfos(),
                store.listAllMarks(),
                store.getPlanSettings(),
            ]);
            const st = settingsRes.data || {};
            const dailyNew = st.daily_new != null ? st.daily_new : 20;
            const dailyReview = st.daily_review != null ? st.daily_review : 50;
            const nowTs = Date.now();
            const markMap = {};
            (marksRes.data || []).forEach((m) => { markMap[m.word] = m; });
            const fresh = [];
            const due = [];
            (planRes.data || []).forEach((w) => {
                const m = markMap[w.word];
                const markDue = m && m.next_review_at && new Date(m.next_review_at).getTime() <= nowTs;
                const wordDue = w.wordNext && new Date(w.wordNext).getTime() <= nowTs;
                const studied = !!m || (w.wordProgress > 0);
                const item = {
                    word: w.word,
                    phonetic: w.phonetic,
                    meaning: w.meaning,
                    id: w.wordId || undefined,
                    progress: w.wordProgress || 0,
                    review_count: 0,
                    source: w.wordId ? 'word' : 'mark',
                };
                if (markDue || wordDue) {
                    due.push(item);
                } else if (!studied) {
                    fresh.push(item);
                }
            });
            list = due.slice(0, dailyReview).concat(fresh.slice(0, dailyNew));
        } else if (this.data.wordbookId) {
            const r = await store.listWords(this.data.wordbookId);
            list = (r.data || []).map((w) => ({ ...w, source: 'word' }));
        }
        if (this.data.authState !== 'signed-in') {
            return;
        }
        this.setData({
            loading: false,
            wordList: list,
            total: list.length,
            currentIndex: 0,
            current: list.length > 0 ? list[0] : null,
            flipped: false,
            done: false,
            learnedCount: 0,
        });
    },

    // 按背词计划取今日学习集：复习上限 dailyReview + 新词上限 dailyNew
    async buildPlanList() {
        const settingsRes = await store.getPlanSettings();
        const s = settingsRes.data || {};
        const dailyNew = s.daily_new != null ? s.daily_new : 20;
        const dailyReview = s.daily_review != null ? s.daily_review : 50;
        const now = Date.now();

        // 单词本维度：只取该单词本里的「到期」和「新词」，并按计划配额截断
        if (this.data.wordbookId) {
            const r = await store.listWords(this.data.wordbookId);
            const all = (r.data || []).map((w) => ({ ...w, source: 'word' }));
            const due = all.filter((w) => w.next_review_at && new Date(w.next_review_at).getTime() <= now);
            const fresh = all.filter((w) => !w.next_review_at);
            const reviewSet = due.slice(0, dailyReview);
            const seen = {};
            reviewSet.forEach((w) => { seen[w.word] = true; });
            const newSet = fresh.filter((w) => !seen[w.word]).slice(0, dailyNew);
            return reviewSet.concat(newSet);
        }

        // 全局维度：单词本到期 + 词库到期标记 + 新词
        const [dueWords, newWords, marks] = await Promise.all([
            store.listDueWords(),
            store.listNewWords(),
            store.listMarksWithWords(),
        ]);
        const dueMarks = (marks.data || []).filter((m) => m.status === 'learning'
            && m.next_review_at && new Date(m.next_review_at).getTime() <= now);
        const seen = {};
        const reviews = [];
        (dueWords.data || []).forEach((w) => {
            if (w.word && !seen[w.word]) {
                seen[w.word] = true;
                reviews.push({ ...w, source: 'word' });
            }
        });
        dueMarks.forEach((m) => {
            if (m.word && !seen[m.word]) {
                seen[m.word] = true;
                reviews.push({ ...m, source: 'mark' });
            }
        });
        const reviewSet = reviews.slice(0, dailyReview);
        const newSet = [];
        (newWords.data || []).forEach((w) => {
            if (newSet.length >= dailyNew) {
                return;
            }
            if (w.word && !seen[w.word]) {
                seen[w.word] = true;
                newSet.push({ ...w, source: 'word' });
            }
        });
        return reviewSet.concat(newSet);
    },

    flipCard() {
        this.setData({ flipped: !this.data.flipped });
    },

    playAudio() {
        const word = this.data.current && this.data.current.word;
        if (!word) {
            return;
        }
        if (this.audioCtx) {
            this.audioCtx.destroy();
            this.audioCtx = null;
        }
        const audio = wx.createInnerAudioContext();
        this.audioCtx = audio;
        audio.src = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=2';
        audio.onError(() => {
            wx.showToast({ title: '发音加载失败', icon: 'none' });
        });
        audio.play();
    },

    async mark(event) {
        const known = event.currentTarget.dataset.known === '1';
        const cur = this.data.current;
        if (!cur) {
            return;
        }
        const source = cur.source || (this.data.mode === 'library' ? 'mark' : 'word');
        if (source === 'mark') {
            // 云端词库/标记：记录跨子词库标记
            store.upsertWordMark(cur.word, known);
        } else {
            const newProgress = known ? Math.min((cur.progress || 0) + 1, store.MAX_PROGRESS) : 0;
            const reviewCount = (cur.review_count || 0) + 1;
            // 后台同步记忆进度，不阻塞翻卡
            store.updateWord(cur.id, {
                progress: newProgress,
                review_count: reviewCount,
                next_review_at: store.nextReviewAt(newProgress),
            });
            // 记录复习日志（用于动态调整计划）
            store.addReviewLog(cur.id, known);
        }

        const nextIndex = this.data.currentIndex + 1;
        const learnedCount = this.data.learnedCount + 1;
        if (nextIndex >= this.data.wordList.length) {
            this.setData({ done: true, learnedCount, flipped: false, current: null });
        } else {
            this.setData({
                currentIndex: nextIndex,
                current: this.data.wordList[nextIndex],
                flipped: false,
                learnedCount,
            });
        }
    },

    goBack() {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/words/words' }) });
    },
});
