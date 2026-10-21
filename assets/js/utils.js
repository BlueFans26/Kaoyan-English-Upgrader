const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export const escapeAttr = escapeHTML;

export function uid(prefix = "rec") {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function roundScore(value) {
  return Math.round(Number(value) * 10) / 10;
}

export function formatScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const rounded = roundScore(n);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function averageScore(records) {
  const scored = records.filter(
    (record) => record?.score !== null && record?.score !== undefined && Number.isFinite(Number(record.score)),
  );
  if (!scored.length) return null;
  return scored.reduce((sum, record) => sum + Number(record.score), 0) / scored.length;
}

const pad = (n) => String(n).padStart(2, "0");

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatDayLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const dayKey = formatDayKey(date);
  const todayKey = formatDayKey(today);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey === todayKey) return "今天";
  if (dayKey === formatDayKey(yesterday)) return "昨天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatDayKey(value = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateHeadline(date = new Date()) {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · 星期${weekdays[date.getDay()]}`;
}

export function computeStreak(records) {
  if (!records.length) return 0;
  const days = new Set(records.map((record) => formatDayKey(record.createdAt)));
  const now = new Date();
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(formatDayKey(cursor))) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  let streak = 0;
  while (days.has(formatDayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return streak;
}

export function countThisWeek(records) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (now.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return records.filter((record) => new Date(record.createdAt) >= start).length;
}

export function countUnits(text, unit = "字") {
  if (!text) return 0;
  if (unit === "字") return text.replace(/\s+/g, "").length;
  return (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
}

export function isTouchDevice() {
  return (
    navigator.maxTouchPoints > 1 ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function truncate(value, length = 56) {
  const text = String(value || "").trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

export function whyData(value) {
  return encodeURIComponent(String(value || ""));
}

export function decodeWhy(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return "";
  }
}

export function downloadTextFile(filename, content, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取这张图片，请换一张 JPG 或 PNG 图片。"));
    image.src = url;
  });
}

export async function imageFileToData(file, options = {}) {
  if (!file) throw new Error("未选择图片。");
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("请上传图片文件（JPG、PNG 或 WebP）。");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("图片超过 25MB，请压缩后再上传。");
  }
  const { maxEdge = 1800, quality = 0.86 } = options;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("图片内容为空，无法读取。");
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理这张图片。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", quality),
      name: file.name || "photo.jpg",
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function pickProperty(object, keys) {
  if (!object || typeof object !== "object") return undefined;
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function asString(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(asString).filter(Boolean).join("；");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value).trim();
}

function asNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (value === undefined || value === null || value === "") return undefined;
  const match = String(value).replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function asStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  return asString(value)
    .split(/[\n;；]+/)
    .map((item) => item.replace(/^[-•*\d.\s]+/, "").trim())
    .filter(Boolean);
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const original = asString(
    pickProperty(row, [
      "original",
      "answer",
      "originalText",
      "studentAnswer",
      "studentSentence",
      "originalSentence",
      "sourceSentence",
      "作答",
      "原句",
      "考生译文",
      "考生原句",
    ]),
  );
  const improved = asString(
    pickProperty(row, [
      "improved",
      "improvedText",
      "highScore",
      "highScoreAnswer",
      "suggested",
      "suggestion",
      "betterVersion",
      "optimized",
      "高分作答",
      "优化表达",
      "建议表达",
    ]),
  );
  if (!original && !improved) return null;
  const deductionRaw = asNumber(
    pickProperty(row, ["deduction", "deductionScore", "penalty", "lostPoints", "扣分", "扣分值"]),
  );
  return {
    original,
    improved,
    reason: asString(
      pickProperty(row, [
        "reason",
        "why",
        "explanation",
        "comment",
        "analysis",
        "修改理由",
        "为什么这样修改",
        "解析",
        "说明",
      ]),
    ),
    deduction: deductionRaw === undefined ? 0 : Math.abs(roundScore(deductionRaw)),
    deductionReason: asString(
      pickProperty(row, [
        "deductionReason",
        "deductionDetail",
        "deductionDetails",
        "penaltyReason",
        "扣分明细",
        "扣分原因",
      ]),
    ),
  };
}

function normalizeNote(note) {
  if (!note) return null;
  if (typeof note === "string") return { sentence: note.trim(), why: "" };
  const sentence = asString(
    pickProperty(note, ["sentence", "text", "original", "sentenceText", "范文句子", "句子"]),
  );
  const why = asString(
    pickProperty(note, ["why", "reason", "explanation", "comment", "为什么这样写", "解释", "理由"]),
  );
  if (!sentence && !why) return null;
  return { sentence, why };
}

function sanitizeJsonControlChars(text) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (!inString) {
      result += char;
      if (char === '"') inString = true;
      continue;
    }
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      result += char;
      inString = false;
      continue;
    }
    if (char === "\n") {
      result += "\\n";
      continue;
    }
    if (char === "\r") {
      result += "\\r";
      continue;
    }
    if (char === "\t") {
      result += "\\t";
      continue;
    }
    if (char.charCodeAt(0) < 0x20) {
      result += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
      continue;
    }
    result += char;
  }
  return result;
}

