const { ensureSession, requireLogin } = require('../../utils/auth');
const store = require('../../utils/store');

// 订阅中心：官方预设题库 / 官方词库 / 用户共享库，订阅都在这里完成。
Page({
    data: {
        authState: 'checking',
        loading: false,
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
        wx.navigateTo({ url: '/pages/upload/upload' });
    },

    goManage() {
        wx.navigateTo({ url: '/pages/preset-bank/preset-bank' });
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
