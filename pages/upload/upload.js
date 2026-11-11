const { ensureSession, requireLogin } = require('../../utils/auth');
const store = require('../../utils/store');
const { parseWordLines, parseQuestionLines } = require('../../utils/parser');
const { checkLibrary } = require('../../utils/content-security');

const MAX_ITEMS = 2000;

Page({
    data: {
        authState: 'checking',
        kind: 'question',
        qType: 'choice',
        name: '',
        category: '',
        description: '',
        authorName: '',
        text: '',
        parsedCount: 0,
        submitting: false,
        tip: '选择题：题干 | A | B | C | D | 答案 | 解析（可空）',
    },

    onLoad() {
        this.restore();
    },

    async restore() {
        const session = await ensureSession(this);
        if (!session) {
            return;
        }
        const user = session.user || {};
        this.setData({ authorName: user.name || user.nickName || '' });
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    onKindTap(e) {
        this.setData({ kind: e.currentTarget.dataset.kind, parsedCount: 0 });
        this.refreshTip();
    },

    onQTypeTap(e) {
        this.setData({ qType: e.currentTarget.dataset.type });
        this.refreshTip();
        this.setData({ parsedCount: parseQuestionLines(this.data.text, this.data.qType).length });
    },

    refreshTip() {
        const tips = {
            choice: '选择题：题干 | A | B | C | D | 答案 | 解析（可空）',
            judge: '判断题：题干 | 对 或 错 | 解析（可空）',
            subjective: '简答题：题干 | 参考答案 | 解析（可空）',
        };
        this.setData({ tip: this.data.kind === 'word'
            ? '每行一个词：word | 音标(可选) | 释义 | 例句(可选)'
            : tips[this.data.qType] });
    },

    onNameInput(e) { this.setData({ name: e.detail.value }); },
    onCategoryInput(e) { this.setData({ category: e.detail.value }); },
    onDescInput(e) { this.setData({ description: e.detail.value }); },
    onAuthorInput(e) { this.setData({ authorName: e.detail.value }); },

    onTextInput(e) {
        const text = e.detail.value;
        const count = this.data.kind === 'word'
            ? parseWordLines(text).length
            : parseQuestionLines(text, this.data.qType).length;
        this.setData({ text, parsedCount: count });
    },

    async submit() {
        if (!requireLogin(this)) {
            return;
        }
        const name = this.data.name.trim();
        const text = this.data.text.trim();
        if (!name) {
            wx.showToast({ title: '请填写名称', icon: 'none' });
            return;
        }
        if (!text) {
            wx.showToast({ title: '请粘贴内容', icon: 'none' });
            return;
        }
        const items = this.data.kind === 'word'
            ? parseWordLines(text)
            : parseQuestionLines(text, this.data.qType);
        if (items.length === 0) {
            wx.showToast({ title: '没有解析到有效内容，请检查格式', icon: 'none' });
            return;
        }
        if (items.length > MAX_ITEMS) {
            wx.showToast({ title: '单次最多 ' + MAX_ITEMS + ' 条，请分批上传', icon: 'none' });
            return;
        }
        // 公开发布前先做本地内容初筛；正式开放上传还须接入微信官方内容安全接口
        const check = checkLibrary({
            name,
            category: this.data.category.trim(),
            description: this.data.description.trim(),
            authorName: this.data.authorName.trim(),
        }, items);
        if (!check.ok) {
            wx.showModal({
                title: '内容需要修改',
                content: check.reason + '。为遵守内容规范，请修改后再发布。',
                showCancel: false,
                confirmText: '我知道了',
            });
            return;
        }
        this.setData({ submitting: true });
        const r = await store.createSharedLibrary({
            kind: this.data.kind,
            name,
            category: this.data.category.trim() || '用户共享',
            description: this.data.description.trim(),
            authorName: this.data.authorName.trim(),
        }, items);
        this.setData({ submitting: false });
        if (r.error) {
            wx.showToast({ title: r.error.message || '上传失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: '已发布 ' + items.length + ' 条', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
    },
});
