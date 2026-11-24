const share = require('../../utils/share');

Page({
    onShareAppMessage() {
        return share.toFriend();
    },
});
