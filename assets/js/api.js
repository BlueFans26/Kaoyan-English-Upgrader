import { parseModelOutput } from "./utils.js";

const CONFIG_KEY = "yingyu-daguan.api.v1";
const REQUEST_TIMEOUT = 240000;
const GRADING_MAX_TOKENS = 5000;
const GRADING_TOKEN_LADDER = [5000, 8192, 16384];
const CONNECTION_TEST_MAX_TOKENS = 4096;

export const DEFAULT_API_CONFIG = {
  baseUrl: "",
  apiKey: "",
  model: "",
};

export function loadApiConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
    return {
      baseUrl: typeof stored.baseUrl === "string" ? stored.baseUrl : "",
      apiKey: typeof stored.apiKey === "string" ? stored.apiKey : "",
      model: typeof stored.model === "string" ? stored.model : "",
    };
  } catch {
    return { ...DEFAULT_API_CONFIG };
  }
}

export function saveApiConfig(config) {
  const normalized = {
    baseUrl: String(config.baseUrl || "").trim(),
    apiKey: String(config.apiKey || "").trim(),
    model: String(config.model || "").trim(),
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

export function isApiConfigured(config) {
  return Boolean(config?.baseUrl?.trim() && config?.model?.trim());
}

export function normalizeApiEndpoint(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  if (/\/chat\/completions\/?$/i.test(value)) return value.replace(/\/+$/, "");
  return `${value.replace(/\/+$/, "")}/chat/completions`;
}

export class AIRequestError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "AIRequestError";
    this.status = options.status;
    this.detail = options.detail || "";
  }
}

function buildOutputContract(subject) {
  const translation = subject.key === "translation";
  const optimizedPlaceholder = translation ? "优化后的完整译文" : "优化后的完整作文";
  const samplePlaceholder = translation ? "完整参考译文" : "完整高分范文";
  const notePlaceholder = translation ? "参考译文中的一个完整句子" : "范文中的一个完整英文句子";
  return `【输出格式（最高优先级）】
你的整个回复必须是一个可被 JSON.parse 直接解析的 JSON 对象。第一个字符必须是 {，最后一个字符必须是 }。不要输出 Markdown 代码块、标题、表格、前言、后记或任何解释；不要写注释或尾逗号；字符串中的换行必须写成 \\n。score 必须是数字而不是字符串，并且必须出现在最外层。

【本次批改附加设定（若与上文冲突，以本段为准）】
1. 本模块为「${subject.label}」，本题满分严格为 ${subject.total} 分。输出中的 score、total、totalDeduction 均必须使用这一满分口径。
2. 必须逐句批改。若用户以图片提交作答，请先识别并转写图片中的文字，再按句子批改；若题干为图片，也请先识读题干。文本作答默认卷面整洁、无涂抹。
3. 所有试卷分析、修改理由和薄弱点使用中文；${translation ? "高分作答与参考译文使用自然、准确的中文。" : "高分表达、优化全文与范文使用英文。"}
4. “高分作答”必须针对原句给出完整可替换的表达，而不是只写词语。扣分明细要说明具体采分点或语言问题。
5. 严格使用下方模板的字段名与类型。模板本身是合法 JSON；其中的分数、句子和说明都只是占位示例，必须替换成本次作答的真实批改结果，不能原样照抄，也不要添加模板之外的顶层字段。

【JSON 模板】
{
  "score": ${subject.total - 2.5},
  "total": ${subject.total},
  "summary": "总体评价，概括得分档次与主要表现",
  "weaknesses": ["薄弱点1", "薄弱点2"],
  "sentenceRows": [
    {
      "original": "考生原句或原译文片段",
      "improved": "${translation ? "高分表达或更佳译文" : "高分表达或更佳英文句子"}",
      "reason": "为什么这样修改",
      "deduction": 0.5,
      "deductionReason": "本句扣分明细；若未扣分写明采分点已覆盖"
    }
  ],
  "totalDeduction": 2.5,
  "optimizations": [
    {
      "original": "需要优化的原句",
      "improved": "${translation ? "优化后的表达" : "优化后的英文表达"}",
      "why": "为什么这样写"
    }
  ],
  "optimizedText": "${optimizedPlaceholder}",
  "sampleEssay": "${samplePlaceholder}",
  "sampleNotes": [
    {
      "sentence": "${notePlaceholder}",
      "why": "为什么这样写，说明结构、用词或衔接上的用意"
    }
  ]
}

【再次强调】
只返回上述 JSON 对象本身，不要返回任何 JSON 之外的文字。字段不能缺失；没有内容的列表使用空数组，没有内容的文本使用空字符串。有作答时 sentenceRows 至少包含一行；sampleNotes 可以为空数组。score 必须是 0 到 ${subject.total} 之间的数字。`;
}

