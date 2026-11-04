// 业务数据访问层：所有云端读写都经过这里，页面不直接拼查询。
// 每个方法都返回 { data, error }，不会 reject。
const { cloud } = require('./cloud');

async function safe(fn) {
    try {
        const result = await fn();
        return {
            data: result && result.data,
            error: result ? result.error : null,
            count: result ? result.count : null,
        };
    } catch (error) {
        return { data: null, error: { message: (error && error.message) || '网络异常，请重试' }, count: null };
    }
}

function db() {
    return cloud.database;
}

// 艾宾浩斯遗忘曲线复习间隔（天），对应 progress 0~6
const REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15, 30];
const MAX_PROGRESS = REVIEW_INTERVALS.length - 1;

function nextReviewAt(progress) {
    const days = REVIEW_INTERVALS[Math.min(Math.max(progress || 0, 0), MAX_PROGRESS)];
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
}

function nowISO() {
    return new Date().toISOString();
}

// ==================== 单词本 ====================
function listWordbooks() {
    return safe(() => db().from('wordbooks').select('*').order('created_at', { ascending: false }));
}
function createWordbook(payload) {
    return safe(() => db().from('wordbooks').insert(payload).select('*'));
}
function updateWordbook(id, patch) {
    return safe(() => db().from('wordbooks').update(patch).eq('id', id).select('*'));
}
function removeWordbook(id) {
    return safe(() => db().from('wordbooks').delete().eq('id', id).select('*'));
}

// ==================== 单词 ====================
function listWords(wordbookId) {
    return safe(() => db().from('words').select('*')
        .eq('wordbook_id', wordbookId)
        .order('created_at', { ascending: true }));
}
function createWord(payload) {
    return safe(() => db().from('words').insert(payload).select('*'));
}
function updateWord(id, patch) {
    return safe(() => db().from('words').update(patch).eq('id', id).select('*'));
}
function removeWord(id) {
    return safe(() => db().from('words').delete().eq('id', id).select('*'));
}
async function batchCreateWords(wordbookId, list) {
    const batchSize = 100;
    let created = 0;
    for (let i = 0; i < list.length; i += batchSize) {
        const chunk = list.slice(i, i + batchSize).map((w) => ({ ...w, wordbook_id: wordbookId }));
        const r = await safe(() => db().from('words').insert(chunk));
        if (r.error) {
            return { data: created, error: r.error };
        }
        created += (r.data || []).length;
    }
    return { data: created, error: null };
}
// 到期待复习的单词（跨所有单词本）
function listDueWords() {
    return safe(() => db().from('words').select('*')
        .lte('next_review_at', nowISO())
        .order('next_review_at', { ascending: true }));
}
// 尚未开始学习的单词（新导入，next_review_at 为空）
function listNewWords() {
    return safe(() => db().from('words').select('*').is('next_review_at', null));
}
// 按单词本统计进度（用于列表展示每个单词本的掌握度）
function countWords(wordbookId) {
    return safe(() => db().from('words').select('id', { count: 'exact', head: true })
        .eq('wordbook_id', wordbookId));
}
// 统计当前用户全部单词数
function countAllWords() {
    return safe(() => db().from('words').select('id', { count: 'exact', head: true }));
}
// 统计已掌握（progress 达到上限）的单词数
function countMasteredWords() {
    return safe(() => db().from('words').select('id', { count: 'exact', head: true })
        .gte('progress', MAX_PROGRESS));
}

// ==================== 题库 ====================
function listBanks() {
    return safe(() => db().from('question_banks').select('*').order('created_at', { ascending: false }));
}
function createBank(payload) {
    return safe(() => db().from('question_banks').insert(payload).select('*'));
}
function updateBank(id, patch) {
    return safe(() => db().from('question_banks').update(patch).eq('id', id).select('*'));
}
function removeBank(id) {
    return safe(() => db().from('question_banks').delete().eq('id', id).select('*'));
}

// ==================== 题目 ====================
function listQuestions(bankId) {
    return safe(() => db().from('questions').select('*')
        .eq('bank_id', bankId)
        .order('id', { ascending: true }));
}
function countQuestions(bankId) {
    return safe(() => db().from('questions').select('id', { count: 'exact', head: true })
        .eq('bank_id', bankId));
}
function createQuestion(payload) {
    return safe(() => db().from('questions').insert(payload).select('*'));
}
async function batchCreateQuestions(bankId, list) {
    const batchSize = 100;
    let created = 0;
    for (let i = 0; i < list.length; i += batchSize) {
        const chunk = list.slice(i, i + batchSize).map((q) => ({ ...q, bank_id: bankId }));
        const r = await safe(() => db().from('questions').insert(chunk));
        if (r.error) {
            return { data: created, error: r.error };
        }
        created += (r.data || []).length;
    }
    return { data: created, error: null };
}
function removeQuestion(id) {
    return safe(() => db().from('questions').delete().eq('id', id).select('*'));
}
function getQuestionsByIds(ids) {
    if (!ids || ids.length === 0) {
        return Promise.resolve({ data: [], error: null });
    }
    return safe(() => db().from('questions').select('*').in('id', ids));
}

