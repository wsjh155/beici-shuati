// 全局展示配置：版本号、开源地址、合规开关
module.exports = {
    VERSION: '1.5.0',
    // 发布到 GitHub 后，把这里替换成你的仓库地址
    GITHUB_URL: 'https://github.com/wsjh155/beici-shuati',

    // 提审合规开关：微信代码审核要求「用户可公开发布内容」的小程序必须接入
    // 官方内容安全接口（msgSecCheck / imgSecCheck）并完成相应类目报备。
    // 未接入前关闭用户上传与共享发布入口，仅保留官方预设内容订阅；
    // 页面与数据层代码均保留，接入接口后把这里改为 true 即可恢复。
    ENABLE_UGC: false,

    // 生成式 AI 服务（拍照识别题目 / 自动作答）涉及算法备案、类目资质与
    // 生成内容标识，个人主体暂不具备，提审版彻底关闭：
    // 拍照页改为手动录入，utils/ai.js 不参与打包，代码中不含任何大模型调用。
    ENABLE_AI: false,

    // 发音依赖外部词典音频域名，需在小程序后台把它加入 downloadFile 合法域名，
    // 否则体验版/正式版会播放失败（审核常见「功能不可用」退回点）。
    // 未配置域名前关闭入口，配置完成后改为 true 即可恢复。
    ENABLE_PRONUNCIATION: false,
};
