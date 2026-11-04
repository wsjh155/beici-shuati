const { ensureSession } = require('../../utils/auth');
const store = require('../../utils/store');
const prefs = require('../../utils/prefs');

Page({
    data: {
        authState: 'checking',
        loading: false,
        series: [],
        subscribingId: 0,
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
        const [seriesResult, libsResult, booksResult, settingsResult] = await Promise.all([
            store.listWordSeries(),
            store.listWordLibraries(),
            store.listWordbooks(),
            store.getPlanSettings(),
        ]);
        if (this.data.authState !== 'signed-in') {
            return;
        }
        const globalOrder = settingsResult.data && settingsResult.data.word_order === 'order' ? 'order' : 'random';
        const subscribedLibIds = new Set(
            (booksResult.data || [])
                .map((b) => b.preset_library_id)
                .filter((id) => id != null)
        );
        const series = (seriesResult.data || []).map((s) => ({
            ...s,
            libraries: (libsResult.data || [])
                .filter((l) => l.series_id === s.id)
                .map((l) => ({
                    ...l,
                    subscribed: subscribedLibIds.has(l.id),
                    order: prefs.getLibraryOrder(l.id, globalOrder),
                })),
        }));
        this.setData({ loading: false, series, globalOrder });
    },

    // 单个词库切换「乱序 / 顺序」（保存在本机，下次进来沿用）
    toggleLibOrder(e) {
        const id = e.currentTarget.dataset.id;
        const si = e.currentTarget.dataset.si;
        const li = e.currentTarget.dataset.li;
        const series = this.data.series.slice();
        const lib = series[si] && series[si].libraries[li];
        if (!lib) {
            return;
        }
        const next = lib.order === 'order' ? 'random' : 'order';
        prefs.setLibraryOrder(id, next);
        const libs = series[si].libraries.slice();
        libs[li] = { ...lib, order: next };
        series[si] = { ...series[si], libraries: libs };
        this.setData({ series });
        wx.showToast({ title: next === 'random' ? '已设为乱序' : '已设为顺序', icon: 'none' });
    },

    goStudy(e) {
        const id = e.currentTarget.dataset.id;
        const order = e.currentTarget.dataset.order || 'random';
        wx.navigateTo({ url: '/pages/study/study?mode=library&libraryId=' + id + '&order=' + order });
    },

    onSubscribe(e) {
        const id = e.currentTarget.dataset.id;
        this.setData({ subscribingId: id });
        wx.showModal({
            title: '订阅词库',
            content: '订阅后会把该词库的单词复制到你的单词本，可随时学习。确定订阅吗？',
            success: async (res) => {
                if (!res.confirm) {
                    this.setData({ subscribingId: 0 });
                    return;
                }
                const r = await store.subscribeWordLibrary(id);
                this.setData({ subscribingId: 0 });
                if (r.error) {
                    wx.showToast({ title: r.error.message || '订阅失败', icon: 'none' });
                    return;
                }
                wx.showToast({ title: r.data.already ? '已订阅过' : ('已订阅 ' + r.data.count + ' 词'), icon: 'success' });
                this.load();
            },
        });
    },
});