// ==================== 练习记录 ====================
function createPracticeRecord(payload) {
    return safe(() => db().from('practice_records').insert(payload).select('*'));
}
function listPracticeRecords() {
    return safe(() => db().from('practice_records').select('*').order('created_at', { ascending: false }));
}

// ==================== 错题 ====================
async function addWrongQuestion(questionId, bankId) {
    const existing = await safe(() => db().from('wrong_questions')
        .select('id, wrong_count').eq('question_id', questionId));
    if (existing.error) {
        return existing;
    }
    if (existing.data && existing.data.length > 0) {
        const row = existing.data[0];
        return safe(() => db().from('wrong_questions')
            .update({ wrong_count: (row.wrong_count || 1) + 1, last_wrong_at: nowISO() })
            .eq('id', row.id).select('*'));
    }
    return safe(() => db().from('wrong_questions')
        .insert({ question_id: questionId, bank_id: bankId, wrong_count: 1 }).select('*'));
}
function listWrongQuestions() {
    return safe(() => db().from('wrong_questions').select('*').order('last_wrong_at', { ascending: false }));
}
function removeWrongQuestion(id) {
    return safe(() => db().from('wrong_questions').delete().eq('id', id).select('*'));
}
function removeWrongByQuestionId(questionId) {
    return safe(() => db().from('wrong_questions').delete().eq('question_id', questionId).select('*'));
}

// ==================== 刷题作答记录（已做过的题 / 计划刷题 / 统计） ====================
// 记录一次作答：累计次数、答对次数、最后一次结果
async function recordQuestionResult(questionId, bankId, correct) {
    return safe(async () => {
        const existing = await db().from('question_marks')
            .select('id, times, correct_count').eq('question_id', questionId).limit(1).maybeSingle();
        const row = existing && existing.data ? existing.data : null;
        if (row) {
            return db().from('question_marks').update({
                times: (row.times || 0) + 1,
                correct_count: (row.correct_count || 0) + (correct ? 1 : 0),
                last_result: correct ? 'correct' : 'wrong',
                bank_id: bankId,
                updated_at: nowISO(),
            }).eq('id', row.id).select('*');
        }
        return db().from('question_marks').insert({
            question_id: questionId,
            bank_id: bankId,
            times: 1,
            correct_count: correct ? 1 : 0,
            last_result: correct ? 'correct' : 'wrong',
            updated_at: nowISO(),
        }).select('*');
    });
}
function listQuestionMarks() {
    return safe(() => db().from('question_marks').select('*').order('updated_at', { ascending: false }));
}
function listAllQuestions() {
    return safe(() => db().from('questions').select('*').order('id', { ascending: true }));
}
// 已做过的题目（作答记录 + 题目内容）
async function listDoneQuestions() {
    const marksRes = await listQuestionMarks();
    if (marksRes.error) {
        return marksRes;
    }
    const marks = marksRes.data || [];
    if (marks.length === 0) {
        return { data: [], error: null };
    }
    const ids = marks.map((m) => m.question_id);
    const qMap = {};
    const CHUNK = 400;
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const r = await safe(() => db().from('questions')
            .select('id, bank_id, type, stem, options, answer, analysis').in('id', chunk));
        if (r.error) {
            return { data: null, error: r.error };
        }
        (r.data || []).forEach((q) => { qMap[q.id] = q; });
    }
    const out = [];
    marks.forEach((m) => {
        const q = qMap[m.question_id];
        if (q) {
            out.push({
                question_id: m.question_id,
                bank_id: q.bank_id,
                times: m.times,
                correct_count: m.correct_count,
                last_result: m.last_result,
                updated_at: m.updated_at,
                type: q.type,
                stem: q.stem,
                options: q.options,
                answer: q.answer,
                analysis: q.analysis,
            });
        }
    });
    return { data: out, error: null };
}
// 按每日计划取题：错题优先 → 做过次数少的 → 未做过的
async function pickDailyQuestions(limit) {
    const [qRes, mRes] = await Promise.all([listAllQuestions(), listQuestionMarks()]);
    if (qRes.error) {
        return qRes;
    }
    if (mRes.error) {
        return mRes;
    }
    const questions = qRes.data || [];
    if (questions.length === 0) {
        return { data: [], error: null };
    }
    const markMap = {};
    (mRes.data || []).forEach((m) => { markMap[m.question_id] = m; });
    const scored = questions.map((q) => {
        const m = markMap[q.id];
        let score = 2;
        if (m) {
            score = m.last_result === 'wrong' ? 0 : 1;
        }
        return { q, score, times: m ? (m.times || 0) : 0 };
    });
    scored.sort((a, b) => {
        if (a.score !== b.score) {
            return a.score - b.score;
        }
        if (a.times !== b.times) {
            return a.times - b.times;
        }
        return a.q.id - b.q.id;
    });
    return { data: scored.slice(0, limit).map((s) => s.q), error: null };
}