export function buildSystemPrompt(subject) {
  return `${subject.prompt}

${buildOutputContract(subject)}`;
}

function dataUrlContent(dataUrl) {
  return {
    type: "image_url",
    image_url: { url: dataUrl },
  };
}

export function buildUserMessage({
  subject,
  mode,
  material,
  questionImages = [],
  answerType,
  answerText = "",
  answerImages = [],
}) {
  const parts = [];
  const pushText = (text) => parts.push({ type: "text", text });
  const pushImages = (images, label) => {
    if (!images.length) return;
    pushText(label);
    images.forEach((image) => parts.push(dataUrlContent(image.dataUrl || image)));
  };

  pushText(
    `【工作模式】${mode === "true" ? "真题模式" : "模拟题模式"}。${
      mode === "true"
        ? "题目与参考材料来自系统预设题库。"
        : "题干来自用户上传的图片，请自行识读，不预设标准答案。"
    }`,
  );

  if (mode === "true" && material) {
    const blocks = [`【题干】${material.title || "真题材料"}`];
    if (material.year) blocks.push(`年份：${material.year}`);
    if (material.questionText) blocks.push(material.questionText);
    if (material.chartText) blocks.push(`【图表信息（文字版）】\n${material.chartText}`);
    pushText(blocks.join("\n"));
    if (material.referenceText) {
      pushText(
        `【内部参考材料（仅用于评分参照，不得直接照抄为考生作答）】\n${material.referenceText}`,
      );
    }
  } else {
    pushImages(questionImages, "【题干】以下是用户上传的题干图片，请先识读题目要求：");
  }

  if (answerType === "text") {
    pushText(`【考生作答（文本）】\n${answerText}`);
  } else {
    pushImages(
      answerImages,
      "【考生作答（图片）】以下是用户上传的作答图片，请先完整识读文字；本批改可按作答图片评估卷面整洁度：",
    );
  }

  pushText(
    "【输出要求】请只返回一个可被 JSON.parse 解析的 JSON 对象：第一个字符是 {，最后一个字符是 }；不要输出代码块、标题、表格或任何额外文字。必须包含数值型 score 字段，字段与系统提示中的 JSON 模板一致。",
  );

  const hasImages = parts.some((part) => part.type === "image_url");
  if (!hasImages) {
    return parts.map((part) => part.text).join("\n\n");
  }
  return parts;
}

function getHeaders(config) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}

function describeHttpError(status, detail) {
  if (status === 401 || status === 403) {
    return `AI 接口鉴权失败（${status}）。请检查 API Key 是否有效、是否有该模型权限。`;
  }
  if (status === 404) {
    return "AI 接口地址或模型不存在（404）。请检查 Endpoint 是否包含正确的 /v1 路径，以及模型名称。";
  }
  if (status === 429) {
    return "AI 接口请求过于频繁或额度不足（429）。请稍后再试，或检查账户额度。";
  }
  if (status >= 500) {
    return `AI 服务暂时不可用（${status}）。请稍后重试。${detail ? ` ${detail}` : ""}`;
  }
  return `AI 接口请求失败（${status}）。${detail || "请检查接口配置。"}`;
}

async function readErrorDetail(response) {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return "";
  }
  try {
    const data = JSON.parse(text);
    const message = data?.error?.message || data?.message || data?.error;
    if (message) return String(message).slice(0, 800);
  } catch {
    // Use the raw body below.
  }
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
}

