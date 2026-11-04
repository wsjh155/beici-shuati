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
        orderMode: 'random',
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
        const settingsRes = await store.getPlanSettings();
        const st = settingsRes.data || {};
        const orderMode = st.word_order === 'order' ? 'order' : 'random';
        const dailyNew = st.daily_new != null ? st.daily_new : 20;
        const dailyReview = st.daily_review != null ? st.daily_review : 50;
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
            list = await this.buildPlanList(dailyNew, dailyReview);
        } else if (this.data.mode === 'planPool') {
            // 总计划池：仅学总计划里的单词，按每日配额
            const [planRes, marksRes] = await Promise.all([
                store.listPlanWordInfos(),
                store.listAllMarks(),
            ]);
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
        // 正序基准（接口返回顺序），乱序只在展示时打乱
        this.baseList = list;
        this.consumedItems = [];
        const ordered = store.applyOrder(list, orderMode);
        this.setData({
            loading: false,
            orderMode,
            wordList: ordered,
            total: ordered.length,
            currentIndex: 0,
            current: ordered.length > 0 ? ordered[0] : null,
            flipped: false,
            done: false,
            learnedCount: 0,
        });
    },

    // 单词唯一键（用于切换顺序时判断哪些已学）
    wordKey(item) {
        if (!item) {
            return '';
        }
        return (item.id || '') + '|' + (item.word || '');
    },

    // 学习页顶部「乱序 / 正序」切换：保留已学，只重排剩余卡片
    toggleOrder() {
        const next = this.data.orderMode === 'random' ? 'order' : 'random';
        const base = this.baseList || this.data.wordList || [];
        const consumed = this.consumedItems || [];
        const consumedKeys = consumed.map((x) => this.wordKey(x));
        const rest = base.filter((x) => consumedKeys.indexOf(this.wordKey(x)) < 0);
        const ordered = store.applyOrder(rest, next);
        const list = consumed.concat(ordered);
        const idx = consumed.length;
        this.setData({
            orderMode: next,
            wordList: list,
            total: list.length,
            currentIndex: idx,
            current: list[idx] || null,
            flipped: false,
        });
        store.saveOrderMode('word', next);
        wx.showToast({ title: next === 'random' ? '已切换为乱序' : '已切换为正序', icon: 'none' });
    },

    // 按背词计划取今日学习集：复习上限 dailyReview + 新词上限 dailyNew
    async buildPlanList(presetNew, presetReview) {
        let dailyNew = presetNew;
        let dailyReview = presetReview;
        if (dailyNew == null || dailyReview == null) {
            const settingsRes = await store.getPlanSettings();
            const s = settingsRes.data || {};
            dailyNew = s.daily_new != null ? s.daily_new : 20;
            dailyReview = s.daily_review != null ? s.daily_review : 50;
        }
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
        if (!this.consumedItems) {
            this.consumedItems = [];
        }
        this.consumedItems.push(cur);
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
