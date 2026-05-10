// Background service worker - handles LLM API calls
// Runs in module context (type: "module" in manifest)

const BATCH_SIZE = 10;

const SYSTEM_PROMPT_ZH = `你是一个问卷自动填写助手。你会收到结构化的问卷题目数据，需要返回结构化的 JSON 答案。

规则：
- 单选题/下拉题：从给定选项中选择一个最合适的，必须从选项原文中选择，不得自己编造。
- 多选题(checkbox)：从给定选项中选择多个合适的，通常选2-4个，必须从选项原文中选择，返回数组。
- 填空题/文本域：根据题目内容生成自然、合理的中文回答，不要太长，2-4句话即可。
- 数字题：如果题目问的是年龄、数量、金额、百分比等具体数字，直接返回数字，不要加任何文字说明。
- 评分题：给出中等偏上的分数（5分制给3-4分，10分制给7-8分）。
- 矩阵题：为每一行选择一个合适的列选项。
- 日期题：给出合理的日期，格式为 YYYY-MM-DD。
- 所有回答必须使用中文（除非题目本身是英文）。
- 只返回合法 JSON，不要添加任何额外文字、markdown标记或代码块标记。`;

const SYSTEM_PROMPT_EN = `You are a questionnaire auto-fill assistant. You receive structured question data and return structured JSON answers.

Rules:
- Radio/Select: Pick one option from the given options. You MUST use the exact option text, do not invent new options.
- Checkbox: Pick multiple options from the given options, usually 2-4. You MUST use the exact option text. Return an array.
- Text/Textarea: Generate a natural, reasonable answer based on the question context. Keep it 2-3 sentences.
- Number: If the question asks for age, quantity, amount, percentage, or any specific number, return just the number with no extra text.
- Rating: Give moderately positive scores (3-4 on a 5-point scale, 7-8 on a 10-point scale).
- Matrix: Select an appropriate column option for each row.
- Date: Give a reasonable date in YYYY-MM-DD format.
- All text answers should match the language of the questionnaire.
- Return valid JSON only. No extra text, no markdown fences, no code blocks.`;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TEST_CONNECTION') {
    handleTestConnection(message.config, sendResponse);
    return true;
  }
  if (message.type === 'REQUEST_ANSWERS') {
    handleAnswerRequest(message, sendResponse);
    return true;
  }
});

async function getConfig() {
  const { llmConfig } = await chrome.storage.local.get('llmConfig');
  if (!llmConfig || !llmConfig.apiKey) {
    throw new Error('请先在插件设置中配置 API Key');
  }
  return llmConfig;
}

async function getAppSettings() {
  const { appSettings } = await chrome.storage.local.get('appSettings');
  return appSettings || { tone: 'neutral', autoSubmit: false };
}

function normalizeEndpoint(baseUrl) {
  const url = baseUrl.replace(/\/+$/, '');
  if (url.endsWith('/chat/completions')) return url;
  return `${url}/chat/completions`;
}

async function callLLM(config, messages, options = {}) {
  const endpoint = normalizeEndpoint(config.baseUrl);

  const body = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4000,
  };

  // response_format may not be supported by all providers
  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new LLMApiError(response.status, errorText);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = error.status && [429, 500, 502, 503].includes(error.status);
      if (!isRetryable || i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000 + Math.random() * 1000);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildPrompt(questions, pageContext, appSettings) {
  const isZh = pageContext.language?.startsWith('zh');
  const toneMap = {
    neutral: isZh ? '中性自然' : 'neutral and natural',
    positive: isZh ? '积极正面' : 'positive and agreeable',
    critical: isZh ? '批判思考' : 'critical and thoughtful',
    random: isZh ? '随机多样' : 'varied and diverse'
  };
  const tone = toneMap[appSettings.tone] || toneMap.neutral;

  if (isZh) {
    return buildPromptZh(questions, pageContext, tone);
  }
  return buildPromptEn(questions, pageContext, tone);
}

