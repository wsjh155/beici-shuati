const { ensureSession, requireLogin } = require('../../utils/auth');
const store = require('../../utils/store');
const config = require('../../utils/config');

const REPORT_REASONS = ['违法违规或敏感信息', '色情低俗', '广告导流或诈骗', '内容错误 / 侵权', '其他问题'];
const REPORT_CODES = ['illegal', 'porn', 'ads', 'copyright', 'other'];

// 订阅中心：官方预设题库 / 官方词库 / 共享库，订阅都在这里完成。
Page({
    data: {
        authState: 'checking',
        loading: false,
        ugcEnabled: config.ENABLE_UGC,
        tab: 'question',
        presetBanks: [],
        wordLibs: [],
        sharedLibs: [],
        myUid: '',
        subscribingId: '',
    },

    onShow() {
        this.restore();
    },

    async restore() {
        // 游客也能浏览官方预设与共享库，登录只在订阅等写操作时按需引导
        const session = await ensureSession(this);
        const user = (session && session.user) || {};
        this.setData({ myUid: user.id || user.uid || user.sub || '' });
        this.load();
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    async load() {
        this.setData({ loading: true });
        const [presetRes, seriesRes, libsRes, booksRes, banksRes, sharedRes] = await Promise.all([
            store.listPresetQuestionBanks(),
            store.listWordSeries(),
            store.listWordLibraries(),
            store.listWordbooks(),
            store.listBanks(),
            store.listSharedLibraries(),
        ]);
        if (this.data.authState === 'checking') {
            return;
        }
        const seriesMap = {};
        (seriesRes.data || []).forEach((s) => { seriesMap[s.id] = s.name; });
        const myBooks = booksRes.data || [];
        const myBanks = banksRes.data || [];
        const subscribedLibIds = new Set(myBooks.map((b) => b.preset_library_id).filter((id) => id != null));
        const subscribedBankIds = new Set(myBanks.map((b) => b.preset_bank_id).filter((id) => id != null));
        const myNames = new Set(myBanks.concat(myBooks).map((b) => b.name));

        const presetBanks = (presetRes.data || []).map((b) => ({
            ...b,
            subscribed: subscribedBankIds.has(b.id) || myNames.has(b.name),
        }));
        const wordLibs = (libsRes.data || []).map((l) => ({
            ...l,
            displayName: (seriesMap[l.series_id] || '词库') + '·' + (l.kind === 'full' ? '完整词库' : '高频词库'),
            subscribed: subscribedLibIds.has(l.id),
        }));
        const sharedLibs = (sharedRes.data || []).map((s) => ({
            ...s,
            kindLabel: s.kind === 'word' ? '词库' : '题库',
            unit: s.kind === 'word' ? '词' : '题',
            subscribed: myNames.has(s.name),
            isMine: !!this.data.myUid && s.owner_id === this.data.myUid,
        }));
        this.setData({ loading: false, presetBanks, wordLibs, sharedLibs });
    },

    onTabTap(e) {
        this.setData({ tab: e.currentTarget.dataset.tab });
    },

    goUpload() {
        if (!config.ENABLE_UGC) {
            return;
        }
        wx.navigateTo({ url: '/pages/upload/upload' });
    },

    goManage() {
        wx.navigateTo({ url: '/pages/preset-bank/preset-bank' });
    },

    // 举报无需登录，游客也能提交；数据库收到举报后自动累计并在多次举报时下架
    onReport(e) {
        const id = e.currentTarget.dataset.id;
        wx.showActionSheet({
            itemList: REPORT_REASONS,
            success: async (res) => {
                const idx = res.tapIndex;
                const r = await store.reportSharedLibrary(id, REPORT_CODES[idx] || 'other', REPORT_REASONS[idx] || '');
                if (r.error) {
                    wx.showToast({ title: '提交失败，请稍后重试', icon: 'none' });
                    return;
                }
                wx.showToast({ title: '举报已提交，感谢反馈', icon: 'none' });
                this.load();
            },
            fail: () => {},
        });
    },

    async subscribe(kind, id) {
        if (!requireLogin(this)) {
            return;
        }
        const key = kind + ':' + id;
        this.setData({ subscribingId: key });
        let r;
        if (kind === 'preset') {
            r = await store.subscribePresetQuestionBank(id);
        } else if (kind === 'word') {
            r = await store.subscribeWordLibrary(id);
        } else {
            r = await store.subscribeSharedLibrary(id);
        }
        this.setData({ subscribingId: '' });
        if (r.error) {
            wx.showToast({ title: r.error.message || '订阅失败', icon: 'none' });
            return;
        }
        wx.showToast({
            title: r.data && r.data.already ? '已经订阅过啦' : ('已订阅 ' + ((r.data && r.data.count) || 0) + ' 条'),
            icon: 'success',
        });
        this.load();
    },

    onSubscribePreset(e) {
        this.subscribe('preset', e.currentTarget.dataset.id);
    },
    onSubscribeWord(e) {
        this.subscribe('word', e.currentTarget.dataset.id);
    },
    onSubscribeShared(e) {
        this.subscribe('shared', e.currentTarget.dataset.id);
    },

    onDeleteShared(e) {
        const id = e.currentTarget.dataset.id;
        wx.showModal({
            title: '删除共享',
            content: '删除后其他人将无法再订阅这份题库/词库，确定吗？',
            success: async (res) => {
                if (!res.confirm) {
                    return;
                }
                const r = await store.deleteSharedLibrary(id);
                if (r.error) {
                    wx.showToast({ title: r.error.message || '删除失败', icon: 'none' });
                    return;
                }
                wx.showToast({ title: '已删除', icon: 'success' });
                this.load();
            },
        });
    },
});
