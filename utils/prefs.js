// 本地偏好设置（按设备保存）
// 词库顺序：每个词库可单独设置「乱序 / 顺序」，未设置时跟随全局背词计划
const LIB_ORDER_KEY = 'lib_order_map';

function getLibraryOrderMap() {
    try {
        const v = wx.getStorageSync(LIB_ORDER_KEY);
        return v && typeof v === 'object' ? v : {};
    } catch (e) {
        return {};
    }
}

// 返回 'random' 乱序 | 'order' 顺序
function getLibraryOrder(libraryId, fallback) {
    const map = getLibraryOrderMap();
    const v = map[String(libraryId)];
    if (v === 'order' || v === 'random') {
        return v;
    }
    return fallback === 'order' ? 'order' : 'random';
}

function setLibraryOrder(libraryId, mode) {
    const map = getLibraryOrderMap();
    map[String(libraryId)] = mode === 'order' ? 'order' : 'random';
    try {
        wx.setStorageSync(LIB_ORDER_KEY, map);
    } catch (e) {
        // 忽略本地存储失败
    }
}

module.exports = {
    getLibraryOrder,
    setLibraryOrder,
};
