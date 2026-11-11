const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');
const config = require('../../utils/config');

function mimeFromPath(path) {
    if (/\.png$/i.test(path)) {
        return 'image/png';
    }
    if (/\.webp$/i.test(path)) {
        return 'image/webp';
    }
    return 'image/jpeg';
}

Page({
    data: {
        authState: 'checking',
        // 题库
        banks: [],
        bankNames: ['新建题库'],
        bankIndex: 0,
        newBankName: '',
        // 图片
        imagePath: '',
        imageDataUrl: '',
        recognizing: false,
        // 表单
        qType: 'single',
        stem: '',
        options: ['', '', '', ''],
        optionLabels: ['A', 'B', 'C', 'D'],
        answer: '',
        judgeAnswer: 'A',
        analysis: '',
        aiGenerated: false,
        generating: false,
        saving: false,
        aiEnabled: config.ENABLE_AI,
        // 关闭 AI 时不需要「识别」这一步，直接展示手动录入表单
        hasResult: !config.ENABLE_AI,
    },

    onShow() {
        this.restore();
    },

    async restore() {
        const session = await ensureSession(this);
        if (!session) {
            return;
        }
        this.loadBanks();
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    async loadBanks() {
        const result = await store.listBanks();
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const banks = result.data || [];
        this.setData({ banks, bankNames: ['新建题库'].concat(banks.map((b) => b.name)) });
    },

    onBankChange(e) {
        this.setData({ bankIndex: Number(e.detail.value) });
    },
    onNewBankInput(e) {
        this.setData({ newBankName: e.detail.value });
    },
    noop() {},

    chooseImage() {
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['camera', 'album'],
            sizeType: ['compressed'],
            success: (res) => {
                const path = res.tempFiles[0].tempFilePath;
                const mime = mimeFromPath(path);
                wx.getFileSystemManager().readFile({
                    filePath: path,
                    encoding: 'base64',
                    success: (r) => {
                        this.setData({
                            imagePath: path,
                            imageDataUrl: 'data:' + mime + ';base64,' + r.data,
                            hasResult: false,
                        });
                    },
                    fail: () => wx.showToast({ title: '读取图片失败', icon: 'none' }),
                });
            },
        });
    },

    // 提审版不提供任何大模型识别/生成能力，拍照页仅作手动录入使用。
    // 保留方法作为兜底，避免误触时报错。
    doRecognize() {
        wx.showToast({ title: '当前版本请手动录入题目', icon: 'none' });
    },

    onTypeTap(e) {
        this.setData({ qType: e.currentTarget.dataset.type, aiGenerated: false });
    },
    onStemInput(e) {
        this.setData({ stem: e.detail.value });
    },
    onOptionInput(e) {
        const idx = e.currentTarget.dataset.idx;
        const options = this.data.options.slice();
        options[idx] = e.detail.value;
        this.setData({ options });
    },
    onAnswerInput(e) {
        this.setData({ answer: e.detail.value });
    },
    onAnalysisInput(e) {
        this.setData({ analysis: e.detail.value });
    },
    onJudgeTap(e) {
        this.setData({ judgeAnswer: e.currentTarget.dataset.v });
    },

    doGenerate() {
        wx.showToast({ title: '当前版本请自行填写答案与解析', icon: 'none' });
    },

    async doSave() {
        const stem = this.data.stem.trim();
        if (!stem) {
            wx.showToast({ title: '题干不能为空', icon: 'none' });
            return;
        }
        const type = this.data.qType;
        const question = { type, stem, analysis: this.data.analysis.trim(), ai_generated: this.data.aiGenerated };
        if (type === 'judge') {
            question.options = JSON.stringify(['正确', '错误']);
            question.answer = this.data.judgeAnswer;
        } else if (type === 'subjective') {
            question.options = JSON.stringify([]);
            question.answer = this.data.answer.trim();
            if (!question.answer) {
                wx.showToast({ title: '请填写参考答案', icon: 'none' });
                return;
            }
        } else {
            const options = this.data.options.map((o) => o.trim()).filter((o) => o !== '');
            if (options.length < 2) {
                wx.showToast({ title: '请至少填写两个选项', icon: 'none' });
                return;
            }
            const answer = this.data.answer.trim().toUpperCase().replace(/\s+/g, '');
            if (!answer) {
                wx.showToast({ title: '请填写答案字母', icon: 'none' });
                return;
            }
            question.type = answer.length > 1 ? 'multiple' : 'single';
            question.options = JSON.stringify(options);
            question.answer = answer;
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
            this.setData({ bankNames: ['新建题库'].concat([name].concat(this.data.banks.map((b) => b.name))), banks: [{ id: bankId, name }].concat(this.data.banks), bankIndex: 1 });
        }
        if (!bankId) {
            wx.showToast({ title: '请选择题库', icon: 'none' });
            return;
        }
        this.setData({ saving: true });
        const r = await store.createQuestion({ ...question, bank_id: bankId });
        this.setData({ saving: false });
        if (r.error) {
            wx.showToast({ title: r.error.message || '保存失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: '已保存到题库', icon: 'success' });
        this.setData({
            stem: '', options: ['', '', '', ''], answer: '', judgeAnswer: 'A',
            analysis: '', aiGenerated: false, hasResult: !config.ENABLE_AI,
            imagePath: '', imageDataUrl: '',
        });
    },

    goBack() {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/quiz/quiz' }) });
    },
});