function scanJsonPrefix(text) {
  const stack = [];
  const commas = [];
  let inString = false;
  let escaped = false;
  let stringIsKey = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      const container = stack[stack.length - 1];
      if (container === "{") {
        let previous = index - 1;
        while (previous >= 0 && /\s/.test(text[previous])) previous -= 1;
        stringIsKey = previous < 0 || text[previous] === "{" || text[previous] === ",";
      } else {
        stringIsKey = false;
      }
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }
    if (char === "}" || char === "]") {
      stack.pop();
      continue;
    }
    if (char === ",") {
      commas.push({ index, stack: [...stack] });
    }
  }

  return { stack, commas, inString, escaped, stringIsKey };
}

function closeJsonContainers(stack) {
  return stack
    .slice()
    .reverse()
    .map((type) => (type === "{" ? "}" : "]"))
    .join("");
}

function closeJsonAtEnd(source, scan) {
  let base = source;
  if (scan.inString) {
    if (scan.stringIsKey) return "";
    if (scan.escaped) {
      base = base.slice(0, -1);
    } else {
      const partialUnicode = base.match(/\\u[0-9a-fA-F]{0,3}$/);
      if (partialUnicode) base = base.slice(0, -partialUnicode.length);
    }
    base += '"';
  } else {
    base = base.trimEnd();
    if (base.endsWith(",")) base = base.slice(0, -1).trimEnd();
    if (base.endsWith(":")) return "";
  }
  if (!base) return "";
  return `${base}${closeJsonContainers(scan.stack)}`;
}

