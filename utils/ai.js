// AI 能力封装：拍照识别题目（多模态 OCR）+ 自动生成答案。
// 全部走云服务免密钥大模型，用户无需自己的 API key。
const { cloud } = require('./cloud');

// 选一个可用模型；needVision 时优先选支持图片的模型
async function pickModel(needVision) {
    let models;
    try {
        models = await cloud.llm.models.list();
    } catch (e) {
        return null;
    }
    if (!models || models.length === 0) {
        return null;
    }
    if (needVision) {
        const vision = models.find((m) => m.supportsImages === true && m.disabled !== true);
        if (vision) {
            return vision;
        }
    }
    return models.find((m) => m.disabled !== true) || null;
}

// 流式调用并收集完整文本
async function streamChat(model, messages) {
    let content = '';
    for await (const chunk of cloud.llm.chat.completions.create({
        model: model.id,
        messages,
        stream: true,
    })) {
        const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
        if (delta && delta.content) {
            content += delta.content;
        }
    }
    return content;
}

// 从模型输出中稳健地提取 JSON 对象
function parseJson(text) {
    let t = (text || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
        t = fence[1].trim();
    }
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
        t = t.slice(start, end + 1);
    }
    try {
        return JSON.parse(t);
    } catch (e) {
        return null;
    }
}

// 识别题目图片，返回结构化题目
async function recognizeQuestion(imageDataUrl) {
    const model = await pickModel(true);
    if (!model) {
        return { data: null, error: { message: '暂无可用的识别模型' } };
    }
    const system = '你是题目识别助手，负责从图片中准确识别题目并结构化输出，不编造图片中没有的内容。';
    const instruction = [
        '识别图片中的题目，严格按以下 JSON 格式输出（不要输出 JSON 以外的内容）：',
        '{"type":"single|multiple|judge|subjective","stem":"题干","options":["选项1","选项2",...],"answer":"答案","analysis":"解析"}',
        '规则：选择题 type 为 single 或 multiple，answer 用选项字母（单选如 A，多选如 ABD）；',
        '判断题 type 为 judge，options 固定为 ["正确","错误"]，answer 用 A 表示正确、B 表示错误；',
        '简答题 type 为 subjective，options 为空数组，answer 为参考答案；',
        '若图片中没有题目，输出 {"error":"no_question"}。',
    ].join('\n');
    const user = {
        role: 'user',
        content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
    };
    try {
        const raw = await streamChat(model, [{ role: 'system', content: system }, user]);
        const parsed = parseJson(raw);
        if (!parsed) {
            return { data: null, error: { message: '识别结果解析失败，请重试' } };
        }
        return { data: parsed, error: null };
    } catch (e) {
        return { data: null, error: { message: '识别失败，请重试' } };
    }
}

// 为题目自动生成答案与解析（结果需标注 AI 生成）
async function generateAnswer(stem, options, type) {
    const model = await pickModel(false);
    if (!model) {
        return { data: null, error: { message: '暂无可用的生成模型' } };
    }
    const system = '你是学习辅导助手，为题目生成准确答案和解析。';
    let prompt;
    if (type === 'judge') {
        prompt = '判断以下说法的对错。输出 JSON：{"answer":"A","analysis":"解析"}，A 表示正确，B 表示错误。题目：' + stem;
    } else if (type === 'subjective') {
        prompt = '为以下题目生成参考答案和解析。输出 JSON：{"answer":"参考答案","analysis":"解析"}。题目：' + stem;
    } else {
        const optText = (options || []).map((o, i) => String.fromCharCode(65 + i) + '. ' + o).join('\n');
        prompt = '为以下选择题选择正确答案。输出 JSON：{"answer":"A","analysis":"解析"}，answer 用字母，多选题用多个字母（如 ABD）。\n题目：' + stem + '\n选项：\n' + optText;
    }
    try {
        const raw = await streamChat(model, [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
        ]);
        const parsed = parseJson(raw);
        if (!parsed) {
            return { data: null, error: { message: '生成结果解析失败，请重试' } };
        }
        return { data: parsed, error: null };
    } catch (e) {
        return { data: null, error: { message: '生成失败，请重试' } };
    }
}

module.exports = { recognizeQuestion, generateAnswer };