// ==================== 总计划池（单词 / 题目） ====================
function listPlanItems(itemType) {
    let query = db().from('plan_items').select('*');
    if (itemType) {
        query = query.eq('item_type', itemType);
    }
    return safe(() => query.order('added_at', { ascending: false }));
}
function countPlanItems(itemType) {
    let query = db().from('plan_items').select('id', { count: 'exact', head: true });
    if (itemType) {
        query = query.eq('item_type', itemType);
    }
    return safe(() => query);
}
function removePlanItem(id) {
    return safe(() => db().from('plan_items').delete().eq('id', id).select('*'));
}
// 批量把单词加入总计划（去重 + 已存在跳过）
async function addWordsToPlan(words) {
    const uniq = Array.from(new Set((words || []).filter(Boolean)));
    if (uniq.length === 0) {
        return { data: 0, error: null };
    }
    const existing = await safe(() => db().from('plan_items').select('word').eq('item_type', 'word'));
    if (existing.error) {
        return existing;
    }
    const have = new Set((existing.data || []).map((r) => r.word));
    const toAdd = uniq.filter((w) => !have.has(w));
    let added = 0;
    const CHUNK = 500;
    for (let i = 0; i < toAdd.length; i += CHUNK) {
        const chunk = toAdd.slice(i, i + CHUNK).map((w) => ({ item_type: 'word', word: w, status: 'pending' }));
        const r = await safe(() => db().from('plan_items').insert(chunk));
        if (r.error) {
            return { data: added, error: r.error };
        }
        added += chunk.length;
    }
    return { data: added, error: null };
}
// 批量把题目加入总计划
async function addQuestionsToPlan(questionIds) {
    const uniq = Array.from(new Set((questionIds || []).map((n) => Number(n)).filter((n) => n > 0)));
    if (uniq.length === 0) {
        return { data: 0, error: null };
    }
    const existing = await safe(() => db().from('plan_items').select('question_id').eq('item_type', 'question'));
    if (existing.error) {
        return existing;
    }
    const have = new Set((existing.data || []).map((r) => r.question_id));
    const toAdd = uniq.filter((id) => !have.has(id));
    let added = 0;
    const CHUNK = 500;
    for (let i = 0; i < toAdd.length; i += CHUNK) {
        const chunk = toAdd.slice(i, i + CHUNK).map((id) => ({ item_type: 'question', question_id: id, status: 'pending' }));
        const r = await safe(() => db().from('plan_items').insert(chunk));
        if (r.error) {
            return { data: added, error: r.error };
        }
        added += chunk.length;
    }
    return { data: added, error: null };
}
// 总计划里的单词（总计划 ∪ 我的单词本，带释义与进度信息）
async function listPlanWordInfos() {
    const [items, wordsRes] = await Promise.all([
        listPlanItems('word'),
        safe(() => db().from('words').select('id, word, phonetic, meaning, progress, next_review_at')),
    ]);
    if (wordsRes.error) {
        return wordsRes;
    }
    const wordsMap = {};
    (wordsRes.data || []).forEach((w) => {
        if (w.word) {
            wordsMap[w.word] = w;
        }
    });
    const wordSet = new Set();
    (items.data || []).forEach((i) => { if (i.word) wordSet.add(i.word); });
    (wordsRes.data || []).forEach((w) => { if (w.word) wordSet.add(w.word); });
    const words = Array.from(wordSet);
    if (words.length === 0) {
        return { data: [], error: null };
    }
    const info = {};
    const CHUNK = 400;
    for (let i = 0; i < words.length; i += CHUNK) {
        const chunk = words.slice(i, i + CHUNK);
        const r = await safe(() => db().from('library_words').select('word, phonetic, meaning').in('word', chunk));
        if (r.error) {
            return { data: null, error: r.error };
        }
        (r.data || []).forEach((w) => { info[w.word] = w; });
    }
    return {
        data: words.map((w) => {
            const wb = wordsMap[w];
            const li = info[w];
            return {
                word: w,
                phonetic: wb ? wb.phonetic : (li ? li.phonetic : null),
                meaning: wb ? wb.meaning : (li ? li.meaning : null),
                wordId: wb ? wb.id : null,
                wordProgress: wb ? (wb.progress || 0) : 0,
                wordNext: wb ? wb.next_review_at : null,
            };
        }),
        error: null,
    };
}
// 总计划单词的待复习/新词统计（首页与单词页共用，保证一致）
async function planWordStats() {
    const [infos, marks] = await Promise.all([listPlanWordInfos(), listAllMarks()]);
    if (infos.error) {
        return infos;
    }
    if (marks.error) {
        return marks;
    }
    const markMap = {};
    (marks.data || []).forEach((m) => { markMap[m.word] = m; });
    const nowTs = Date.now();
    let due = 0;
    let fresh = 0;
    let mastered = 0;
    let studied = 0;
    (infos.data || []).forEach((w) => {
        const m = markMap[w.word];
        const markDue = m && m.next_review_at && new Date(m.next_review_at).getTime() <= nowTs;
        const wordDue = w.wordNext && new Date(w.wordNext).getTime() <= nowTs;
        const isStudied = !!m || (w.wordProgress > 0);
        const isMastered = (m && m.status === 'mastered') || (w.wordProgress >= MAX_PROGRESS);
        if (isStudied) {
            studied++;
        }
        if (isMastered) {
            mastered++;
        }
        if (markDue || wordDue) {
            due++;
        } else if (!isStudied) {
            fresh++;
        }
    });
    const total = (infos.data || []).length;
    return { data: { total, due, fresh, mastered, learning: Math.max(studied - mastered, 0) }, error: null };
}
// 总计划题目的统计（总数 / 已做）
async function planQuestionStats() {
    const [planRes, marksRes] = await Promise.all([listPlanQuestions(), listQuestionMarks()]);
    if (planRes.error) {
        return planRes;
    }
    if (marksRes.error) {
        return marksRes;
    }
    const ids = new Set((planRes.data || []).map((q) => q.id));
    const done = (marksRes.data || []).filter((m) => ids.has(m.question_id)).length;
    return { data: { total: ids.size, done }, error: null };
}
// 总计划里的题目
async function listPlanQuestions() {
    const items = await listPlanItems('question');
    if (items.error) {
        return items;
    }
    const ids = (items.data || []).map((i) => i.question_id).filter((n) => n);
    if (ids.length === 0) {
        return { data: [], error: null };
    }
    const out = [];
    const CHUNK = 400;
    for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const r = await getQuestionsByIds(chunk);
        if (r.error) {
            return { data: null, error: r.error };
        }
        (r.data || []).forEach((q) => out.push(q));
    }
    return { data: out, error: null };
}
// 把单词标记重置为“未学”，让它们作为新词重新进入总计划学习
async function resetMarksToNew(words) {
    const uniq = Array.from(new Set((words || []).filter(Boolean)));
    if (uniq.length === 0) {
        return { data: 0, error: null };
    }
    let n = 0;
    const CHUNK = 400;
    for (let i = 0; i < uniq.length; i += CHUNK) {
        const chunk = uniq.slice(i, i + CHUNK);
        const r = await safe(() => db().from('user_word_marks')
            .update({ progress: 0, status: 'learning', next_review_at: null, updated_at: nowISO() })
            .in('word', chunk).select('*'));
        if (r.error) {
            return { data: n, error: r.error };
        }
        n += (r.data || []).length;
    }
    return { data: n, error: null };
}
// 清掉题目作答记录，让它们作为“未做”重新进入总计划练习
async function resetQuestionMarksToNew(questionIds) {
    const uniq = Array.from(new Set((questionIds || []).map((x) => Number(x)).filter((x) => x > 0)));
    if (uniq.length === 0) {
        return { data: 0, error: null };
    }
    let n = 0;
    const CHUNK = 400;
    for (let i = 0; i < uniq.length; i += CHUNK) {
        const chunk = uniq.slice(i, i + CHUNK);
        const r = await safe(() => db().from('question_marks').delete().in('question_id', chunk).select('*'));
        if (r.error) {
            return { data: n, error: r.error };
        }
        n += (r.data || []).length;
    }
    return { data: n, error: null };
}
// 删除单词的学习记录（标记 + 单词本进度归零）＝重学
async function deleteWordRecord(word) {
    if (!word) {
        return { data: null, error: { message: '单词为空' } };
    }
    const a = await safe(() => db().from('user_word_marks').delete().eq('word', word).select('*'));
    const b = await safe(() => db().from('words').update({ progress: 0, next_review_at: null }).eq('word', word).select('*'));
    if (a.error && b.error) {
        return { data: null, error: a.error };
    }
    return { data: true, error: null };
}
// 删除题目的作答记录＝重做
function deleteQuestionRecord(questionId) {
    return safe(() => db().from('question_marks').delete().eq('question_id', questionId).select('*'));
}
// 批量删除单词学习记录
async function deleteWordRecords(words) {
    const uniq = Array.from(new Set((words || []).filter(Boolean)));
    if (uniq.length === 0) {
        return { data: 0, error: null };
    }
    const CHUNK = 200;
    for (let i = 0; i < uniq.length; i += CHUNK) {
        const chunk = uniq.slice(i, i + CHUNK);
        await safe(() => db().from('user_word_marks').delete().in('word', chunk).select('*'));
        await safe(() => db().from('words').update({ progress: 0, next_review_at: null }).in('word', chunk).select('*'));
    }
    return { data: uniq.length, error: null };
}
// 批量删除题目作答记录
async function deleteQuestionRecords(ids) {
    const uniq = Array.from(new Set((ids || []).map((n) => Number(n)).filter((n) => n > 0)));
    if (uniq.length === 0) {
        return { data: 0, error: null };
    }
    const CHUNK = 200;
    for (let i = 0; i < uniq.length; i += CHUNK) {
        const chunk = uniq.slice(i, i + CHUNK);
        await safe(() => db().from('question_marks').delete().in('question_id', chunk).select('*'));
    }
    return { data: uniq.length, error: null };
}

