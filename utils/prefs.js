// 本地偏好设置（按设备保存）
// 词库 / 题库顺序：每个词库、题库可单独设置「乱序 / 顺序」，未设置时跟随全局计划
const LIB_ORDER_KEY = 'lib_order_map';
const BANK_ORDER_KEY = 'bank_order_map';
const BANK_FILTER_KEY = 'bank_filter_ids';

function readMap(key) {
    try {
        const v = wx.getStorageSync(key);
        return v && typeof v === 'object' ? v : {};
    } catch (e) {
        return {};
    }
}

function writeMap(key, map) {
    try {
        wx.setStorageSync(key, map);
    } catch (e) {
        // 忽略本地存储失败
    }
}

function normalize(mode) {
    return mode === 'order' ? 'order' : 'random';
}

// 返回 'random' 乱序 | 'order' 顺序
function getLibraryOrder(libraryId, fallback) {
    const v = readMap(LIB_ORDER_KEY)[String(libraryId)];
    if (v === 'order' || v === 'random') {
        return v;
    }
    return normalize(fallback);
}

function setLibraryOrder(libraryId, mode) {
    const map = readMap(LIB_ORDER_KEY);
    map[String(libraryId)] = normalize(mode);
    writeMap(LIB_ORDER_KEY, map);
}

function getBankOrder(bankId, fallback) {
    const v = readMap(BANK_ORDER_KEY)[String(bankId)];
    if (v === 'order' || v === 'random') {
        return v;
    }
    return normalize(fallback);
}

function setBankOrder(bankId, mode) {
    const map = readMap(BANK_ORDER_KEY);
    map[String(bankId)] = normalize(mode);
    writeMap(BANK_ORDER_KEY, map);
}

module.exports = {
    getLibraryOrder,
    setLibraryOrder,
    getBankOrder,
    setBankOrder,
    getSelectedBanks,
    setSelectedBanks,
};

// 刷题科目筛选：返回选中的题库 id 数组；空数组表示不限（全部科目）
function getSelectedBanks() {
    try {
        const v = wx.getStorageSync(BANK_FILTER_KEY);
        if (!Array.isArray(v)) {
            return [];
        }
        return v.map((x) => Number(x)).filter((x) => x > 0);
    } catch (e) {
        return [];
    }
}

function setSelectedBanks(ids) {
    const list = (ids || []).map((x) => Number(x)).filter((x) => x > 0);
    writeMap(BANK_FILTER_KEY, list);
}