function responseContent(data) {
  const message = data?.choices?.[0]?.message;
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        return part?.text || part?.content || "";
      })
      .join("");
  }
  return "";
}

function outputBudgets(start, escalate) {
  if (!escalate) return [start];
  const budgets = [start];
  for (const budget of GRADING_TOKEN_LADDER) {
    if (budget > budgets[budgets.length - 1]) budgets.push(budget);
  }
  return budgets;
}

function isOutputLimit(finishReason) {
  return finishReason === "length" || finishReason === "max_tokens";
}

function outputLimitError({ finishReason, tokenBudget, hasReasoning }) {
  if (isOutputLimit(finishReason)) {
    return `AI 在 ${tokenBudget} tokens 的输出上限内没有生成有效内容（length）${
      hasReasoning ? "，模型的思考过程已占满输出额度" : ""
    }。请重试；若持续出现，请换用输出上限更高的模型或非推理模型。`;
  }
  return `AI 返回了空内容${finishReason ? `（${finishReason}）` : ""}。请重试，或检查模型是否支持当前输入。`;
}

async function chatRequest(config, {
  messages,
  maxTokens = GRADING_MAX_TOKENS,
  signal,
  jsonMode = true,
  escalateOnLength = false,
}) {
  if (!isApiConfigured(config)) {
    throw new AIRequestError("尚未配置 AI 接口。请先在设置中填写 Endpoint 与模型名称。");
  }
  const endpoint = normalizeApiEndpoint(config.baseUrl);
  const controller = new AbortController();
  let timeoutFired = false;
  const timeout = setTimeout(() => {
    timeoutFired = true;
    controller.abort();
  }, REQUEST_TIMEOUT);
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      throw new DOMException("Aborted", "AbortError");
    }
    signal.addEventListener("abort", abortFromCaller, { once: true });
  }

  const budgets = outputBudgets(maxTokens, escalateOnLength);
  let budgetIndex = 0;
  let useJsonMode = jsonMode;
  let lastPartial = null;

  try {
    let lastError;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (budgetIndex >= budgets.length) break;
      const tokenBudget = budgets[budgetIndex];
      const payload = {
        model: config.model,
        messages,
        temperature: 0.2,
        max_tokens: tokenBudget,
        stream: false,
      };
      if (useJsonMode) payload.response_format = { type: "json_object" };

      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: getHeaders(config),
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          if (lastPartial) return lastPartial;
          throw new AIRequestError(
            timeoutFired
              ? "等待 AI 响应超时。可以稍后重试，或换用响应更快的模型。"
              : "请求被中止。",
          );
        }
        if (lastPartial) return lastPartial;
        throw new AIRequestError(
          "无法连接 AI 接口。请检查网络、Endpoint 地址，以及服务商是否允许浏览器跨域访问（CORS）。",
          { detail: error?.message || "" },
        );
      }

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        lastError = new AIRequestError(describeHttpError(response.status, detail), {
          status: response.status,
          detail,
        });
        const jsonModeUnsupported =
          useJsonMode && /response_format|json_object|json mode|json mode not supported/i.test(detail);
        if (jsonModeUnsupported) {
          useJsonMode = false;
          continue;
        }
        const budgetRejected =
          escalateOnLength &&
          budgetIndex > 0 &&
          /max_tokens|max_completion_tokens|maximum\s+(?:completion\s+)?tokens|too\s+(?:large|long)|exceed/i.test(detail);
        if (budgetRejected) {
          if (lastPartial) {
            lastPartial.retryRejected = true;
            return lastPartial;
          }
          throw new AIRequestError(
            `接口拒绝了 ${tokenBudget} tokens 的输出上限。请换用支持更长输出的模型，或稍后重试。${detail ? ` ${detail}` : ""}`,
            { status: response.status, detail },
          );
        }
        if (lastPartial) return lastPartial;
        throw lastError;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        if (lastPartial) return lastPartial;
        throw new AIRequestError("AI 返回了无法解析的响应。请重试或更换模型。");
      }
      const content = responseContent(data);
      const finishReason = data?.choices?.[0]?.finish_reason;
      const hitOutputLimit = isOutputLimit(finishReason);
      const result = {
        content,
        usage: data.usage || null,
        responseModel: data.model || config.model,
        finishReason,
        tokenBudget,
        truncated: hitOutputLimit,
        raw: data,
      };
      if (!content.trim()) {
        if (escalateOnLength && hitOutputLimit && budgetIndex + 1 < budgets.length) {
          budgetIndex += 1;
          useJsonMode = false;
          continue;
        }
        if (lastPartial && hitOutputLimit) return lastPartial;
        const message = data?.choices?.[0]?.message;
        const hasReasoning = Boolean(message?.reasoning_content || message?.reasoning);
        throw new AIRequestError(outputLimitError({ finishReason, tokenBudget, hasReasoning }));
      }
      if (escalateOnLength && hitOutputLimit && budgetIndex + 1 < budgets.length) {
        lastPartial = result;
        budgetIndex += 1;
        useJsonMode = false;
        continue;
      }
      return result;
    }
    if (lastPartial) return lastPartial;
    throw lastError || new AIRequestError("AI 接口请求失败。");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function parsedNeedsRepair(parsed) {
  return parsed.parsed !== true || !Number.isFinite(parsed.score) || parsed.truncated === true;
}