// ==================== 预设词库 ====================
function listPresetWordbooks() {
    return safe(() => db().from('preset_wordbooks').select('*').order('sort_order', { ascending: true }));
}
function listPresetWords(bookId) {
    return safe(() => db().from('preset_words').select('*')
        .eq('book_id', bookId)
        .order('sort_order', { ascending: true }));
}
// 订阅预设词库：复制成用户自己的单词本 + 单词
async function subscribePresetWordbook(presetBookId) {
    const bookResult = await safe(() => db().from('preset_wordbooks')
        .select('*').eq('id', presetBookId).maybeSingle());
    if (bookResult.error || !bookResult.data) {
        return { data: null, error: bookResult.error || { message: '词库不存在' } };
    }
    const book = bookResult.data;
    const wbResult = await safe(() => db().from('wordbooks').insert({
        name: book.name,
        category: book.category,
        description: book.description,
        preset_id: presetBookId,
    }).select('*'));
    if (wbResult.error || !wbResult.data) {
        return { data: null, error: wbResult.error || { message: '创建单词本失败' } };
    }
    const wb = wbResult.data[0];
    const wordsResult = await safe(() => db().from('preset_words')
        .select('word, phonetic, meaning, example')
        .eq('book_id', presetBookId)
        .order('sort_order', { ascending: true }));
    if (wordsResult.error) {
        return { data: null, error: wordsResult.error };
    }
    const list = (wordsResult.data || []).map((w) => ({
        word: w.word, phonetic: w.phonetic, meaning: w.meaning, example: w.example,
    }));
    const created = await batchCreateWords(wb.id, list);
    if (created.error) {
        return { data: null, error: created.error };
    }
    return { data: { wordbook: wb, count: created.data }, error: null };
}

