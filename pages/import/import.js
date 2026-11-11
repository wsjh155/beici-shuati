const { ensureSession, requireLogin } = require('../../utils/auth');
const store = require('../../utils/store');
const { parseWordLines, parseQuestionLines } = require('../../utils/parser');
const { checkItems, checkMeta } = require('../../utils/content-security');

Page({
    data: {
        authState: 'checking',
        tab: 'words',
        importing: false,
        // 单词
        wordbooks: [],
        bookNames: ['新建单词本'],
        bookIndex: 0,
        newBookName: '',
        wordText: '',
        wordCount: 0,
        // 题目
        qType: 'choice',
        banks: [],
        bankNames: ['新建题库'],
        bankIndex: 0,
        newBankName: '',
        questionText: '',
        questionCount: 0,
    },

    onShow() {
        this.restore();
    },

    async restore() {
        const session = await ensureSession(this);
        if (!session) {
            return;
        }
        this.loadTargets();
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    async loadTargets() {
        const [books, banks] = await Promise.all([store.listWordbooks(), store.listBanks()]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const wb = books.data || [];
        const bk = banks.data || [];
        this.setData({
            wordbooks: wb,
            bookNames: ['新建单词本'].concat(wb.map((b) => b.name)),
            banks: bk,
            bankNames: ['新建题库'].concat(bk.map((b) => b.name)),
        });
    },

    switchTab(e) {
        this.setData({ tab: e.currentTarget.dataset.tab });
    },

    onBookChange(e) {
        this.setData({ bookIndex: Number(e.detail.value) });
    },
    onBankChange(e) {
        this.setData({ bankIndex: Number(e.detail.value) });
    },

    onNewBookInput(e) {
        this.setData({ newBookName: e.detail.value });
    },
    onNewBankInput(e) {
        this.setData({ newBankName: e.detail.value });
    },

    onQTypeTap(e) {
        this.setData({ qType: e.currentTarget.dataset.type });
    },

    goScan() {
        wx.navigateTo({ url: '/pages/scan/scan', fail: () => wx.showToast({ title: '打开失败，请重试', icon: 'none' }) });
    },

    showSecurityTip(reason) {
        wx.showModal({
            title: '内容需要修改',
            content: reason + '。为遵守内容规范，请修改后再导入。',
            showCancel: false,
            confirmText: '我知道了',
        });
    },

    onWordTextInput(e) {
        const text = e.detail.value;
        this.setData({ wordText: text, wordCount: parseWordLines(text).length });
    },
    onQuestionTextInput(e) {
        const text = e.detail.value;
        this.setData({ questionText: text, questionCount: parseQuestionLines(text, this.data.qType).length });
    },

    async doImportWords() {
        if (!requireLogin(this)) {
            return;
        }
        const text = this.data.wordText.trim();
        if (!text) {
            wx.showToast({ title: '请先粘贴单词内容', icon: 'none' });
            return;
        }
        const words = parseWordLines(text);
        if (words.length === 0) {
            wx.showToast({ title: '未解析到有效单词', icon: 'none' });
            return;
        }
        const nameCheck = this.data.bookIndex === 0
            ? checkMeta(this.data.newBookName.trim(), '名称')
            : { ok: true };
        const contentCheck = nameCheck.ok ? checkItems(words) : nameCheck;
        if (!contentCheck.ok) {
            this.showSecurityTip(contentCheck.reason);
            return;
        }
        let bookId = this.data.bookIndex === 0 ? null : (this.data.wordbooks[this.data.bookIndex - 1] || {}).id;
        if (this.data.bookIndex === 0) {
            const name = this.data.newBookName.trim();
            if (!name) {
                wx.showToast({ title: '请输入新单词本名称', icon: 'none' });
                return;
            }
            const r = await store.createWordbook({ name });
            if (r.error || !r.data) {
                wx.showToast({ title: r.error ? r.error.message : '创建失败', icon: 'none' });
                return;
            }
            bookId = r.data[0].id;
        }
        if (!bookId) {
            wx.showToast({ title: '请选择单词本', icon: 'none' });
            return;
        }
        this.setData({ importing: true });
        const r = await store.batchCreateWords(bookId, words);
        this.setData({ importing: false });
        if (r.error) {
            wx.showToast({ title: '导入失败：' + (r.error.message || ''), icon: 'none' });
            return;
        }
        wx.showToast({ title: '成功导入 ' + r.data + ' 个单词', icon: 'success' });
        this.setData({ wordText: '', wordCount: 0, newBookName: '', bookIndex: 0 });
    },

    async doImportQuestions() {
        if (!requireLogin(this)) {
            return;
        }
        const text = this.data.questionText.trim();
        if (!text) {
            wx.showToast({ title: '请先粘贴题目内容', icon: 'none' });
            return;
        }
        const questions = parseQuestionLines(text, this.data.qType);
        if (questions.length === 0) {
            wx.showToast({ title: '未解析到有效题目，请检查格式', icon: 'none' });
            return;
        }
        const nameCheck = this.data.bankIndex === 0
            ? checkMeta(this.data.newBankName.trim(), '名称')
            : { ok: true };
        const contentCheck = nameCheck.ok ? checkItems(questions) : nameCheck;
        if (!contentCheck.ok) {
            this.showSecurityTip(contentCheck.reason);
            return;
        }
        let bankId = this.data.bankIndex === 0 ? null : (this.data.banks[this.data.bankIndex - 1] || {}).id;
        if (this.data.bankIndex === 0) {
            const name = this.data.newBankName.trim();
            if (!name) {
                wx.showToast({ title: '请输入新题库名称', icon: 'none' });
                return;
            }
            const r = await store.createBank({ name });
            if (r.error || !r.data) {
                wx.showToast({ title: r.error ? r.error.message : '创建失败', icon: 'none' });
                return;
            }
            bankId = r.data[0].id;
        }
        if (!bankId) {
            wx.showToast({ title: '请选择题库', icon: 'none' });
            return;
        }
        this.setData({ importing: true });
        const r = await store.batchCreateQuestions(bankId, questions);
        this.setData({ importing: false });
        if (r.error) {
            wx.showToast({ title: '导入失败：' + (r.error.message || ''), icon: 'none' });
            return;
        }
        wx.showToast({ title: '成功导入 ' + r.data + ' 道题', icon: 'success' });
        this.setData({ questionText: '', questionCount: 0, newBankName: '', bankIndex: 0 });
    },
});
