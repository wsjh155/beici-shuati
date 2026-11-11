// 内容安全前置过滤。
// 说明：本模块用于用户自行录入/发布的文本在提交前的本地初筛，
// 覆盖违法违规、色情低俗、赌博诈骗、考试作弊、广告导流等类别。
// 公开 UGC 发布功能（pages/upload）默认关闭；如需开启，还必须在服务端
// 接入微信官方内容安全接口 msgSecCheck / imgSecCheck，并完成相应类目报备。

const MAX_TEXT_LENGTH = 500;
// 题目解析可能较长，逐条录入内容放宽长度限制，只做违规词初筛
const ITEM_MAX_LENGTH = 5000;

// 每条规则的命中原因会直接展示给用户，便于其自行修改内容
const RULES = [
    { re: /赌博|博彩|赌场|下注|私彩|开户送彩金|六合彩/, reason: '赌博相关' },
    { re: /色情|淫秽|裸聊|成人影片|招嫖|嫖娼|一夜情/, reason: '色情低俗' },
    { re: /代考|替考|枪手|包过|考试答案|出售答案|泄题|作弊器材/, reason: '考试舞弊' },
    { re: /毒品|冰毒|海洛因|大麻|摇头丸|制毒/, reason: '违禁品' },
    { re: /恐怖袭击|自制炸弹|自制枪支|杀人方法|爆炸物配方/, reason: '暴力恐怖' },
    { re: /刷单|返利|兼职日结|贷款秒下|套现|中奖通知|冒充客服/, reason: '欺诈或非法营销' },
    { re: /办证|刻章|代开发票|迷药|迷幻药/, reason: '违法服务' },
    { re: /加微信|加我微信|加群|进群|扫码加|私聊|QQ群|公众号|微商|代购|联系客服/, reason: '站外导流' },
];

// 名称、简介、署名等短文本额外禁止站外链接与联系方式
const META_EXTRA = [
    { re: /https?:\/\/|www\./i, reason: '站外链接' },
    { re: /\d{7,}/, reason: '联系方式/号码' },
];

function normalize(text) {
    return String(text == null ? '' : text)
        .toLowerCase()
        .replace(/[\s\u3000·・.,，。;；:：!！?？、|｜\/\\\-_*#@~"'“”‘’()（）\[\]【】]/g, '');
}

function checkText(value, label, maxLength) {
    const raw = String(value == null ? '' : value);
    const limit = maxLength == null ? MAX_TEXT_LENGTH : maxLength;
    if (raw.length > limit) {
        return { ok: false, reason: (label || '内容') + '超过 ' + limit + ' 字，请精简后再提交' };
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw)) {
        return { ok: false, reason: (label || '内容') + '包含不可见控制字符' };
    }
    const flat = normalize(raw);
    for (const rule of RULES) {
        if (rule.re.test(flat) || rule.re.test(raw.toLowerCase())) {
            return { ok: false, reason: (label || '内容') + '含「' + rule.reason + '」内容，请修改后再提交' };
        }
    }
    return { ok: true, reason: '' };
}

function checkMeta(value, label) {
    const base = checkText(value, label);
    if (!base.ok) {
        return base;
    }
    const raw = String(value == null ? '' : value);
    for (const rule of META_EXTRA) {
        if (rule.re.test(raw)) {
            return { ok: false, reason: (label || '内容') + '不允许包含「' + rule.reason + '」' };
        }
    }
    return { ok: true, reason: '' };
}

function itemToText(item) {
    if (!item || typeof item !== 'object') {
        return String(item == null ? '' : item);
    }
    const parts = [
        item.stem, item.word, item.meaning, item.phonetic, item.example,
        item.analysis, item.answer,
    ];
    let options = item.options || [];
    if (typeof options === 'string') {
        try {
            options = JSON.parse(options);
        } catch (e) {
            options = [options];
        }
    }
    if (Array.isArray(options)) {
        parts.push(options.join(' '));
    }
    return parts.filter((x) => x != null && x !== '').join(' ');
}

// 校验一组录入内容（题目或单词），返回第一条不合规内容及其行号
function checkItems(items) {
    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i++) {
        const r = checkText(itemToText(list[i]), '第 ' + (i + 1) + ' 条', ITEM_MAX_LENGTH);
        if (!r.ok) {
            return r;
        }
    }
    return { ok: true, reason: '' };
}

// 校验一份词库/题库的元信息 + 全部条目
function checkLibrary(meta, items) {
    const fields = [
        [meta && meta.name, '名称'],
        [meta && meta.category, '分类'],
        [meta && meta.description, '简介'],
        [meta && meta.authorName, '署名'],
    ];
    for (const [value, label] of fields) {
        const r = checkMeta(value, label);
        if (!r.ok) {
            return r;
        }
    }
    return checkItems(items);
}

module.exports = { checkText, checkMeta, checkItems, checkLibrary, MAX_TEXT_LENGTH };