// ==================== 预设题库 ====================
function listPresetQuestionBanks() {
    return safe(() => db().from('preset_question_banks').select('*').order('sort_order', { ascending: true }));
}
function listPresetQuestions(bankId) {
    return safe(() => db().from('preset_questions').select('*')
        .eq('bank_id', bankId)
        .order('sort_order', { ascending: true }));
}
// 订阅预设题库：复制成用户自己的题库 + 题目
async function subscribePresetQuestionBank(presetBankId) {
    const bankResult = await safe(() => db().from('preset_question_banks')
        .select('*').eq('id', presetBankId).maybeSingle());
    if (bankResult.error || !bankResult.data) {
        return { data: null, error: bankResult.error || { message: '题库不存在' } };
    }
    const bank = bankResult.data;
    const qbResult = await safe(() => db().from('question_banks').insert({
        name: bank.name,
        category: bank.category,
        description: bank.description,
        preset_bank_id: presetBankId,
    }).select('*'));
    if (qbResult.error || !qbResult.data) {
        return { data: null, error: qbResult.error || { message: '创建题库失败' } };
    }
    const qb = qbResult.data[0];
    const questionsResult = await safe(() => db().from('preset_questions')
        .select('type, stem, options, answer, analysis')
        .eq('bank_id', presetBankId)
        .order('sort_order', { ascending: true }));
    if (questionsResult.error) {
        return { data: null, error: questionsResult.error };
    }
    const list = (questionsResult.data || []).map((q) => ({
        type: q.type, stem: q.stem, options: q.options, answer: q.answer, analysis: q.analysis,
    }));
    const created = await batchCreateQuestions(qb.id, list);
    if (created.error) {
        return { data: null, error: created.error };
    }
    // 订阅后自动把题目加入总计划
    const newQs = await safe(() => db().from('questions').select('id').eq('bank_id', qb.id));
    if (newQs.data && newQs.data.length > 0) {
        await addQuestionsToPlan(newQs.data.map((q) => q.id));
    }
    return { data: { bank: qb, count: created.data }, error: null };
}