function buildPromptZh(questions, pageContext, tone) {
  let prompt = `以下是 ${questions.length} 道问卷题目，请为每道题生成合适的答案。

问卷标题：${pageContext.pageTitle || '未知'}
问卷主题：${pageContext.topic || '通用调查'}
回答风格：${tone}

重要提示：
- 选择题必须从【备选项】中选择，使用完全一致的文字，不能自己编造选项。
- 填空题根据题意生成合理的中文回答。
- 每道题的 "id" 必须与下方标注的 id 完全一致。

`;

  questions.forEach((q, i) => {
    prompt += `---\n题目 ${i + 1}（id: ${q.id}）\n`;
    prompt += `类型：${getTypeLabelZh(q.type)}`;
    if (q.required) prompt += ` [必答]`;
    prompt += `\n内容：${q.title}\n`;

    if (q.options && q.options.length > 0) {
      // Build option list, marking options with follow-up inputs
      const optParts = q.options.map(o => {
        let s = `「${o.label}」`;
        if (o.hasFollowUp) s += `[选此项需填写说明]`;
        return s;
      });
      prompt += `备选项：${optParts.join('、')}\n`;

      // List follow-up options separately for clarity
      const followUpOpts = q.options.filter(o => o.hasFollowUp);
      if (followUpOpts.length > 0) {
        prompt += `注意：选择以下选项时需要额外填写说明文字：${followUpOpts.map(o => `「${o.label}」`).join('、')}\n`;
      }
    }
    if (q.type === 'matrix' && q.meta?.matrixRows) {
      prompt += `行：${q.meta.matrixRows.join('、')}\n`;
      prompt += `列：${q.meta.matrixCols.join('、')}\n`;
    }
    if (q.meta?.isNumber) {
      prompt += `输入类型：数字\n`;
      if (q.meta.min !== undefined) prompt += `最小值：${q.meta.min}\n`;
      if (q.meta.max !== undefined) prompt += `最大值：${q.meta.max}\n`;
    } else if (q.meta?.min !== undefined && q.meta?.max !== undefined) {
      prompt += `范围：${q.meta.min} ~ ${q.meta.max}\n`;
    }
    if (q.meta?.maxLength) {
      prompt += `字数上限：${q.meta.maxLength}\n`;
    }
    if (q.type === 'checkbox') {
      if (q.meta?.minSelections) prompt += `最少选择：${q.meta.minSelections}项\n`;
      if (q.meta?.maxSelections) prompt += `最多选择：${q.meta.maxSelections}项\n`;
    }
  });

  prompt += `---

请严格按以下 JSON 格式返回，不要添加任何其他文字：
{
  "answers": [
    { "id": "q_0", "answer": "..." },
    { "id": "q_1", "answer": "..." }
  ]
}

各类型 answer 格式说明：
- 单选(radio)/下拉(select)：answer 为选项文字字符串，必须与备选项完全一致。
- 单选+附带文本：如果选了标有[选此项需填写说明]的选项，需要额外返回 followUp 字段，格式如：
  { "id": "q_0", "answer": "其他", "followUp": "具体说明内容" }
- 多选(checkbox)：answer 为选项文字组成的数组，如 ["选项A", "选项B"]，必须与备选项完全一致。
- 多选+附带文本：如果选了标有[选此项需填写说明]的选项，需要额外返回 followUp 字段，格式如：
  { "id": "q_0", "answer": ["选项A", "其他"], "followUp": "具体说明内容" }
- 填空(text)/文本域(textarea)：answer 为自然的中文回答字符串。如果题目问的是数字（年龄、数量、金额等），直接返回数字即可。
- 数字(text+number)：如果题目明确问数字，answer 直接返回数字，如 25、100、3.5 等。
- 评分(rating)/滑块(slider)：answer 为数字。
- 矩阵(matrix)：answer 为对象，key 是行名，value 是列名，如 {"行1": "列A", "行2": "列B"}。
- 日期(date)：answer 为日期字符串，如 "2024-01-15"。`;

  return prompt;
}

