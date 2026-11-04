// 云服务客户端唯一初始化点。
// 所有页面与数据访问层都从这里取同一个 cloud 实例，不要另建客户端或手写 wx.request。
const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics');

// publicConfig 来自云服务激活结果，可随前端代码一起发布。
const publicConfig = {
    endpoint: 'https://mp-api.app.workbuddy.host',
    publishableKey: 'wbpk_tN8KEPz20o1A9Z210VeQSI_Vi73Yyx224IJAnIUHnMrZSEZgGaBu2cp',
    workBuddyOAuthClientId: 'cb_jq6QyEPkOkJXPcpz0JxS_wbapp_tN8KEPz20o1A9Z210VeQSI',
};

const cloud = createMiniProgramWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    publishableKey: publicConfig.publishableKey,
    workBuddyOAuthClientId: publicConfig.workBuddyOAuthClientId,
    wx: createDiagnosticWx(wx),
});

module.exports = { cloud, publicConfig };