// ==================== 云端词库（等级 → 子词库 → 单词） ====================
function listWordSeries() {
    return safe(() => db().from('word_series').select('*').order('sort_order', { ascending: true }));
}
function listWordLibraries(seriesId) {
    let query = db().from('word_libraries').select('*');
    if (seriesId != null) {
        query = query.eq('series_id', seriesId);
    }
    return safe(() => query.order('sort_order', { ascending: true }));
}
// 订阅云端子词库：复制成用户自己的单词本 + 单词（幂等：已订阅则直接返回）
async function subscribeWordLibrary(libraryId) {
    const libResult = await safe(() => db().from('word_libraries')
        .select('id, name, kind, series_id').eq('id', libraryId).maybeSingle());
    if (libResult.error || !libResult.data) {
        return { data: null, error: libResult.error || { message: '词库不存在' } };
    }
    const lib = libResult.data;
    const seriesResult = await safe(() => db().from('word_series')
        .select('name').eq('id', lib.series_id).maybeSingle());
    const seriesName = (seriesResult.data && seriesResult.data.name) || '词库';
    const kindLabel = lib.kind === 'full' ? '完整词库' : '高频词库';
    const bookName = seriesName + '·' + kindLabel;

    const exist = await safe(() => db().from('wordbooks')
        .select('id').eq('preset_library_id', libraryId).limit(1).maybeSingle());
    if (exist.data) {
        return { data: { wordbook: exist.data, count: 0, already: true }, error: null };
    }

    const wbResult = await safe(() => db().from('wordbooks').insert({
        name: bookName,
        category: seriesName,
        description: kindLabel,
        preset_library_id: libraryId,
    }).select('*'));
    if (wbResult.error || !wbResult.data) {
        return { data: null, error: wbResult.error || { message: '创建单词本失败' } };
    }
    const wb = wbResult.data[0];

    // 取该子词库的全部单词 id（分批 IN 查询，避免超长 URL）
    const mapResult = await safe(() => db().from('library_word_map')
        .select('word_id').eq('library_id', libraryId).order('sort_order', { ascending: true }));
    if (mapResult.error) {
        return { data: null, error: mapResult.error };
    }
    const wordIds = (mapResult.data || []).map((r) => r.word_id);
    if (wordIds.length === 0) {
        return { data: { wordbook: wb, count: 0 }, error: null };
    }
    const list = [];
    const CHUNK = 500;
    for (let i = 0; i < wordIds.length; i += CHUNK) {
        const ids = wordIds.slice(i, i + CHUNK);
        const wr = await safe(() => db().from('library_words')
            .select('word, phonetic, meaning').in('id', ids));
        if (wr.error) {
            return { data: null, error: wr.error };
        }
        (wr.data || []).forEach((w) => list.push({
            word: w.word, phonetic: w.phonetic, meaning: w.meaning, example: null,
        }));
    }
    const created = await batchCreateWords(wb.id, list);
    if (created.error) {
        return { data: null, error: created.error };
    }
    return { data: { wordbook: wb, count: created.data }, error: null };
}
// 查询子词库的单词，可选排除已背会（mastered）的单词
async function listLibraryWords(libraryId, excludeMastered) {
    const mapResult = await safe(() => db().from('library_word_map')
        .select('word_id, sort_order')
        .eq('library_id', libraryId)
        .order('sort_order', { ascending: true }));
    if (mapResult.error) {
        return mapResult;
    }
    const mapRows = mapResult.data || [];
    if (mapRows.length === 0) {
        return { data: [], error: null };
    }
    const wordIds = mapRows.map((r) => r.word_id);
    const wordsResult = await safe(() => db().from('library_words').select('*').in('id', wordIds));
    if (wordsResult.error) {
        return wordsResult;
    }
    const wordMap = {};
    (wordsResult.data || []).forEach((w) => {
        wordMap[w.id] = w;
    });
    let mastered = new Set();
    if (excludeMastered) {
        const marksResult = await safe(() => db().from('user_word_marks')
            .select('word').eq('status', 'mastered'));
        (marksResult.data || []).forEach((m) => mastered.add(m.word));
    }
    const list = [];
    mapRows.forEach((r) => {
        const w = wordMap[r.word_id];
        if (w && !mastered.has(w.word)) {
            list.push({ ...w, sort_order: r.sort_order });
        }
    });
    return { data: list, error: null };
}
// 记录/更新单词学习标记（按 word 唯一，跨子词库生效）
async function upsertWordMark(word, known) {
    return safe(async () => {
        const existing = await db().from('user_word_marks')
            .select('id, progress, review_count').eq('word', word).limit(1).maybeSingle();
        const row = existing && existing.data ? existing.data : null;
        const curProgress = (row && row.progress) || 0;
        const newProgress = known ? Math.min(curProgress + 1, MAX_PROGRESS) : 0;
        const reviewCount = ((row && row.review_count) || 0) + 1;
        const status = newProgress >= MAX_PROGRESS ? 'mastered' : 'learning';
        const patch = {
            word,
            status,
            progress: newProgress,
            review_count: reviewCount,
            next_review_at: nextReviewAt(newProgress),
            updated_at: nowISO(),
        };
        if (row) {
            return db().from('user_word_marks').update(patch).eq('id', row.id).select('*');
        }
        return db().from('user_word_marks').insert(patch).select('*');
    });
}
// 到期复习的标记（跨所有子词库）
function listDueMarks() {
    return safe(() => db().from('user_word_marks').select('*')
        .eq('status', 'learning')
        .lte('next_review_at', nowISO())
        .order('next_review_at', { ascending: true }));
}
// 统计某用户的标记（用于进度）
function countMasteredMarks() {
    return safe(() => db().from('user_word_marks').select('id', { count: 'exact', head: true })
        .eq('status', 'mastered'));
}