function buildPromptEn(questions, pageContext, tone) {
  let prompt = `Below are ${questions.length} questionnaire questions. Generate appropriate answers for each.

Page title: ${pageContext.pageTitle || 'Unknown'}
Topic: ${pageContext.topic || 'general survey'}
Answer tone: ${tone}

IMPORTANT:
- For choice questions, you MUST pick from the given 【Options】 using the exact text. Do NOT invent options.
- For text questions, generate natural answers in the same language as the question.
- The "id" for each answer must exactly match the id shown below.

`;

  questions.forEach((q, i) => {
    prompt += `---\nQuestion ${i + 1} (id: ${q.id})\n`;
    prompt += `Type: ${q.type}`;
    if (q.required) prompt += ` [required]`;
    prompt += `\nText: ${q.title}\n`;

    if (q.options && q.options.length > 0) {
      const optParts = q.options.map(o => {
        let s = `"${o.label}"`;
        if (o.hasFollowUp) s += `[needs follow-up text]`;
        return s;
      });
      prompt += `Options: ${optParts.join(', ')}\n`;

      const followUpOpts = q.options.filter(o => o.hasFollowUp);
      if (followUpOpts.length > 0) {
        prompt += `Note: selecting these options requires additional text: ${followUpOpts.map(o => `"${o.label}"`).join(', ')}\n`;
      }
    }
    if (q.type === 'matrix' && q.meta?.matrixRows) {
      prompt += `Rows: ${q.meta.matrixRows.join(', ')}\n`;
      prompt += `Columns: ${q.meta.matrixCols.join(', ')}\n`;
    }
    if (q.meta?.isNumber) {
      prompt += `Input type: number\n`;
      if (q.meta.min !== undefined) prompt += `Min: ${q.meta.min}\n`;
      if (q.meta.max !== undefined) prompt += `Max: ${q.meta.max}\n`;
    } else if (q.meta?.min !== undefined && q.meta?.max !== undefined) {
      prompt += `Range: ${q.meta.min} ~ ${q.meta.max}\n`;
    }
    if (q.meta?.maxLength) {
      prompt += `Max length: ${q.meta.maxLength}\n`;
    }
    if (q.type === 'checkbox') {
      if (q.meta?.minSelections) prompt += `Min selections: ${q.meta.minSelections}\n`;
      if (q.meta?.maxSelections) prompt += `Max selections: ${q.meta.maxSelections}\n`;
    }
  });

  prompt += `---

Return strictly in this JSON format, no other text:
{
  "answers": [
    { "id": "q_0", "answer": "..." },
    { "id": "q_1", "answer": "..." }
  ]
}

Answer format by type:
- radio/select: answer is the option text string, must exactly match one of the options.
- radio with follow-up: if you pick an option marked [needs follow-up text], add a followUp field:
  { "id": "q_0", "answer": "Other", "followUp": "explanation text" }
- checkbox: answer is an array of option text strings, must exactly match the options.
- checkbox with follow-up: if you pick an option marked [needs follow-up text], add a followUp field:
  { "id": "q_0", "answer": ["Option A", "Other"], "followUp": "explanation text" }
- text/textarea: answer is a natural response string. If the question asks for a number (age, quantity, etc.), return just the number.
- number: if the question clearly asks for a number, return just the number like 25, 100, 3.5.
- rating/slider: answer is a number.
- matrix: answer is an object mapping row names to column names.
- date: answer is a date string like "2024-01-15".`;

  return prompt;
}

function getTypeLabelZh(type) {
  const map = {
    text: '填空题',
    textarea: '文本域',
    radio: '单选题',
    checkbox: '多选题',
    select: '下拉选择',
    rating: '评分题',
    matrix: '矩阵题',
    date: '日期题',
    slider: '滑块题'
  };
  return map[type] || type;
}

function parseLLMResponse(content) {
  // Try direct JSON parse
  try {
    const parsed = JSON.parse(content);
    return parsed.answers || parsed;
  } catch {
    // Try extracting JSON from markdown fences
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        return parsed.answers || parsed;
      } catch { /* fall through */ }
    }
    // Try finding JSON object in the text
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        const parsed = JSON.parse(braceMatch[0]);
        return parsed.answers || parsed;
      } catch { /* fall through */ }
    }
    throw new Error('LLM 返回了无法解析的格式');
  }
}

async function handleTestConnection(config, sendResponse) {
  try {
    if (!config || !config.apiKey) {
      throw new Error('请输入 API Key');
    }
    const content = await callWithRetry(() =>
      callLLM(config, [
        { role: 'user', content: 'Reply with "OK" only.' }
      ], { maxTokens: 10 })
    );
    sendResponse({ model: config.model, ok: content.trim().includes('OK') });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleAnswerRequest(message, sendResponse) {
  try {
    const config = await getConfig();
    const appSettings = await getAppSettings();
    const { questions, pageContext } = message;

    if (!questions || questions.length === 0) {
      throw new Error('没有检测到题目');
    }

    const isZh = pageContext.language?.startsWith('zh');
    const systemPrompt = isZh ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN;
    const allAnswers = [];

    // Batch questions to avoid token limits
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = questions.slice(i, i + BATCH_SIZE);
      const prompt = buildPrompt(batch, pageContext, appSettings);

      const content = await callWithRetry(() =>
        callLLM(config, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ], {
          temperature: 0.7,
          maxTokens: 4000,
          responseFormat: { type: 'json_object' }
        })
      );

      const batchAnswers = parseLLMResponse(content);
      allAnswers.push(...batchAnswers);

      // Notify progress
      chrome.runtime.sendMessage({
        type: 'BATCH_PROGRESS',
        completed: Math.min(i + BATCH_SIZE, questions.length),
        total: questions.length
      }).catch(() => {});
    }

    sendResponse({ answers: allAnswers });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

class LLMApiError extends Error {
  constructor(status, body) {
    let msg = `API 错误 ${status}`;
    if (status === 401) msg = 'API Key 无效，请检查设置';
    else if (status === 429) msg = '请求频率超限，请稍后重试';
    else if (status === 404) msg = '模型不存在，请检查模型名称';
    else if (status >= 500) msg = 'API 服务端错误，请稍后重试';
    else msg = `${msg}: ${body.slice(0, 200)}`;
    super(msg);
    this.status = status;
    this.body = body;
  }
}
