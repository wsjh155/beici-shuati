// 解析用户粘贴的单词/题目文本。支持「|」和制表符（Tab）分隔，兼容从 Excel 复制粘贴。

function splitLine(line) {
    if (line.indexOf('\t') >= 0) {
        return line.split('\t').map((p) => p.trim());
    }
    return line.split('|').map((p) => p.trim());
}

// 单词格式（每行一个）：word | 音标(可选) | 释义 | 例句(可选)
function parseWordLines(text) {
    const lines = (text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
    const words = [];
    for (const line of lines) {
        const parts = splitLine(line);
        const word = parts[0];
        if (!word) {
            continue;
        }
        let phonetic = '';
        let meaning = '';
        let example = '';
        if (parts.length === 2) {
            meaning = parts[1];
        } else if (parts.length === 3) {
            phonetic = parts[1];
            meaning = parts[2];
        } else if (parts.length >= 4) {
            phonetic = parts[1];
            meaning = parts[2];
            example = parts.slice(3).join(' ');
        }
        words.push({ word, phonetic, meaning, example });
    }
    return words;
}

function normalizeJudge(raw) {
    const v = (raw || '').trim().toUpperCase();
    if (['对', '正确', '√', 'T', 'TRUE', 'A', '是'].indexOf(v) >= 0) {
        return 'A';
    }
    if (['错', '错误', '×', 'X', 'F', 'FALSE', 'B', '否'].indexOf(v) >= 0) {
        return 'B';
    }
    return null;
}

// 题目格式（每行一题）：
//   选择题：题干 | 选项A | 选项B | 选项C | 选项D | 答案 | 解析(可空)
//   判断题：题干 | 对/错 | 解析(可空)
//   简答题：题干 | 参考答案(释义) | 解析(可空)
function parseQuestionLines(text, type) {
    const lines = (text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
    const questions = [];
    for (const line of lines) {
        const parts = splitLine(line);
        const stem = parts[0];
        if (!stem) {
            continue;
        }
        if (type === 'judge') {
            if (parts.length < 2) {
                continue;
            }
            const answer = normalizeJudge(parts[1]);
            if (!answer) {
                continue;
            }
            const analysis = parts[2] || '';
            questions.push({
                type: 'judge',
                stem,
                options: JSON.stringify(['正确', '错误']),
                answer,
                analysis,
            });
        } else if (type === 'subjective') {
            if (parts.length < 2) {
                continue;
            }
            const answer = parts[1];
            if (!answer) {
                continue;
            }
            const analysis = parts[2] || '';
            questions.push({
                type: 'subjective',
                stem,
                options: JSON.stringify([]),
                answer,
                analysis,
            });
        } else {
            if (parts.length < 5) {
                continue;
            }
            const analysis = parts[parts.length - 1] || '';
            const answer = (parts[parts.length - 2] || '').toUpperCase().replace(/\s+/g, '');
            const options = parts.slice(1, parts.length - 2);
            if (!answer || options.length < 2) {
                continue;
            }
            const qType = answer.length > 1 ? 'multiple' : 'single';
            questions.push({
                type: qType,
                stem,
                options: JSON.stringify(options),
                answer,
                analysis,
            });
        }
    }
    return questions;
}

module.exports = { parseWordLines, parseQuestionLines };