// ==================== 已学单词 / 统计聚合 ====================
function listAllMarks() {
    return safe(() => db().from('user_word_marks').select('*').order('updated_at', { ascending: false }));
}
// 词库标记关联出 word/phonetic/meaning
async function listMarksWithWords() {
    const marksRes = await listAllMarks();
    if (marksRes.error) {
        return marksRes;
    }
    const marks = marksRes.data || [];
    if (marks.length === 0) {
        return { data: [], error: null };
    }
    const words = marks.map((m) => m.word).filter((w) => w);
    const info = {};
    const CHUNK = 400;
    for (let i = 0; i < words.length; i += CHUNK) {
        const chunk = words.slice(i, i + CHUNK);
        const r = await safe(() => db().from('library_words').select('word, phonetic, meaning').in('word', chunk));
        if (r.error) {
            return { data: null, error: r.error };
        }
        (r.data || []).forEach((w) => { info[w.word] = w; });
    }
    return {
        data: marks.map((m) => ({
            ...m,
            phonetic: info[m.word] ? info[m.word].phonetic : null,
            meaning: info[m.word] ? info[m.word].meaning : null,
            source: 'mark',
        })),
        error: null,
    };
}
// 单词本中已学过的单词（progress > 0）
function listStudiedWords() {
    return safe(() => db().from('words').select('*').gt('progress', 0).order('created_at', { ascending: false }));
}
// 合并「已学单词」（词库标记 + 单词本已学），按 word 去重
async function listLearnedWords() {
    const [marksRes, studiedRes] = await Promise.all([listMarksWithWords(), listStudiedWords()]);
    if (marksRes.error) {
        return marksRes;
    }
    if (studiedRes.error) {
        return studiedRes;
    }
    const seen = {};
    const out = [];
    (marksRes.data || []).forEach((m) => {
        if (m.word && !seen[m.word]) {
            seen[m.word] = true;
            out.push({
                word: m.word,
                meaning: m.meaning,
                phonetic: m.phonetic,
                status: m.status,
                progress: m.progress,
                source: 'mark',
            });
        }
    });
    (studiedRes.data || []).forEach((w) => {
        if (w.word && !seen[w.word]) {
            seen[w.word] = true;
            out.push({
                word: w.word,
                meaning: w.meaning,
                phonetic: w.phonetic,
                status: w.progress >= MAX_PROGRESS ? 'mastered' : 'learning',
                progress: w.progress,
                source: 'word',
                id: w.id,
                wordbook_id: w.wordbook_id,
            });
        }
    });
    return { data: out, error: null };
}
// 把单词重新加入学习计划：进度归零并立即到期（词库标记 + 单词本两处同时重置）
async function resetWordToPlan(word) {
    if (!word) {
        return { data: null, error: { message: '单词为空' } };
    }
    const now = nowISO();
    const a = await safe(() => db().from('user_word_marks')
        .update({ progress: 0, status: 'learning', next_review_at: now, updated_at: now })
        .eq('word', word).select('*'));
    const b = await safe(() => db().from('words')
        .update({ progress: 0, next_review_at: now })
        .eq('word', word).select('*'));
    if (a.error && b.error) {
        return { data: null, error: a.error };
    }
    return { data: { marks: a.data || [], words: b.data || [] }, error: null };
}

