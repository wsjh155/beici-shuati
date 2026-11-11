const config = require('../../utils/config');

Page({
    data: {
        tab: 'user',
        version: config.VERSION,
        updatedAt: '2026-11-11',
    },

    onTabTap(e) {
        this.setData({ tab: e.currentTarget.dataset.tab });
    },

    goBack() {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/profile/profile' }) });
    },
});
