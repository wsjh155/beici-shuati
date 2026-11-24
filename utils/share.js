// 全站基础分享配置。
// 微信规则：页面只有定义了 onShareAppMessage，右上角胶囊里的「转发给朋友」才可点击；
// 「分享到朋友圈」还需要在页面调用 wx.showShareMenu 显式开启 menus，且生效前提是同时有 onShareAppMessage。
// 这里只提供基础转发能力，不含任何奖励、解锁或诱导分享，符合审核规范。
const SHARE_TITLE = '背词刷题 · 背单词与刷题';
// 统一落到首页：首页游客可浏览，不会让未登录的好友点开后白屏
const SHARE_PATH = '/pages/index/index';

function toFriend() {
    return {
        title: SHARE_TITLE,
        path: SHARE_PATH,
        // 不传 imageUrl，使用微信默认的页面截图
    };
}

function toTimeline() {
    return { title: SHARE_TITLE };
}

// 仅首页调用：同时开启「转发给朋友」与「分享到朋友圈」两个菜单项。
// 其它页面不开放朋友圈，因为单页模式下无法登录、依赖个人数据的页面会白屏。
function enableTimelineMenu() {
    if (typeof wx.showShareMenu !== 'function') {
        return;
    }
    try {
        wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage', 'shareTimeline'],
        });
    } catch (e) {
        // 低版本基础库不认识 menus 参数时降级，好友转发仍可用
        wx.showShareMenu({ withShareTicket: true });
    }
}

module.exports = {
    SHARE_TITLE,
    SHARE_PATH,
    toFriend,
    toTimeline,
    enableTimelineMenu,
};