function repairTruncatedJson(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let source = text.slice(start).replace(/```[\s\S]*$/, "").trimEnd();
  if (!source) return null;
  source = sanitizeJsonControlChars(source);
  const scan = scanJsonPrefix(source);

  const closed = closeJsonAtEnd(source, scan);
  if (closed) {
    try {
      const data = JSON.parse(closed);
      if (data && typeof data === "object" && Object.keys(data).length) return data;
    } catch {
      // Try trimming back to the last complete value below.
    }
  }

  const maxAttempts = Math.min(scan.commas.length, 80);
  for (let offset = 1; offset <= maxAttempts; offset += 1) {
    const checkpoint = scan.commas[scan.commas.length - offset];
    const base = source.slice(0, checkpoint.index).trimEnd();
    if (!base || base.endsWith(":")) continue;
    try {
      const data = JSON.parse(`${base}${closeJsonContainers(checkpoint.stack)}`);
      if (data && typeof data === "object" && Object.keys(data).length) return data;
    } catch {
      // Try an earlier comma.
    }
  }
  return null;
}

function balancedObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function extractJson(raw) {
  if (typeof raw !== "string") return null;
  let text = raw.replace(/^\uFEFF/, "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  try {
    return { data: JSON.parse(text), truncated: false };
  } catch {
    // Try structured extraction and truncated-output repair below.
  }

  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1) {
    const end = balancedObjectEnd(text, firstBrace);
    if (end !== -1) {
      try {
        return { data: JSON.parse(text.slice(firstBrace, end + 1)), truncated: false };
      } catch {
        // Fall through to truncated-output repair.
      }
    }
    const salvaged = repairTruncatedJson(text.slice(firstBrace));
    if (salvaged) return { data: salvaged, truncated: true };
  }

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    const end = balancedObjectEnd(text, start);
    if (end === -1) continue;
    try {
      return { data: JSON.parse(text.slice(start, end + 1)), truncated: false };
    } catch {
      // Keep scanning for another complete object.
    }
  }
  return null;
}

function parseMarkdownTable(raw) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  if (lines.length < 2) return [];
  const cells = (line) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  const separatorIndex = lines.findIndex((line) => /^\|?[\s:|-]+\|?$/.test(line));
  if (separatorIndex < 1) return [];
  const headers = cells(lines[separatorIndex - 1]);
  const headerKey = (header) => {
    if (/作答|原句|译文/.test(header)) return "original";
    if (/高分|优化|建议/.test(header)) return "improved";
    if (/为什么|理由|解析/.test(header)) return "reason";
    if (/扣分/.test(header)) return "deductionReason";
    return "";
  };
  const keys = headers.map(headerKey);
  return lines.slice(separatorIndex + 1).map((line) => {
    const values = cells(line);
    const row = {};
    keys.forEach((key, index) => {
      if (key && values[index]) row[key] = values[index];
    });
    const normalized = normalizeRow(row);
    if (normalized && /总扣分|合计|总得分/.test(line)) return null;
    return normalized;
  }).filter(Boolean);
}

function findScoreInText(raw, total) {
  const patterns = [
    /(?:最终得分|总得分)\s*[：:]\s*(\d+(?:\.\d+)?)/,
    /["']?(?:得分|分数|score)["']?\s*[：:]\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:\/|／)\s*(?:10|15)(?!\d)/,
  ];
  for (const pattern of patterns) {
    const match = String(raw || "").match(pattern);
    if (match) return clamp(roundScore(Number(match[1])), 0, total);
  }
  return undefined;
}

function baseResult(total) {
  return {
    score: undefined,
    total,
    summary: "",
    weaknesses: [],
    sentenceRows: [],
    totalDeduction: undefined,
    optimizations: [],
    optimizedText: "",
    sampleEssay: "",
    sampleNotes: [],
  };
}

function normalizeResultObject(data, subject) {
  const result = baseResult(subject.total);
  const rawRows =
    data.sentenceRows ||
    data.sentences ||
    data.rows ||
    data["逐句批改"] ||
    data["批改明细"] ||
    [];
  result.sentenceRows = Array.isArray(rawRows) ? rawRows.map(normalizeRow).filter(Boolean) : [];
  result.summary = asString(
    pickProperty(data, ["summary", "overall", "feedback", "comment", "总体评价", "总评"]),
  );
  result.weaknesses = asStringList(
    pickProperty(data, ["weaknesses", "weakness", "problems", "薄弱点", "薄弱环节"]),
  );
  const score = asNumber(pickProperty(data, ["score", "finalScore", "最终得分", "得分"]));
  if (score !== undefined) result.score = clamp(roundScore(score), 0, subject.total);
  const deduction = asNumber(
    pickProperty(data, ["totalDeduction", "totalPenalty", "总扣分", "扣分合计"]),
  );
  if (deduction !== undefined) result.totalDeduction = clamp(Math.abs(roundScore(deduction)), 0, subject.total);

  const rawOptimizations =
    data.optimizations || data.improvements || data.replacements || data["优化区"] || data["优化建议"];
  if (Array.isArray(rawOptimizations)) {
    result.optimizations = rawOptimizations
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const original = asString(
          pickProperty(item, ["original", "before", "originalText", "原句", "原表达"]),
        );
        const improved = asString(
          pickProperty(item, ["improved", "after", "suggestion", "suggested", "优化表达", "建议表达"]),
        );
        const why = asString(
          pickProperty(item, ["why", "reason", "explanation", "为什么这样写", "理由", "解释"]),
        );
        return original || improved ? { original, improved, why } : null;
      })
      .filter(Boolean);
  }
  if (!result.optimizations.length) {
    result.optimizations = result.sentenceRows
      .filter((row) => row.improved && row.improved !== row.original)
      .map((row) => ({
        original: row.original,
        improved: row.improved,
        why: row.reason || row.deductionReason,
      }));
  }

  result.optimizedText = asString(
    pickProperty(data, ["optimizedText", "optimizedEssay", "optimized", "优化后的全文", "优化全文"]),
  );
  result.sampleEssay = asString(
    pickProperty(data, [
      "sampleEssay",
      "modelEssay",
      "referenceEssay",
      "sampleAnswer",
      "范文",
      "参考译文",
      "参考范文",
    ]),
  );
  const rawNotes =
    data.sampleNotes ||
    data.sampleEssayNotes ||
    data.essayNotes ||
    data["范文解释"] ||
    data["范文解析"] ||
    [];
  if (Array.isArray(rawNotes)) result.sampleNotes = rawNotes.map(normalizeNote).filter(Boolean);
  if (!result.sampleEssay && result.sampleNotes.length) {
    result.sampleEssay = result.sampleNotes.map((note) => note.sentence).join(" ");
  }

  if (result.score === undefined && result.totalDeduction !== undefined) {
    result.score = clamp(roundScore(subject.total - result.totalDeduction), 0, subject.total);
  }
  if (result.totalDeduction === undefined) {
    const summed = result.sentenceRows.reduce((sum, row) => sum + Number(row.deduction || 0), 0);
    result.totalDeduction =
      summed > 0
        ? clamp(roundScore(summed), 0, subject.total)
        : result.score !== undefined
          ? clamp(roundScore(subject.total - result.score), 0, subject.total)
          : undefined;
  }
  return result;
}

export function parseModelOutput(raw, subject, options = {}) {
  const extracted = extractJson(raw);
  const data = extracted?.data;
  const truncated = options.truncated === true || extracted?.truncated === true;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const payload = data.result || data.grading || data.data || data;
    const normalized = normalizeResultObject(payload, subject);
    if (normalized.score !== undefined) {
      return { ...normalized, parsed: true, truncated, raw: String(raw || "") };
    }
  }

  const rows = parseMarkdownTable(raw);
  const score = findScoreInText(raw, subject.total);
  const deductionMatch = String(raw || "").match(
    /(?:总扣分|扣分合计|共扣|["']?totalDeduction["']?)\s*[：:]?\s*(\d+(?:\.\d+)?)/i,
  );
  const totalDeduction = deductionMatch
    ? clamp(roundScore(Number(deductionMatch[1])), 0, subject.total)
    : undefined;
  const resolvedScore =
    score !== undefined
      ? score
      : totalDeduction !== undefined
        ? clamp(roundScore(subject.total - totalDeduction), 0, subject.total)
        : undefined;
  return {
    ...baseResult(subject.total),
    score: resolvedScore,
    sentenceRows: rows,
    totalDeduction:
      totalDeduction ??
      (resolvedScore !== undefined ? clamp(roundScore(subject.total - resolvedScore), 0, subject.total) : undefined),
    parsed: false,
    truncated,
    raw: String(raw || ""),
  };
}

export function createPendingRecord() {
  return {
    version: 1,
    id: uid("record"),
    createdAt: new Date().toISOString(),
  };
}