function parsedRichness(parsed) {
  if (parsed.parsed !== true || !Number.isFinite(parsed.score)) return -1;
  return (
    parsed.sentenceRows.length * 10 +
    parsed.optimizations.length * 2 +
    parsed.weaknesses.length +
    (parsed.summary ? 1 : 0) +
    (parsed.sampleEssay ? 1 : 0)
  );
}

export async function gradeSubmission(options) {
  const { subject, mode, material, questionImages, answerType, answerText, answerImages, config, signal } =
    options;
  const messages = [
    { role: "system", content: buildSystemPrompt(subject) },
    {
      role: "user",
      content: buildUserMessage({
        subject,
        mode,
        material,
        questionImages,
        answerType,
        answerText,
        answerImages,
      }),
    },
  ];
  const response = await chatRequest(config, {
    messages,
    maxTokens: GRADING_MAX_TOKENS,
    signal,
    jsonMode: true,
    escalateOnLength: true,
  });
  const firstParsed = parseModelOutput(response.content, subject);
  if (!response.truncated && !parsedNeedsRepair(firstParsed)) return response;
  if (response.retryRejected) return response;

  try {
    const repaired = await chatRequest(config, {
      messages: [
        ...messages,
        { role: "assistant", content: response.content },
        {
          role: "user",
          content:
            `你上一条回复无法被页面解析${response.truncated ? "或输出被截断" : ""}。请把它整理成系统提示中指定的 JSON 对象：只返回合法 JSON，不要代码块、标题、表格或解释；字段名与模板完全一致，必须包含 0 到 ${subject.total} 之间的数值型 score，并保留原有的逐句批改、总评与薄弱点信息。`,
        },
      ],
      maxTokens: Math.max(8192, Number(response.tokenBudget) || 0),
      signal,
      jsonMode: true,
      escalateOnLength: true,
    });
    const repairedParsed = parseModelOutput(repaired.content, subject);
    if (repairedParsed.parsed === true && Number.isFinite(repairedParsed.score)) {
      const repairedTruncated = repaired.truncated || repairedParsed.truncated === true;
      if (firstParsed.parsed !== true) return repaired;
      const firstRichness = parsedRichness(firstParsed);
      const repairedRichness = parsedRichness(repairedParsed);
      if (repairedRichness > firstRichness) return repaired;
      if (repairedRichness === firstRichness && !repairedTruncated) return repaired;
    }
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) throw error;
  }
  return response;
}

export async function testApiConnection(config) {
  const messages = [
    {
      role: "user",
      content: "这是一次连接测试。请只回复：连接成功",
    },
  ];
  const result = await chatRequest(config, {
    messages,
    maxTokens: CONNECTION_TEST_MAX_TOKENS,
    jsonMode: false,
    escalateOnLength: true,
  });
  return result;
}
