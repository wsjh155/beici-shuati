const share = require('../../utils/share');

const config = require('../../utils/config');

Page({
    onShareAppMessage() {
        return share.toFriend();
    },
    data: {
        version: config.VERSION,
        githubUrl: config.GITHUB_URL,
    },

    copyLink() {
        wx.setClipboardData({
            data: this.data.githubUrl,
            success: () => wx.showToast({ title: '链接已复制', icon: 'none' }),
        });
    },

    goAgreement() {
        wx.navigateTo({ url: '/pages/agreement/agreement' });
    },
});