// ==================== 学习顺序（乱序 / 正序） ====================
// mode: 'random' 乱序 | 'order' 正序。返回新数组，不改原列表。
function applyOrder(list, mode) {
    const arr = (list || []).slice();
    if (mode !== 'random' || arr.length < 2) {
        return arr;
    }
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

// 读取顺序设置：kind = 'word' | 'question'
async function getOrderMode(kind) {
    const r = await getPlanSettings();
    const s = r.data || {};
    const value = kind === 'question' ? s.question_order : s.word_order;
    return value === 'order' ? 'order' : 'random';
}

function saveOrderMode(kind, mode) {
    const value = mode === 'order' ? 'order' : 'random';
    const patch = kind === 'question' ? { question_order: value } : { word_order: value };
    patch.updated_at = nowISO();
    return savePlanSettings(patch);
}

// ==================== 背词计划设置 ====================
function getPlanSettings() {
    return safe(() => db().from('plan_settings').select('*').limit(1).maybeSingle());
}
function savePlanSettings(patch) {
    return safe(async () => {
        const existing = await db().from('plan_settings').select('id').limit(1).maybeSingle();
        const row = existing && existing.data ? existing.data : null;
        if (row) {
            return db().from('plan_settings').update(patch).eq('id', row.id).select('*');
        }
        return db().from('plan_settings').insert(patch).select('*');
    });
}

// ==================== 复习记录 ====================
function addReviewLog(wordId, known) {
    return safe(() => db().from('review_logs').insert({ word_id: wordId, known: !!known }));
}
// 最近 N 天复习统计：返回 { total, known }
async function recentReviewStats(days) {
    const since = new Date();
    since.setDate(since.getDate() - (days || 7));
    const result = await safe(() => db().from('review_logs').select('*')
        .gte('created_at', since.toISOString()));
    if (result.error) {
        return { data: null, error: result.error };
    }
    const logs = result.data || [];
    const known = logs.filter((l) => l.known).length;
    return { data: { total: logs.length, known }, error: null };
}

module.exports = {
    nextReviewAt,
    MAX_PROGRESS,
    nowISO,
    // 单词本
    listWordbooks,
    createWordbook,
    updateWordbook,
    removeWordbook,
    // 单词
    listWords,
    createWord,
    updateWord,
    removeWord,
    batchCreateWords,
    listDueWords,
    listNewWords,
    countWords,
    countAllWords,
    countMasteredWords,
    // 题库
    listBanks,
    createBank,
    updateBank,
    removeBank,
    // 题目
    listQuestions,
    countQuestions,
    createQuestion,
    batchCreateQuestions,
    removeQuestion,
    getQuestionsByIds,
    // 练习
    createPracticeRecord,
    listPracticeRecords,
    // 错题
    addWrongQuestion,
    listWrongQuestions,
    removeWrongQuestion,
    removeWrongByQuestionId,
    // 刷题作答记录
    recordQuestionResult,
    listQuestionMarks,
    listAllQuestions,
    listDoneQuestions,
    pickDailyQuestions,
    // 总计划池
    listPlanItems,
    countPlanItems,
    removePlanItem,
    addWordsToPlan,
    addQuestionsToPlan,
    listPlanWordInfos,
    planWordStats,
    planQuestionStats,
    listPlanQuestions,
    resetMarksToNew,
    resetQuestionMarksToNew,
    deleteWordRecord,
    deleteQuestionRecord,
    deleteWordRecords,
    deleteQuestionRecords,
    // 预设词库
    listPresetWordbooks,
    listPresetWords,
    subscribePresetWordbook,
    // 预设题库
    listPresetQuestionBanks,
    listPresetQuestions,
    subscribePresetQuestionBank,
    // 云端词库（等级/子词库/单词/标记）
    listWordSeries,
    listWordLibraries,
    subscribeWordLibrary,
    listLibraryWords,
    upsertWordMark,
    listDueMarks,
    countMasteredMarks,
    listAllMarks,
    listMarksWithWords,
    listStudiedWords,
    listLearnedWords,
    resetWordToPlan,
    // 计划设置
    getPlanSettings,
    savePlanSettings,
    // 学习顺序（乱序 / 正序）
    applyOrder,
    getOrderMode,
    saveOrderMode,
    // 复习记录
    addReviewLog,
    recentReviewStats,
};
