import { getPaperState, savePaperState } from "../db.js";
import {
  examSubjectMeta,
  loadPaper,
  loadPaperManifest,
  normalizeExamSubject,
  papersForSubject,
} from "../papers.js";
import { escapeHTML, formatScore, truncate } from "../utils.js";
import { confirmDialog, icon, toast } from "../ui.js";

const PAPER_TITLE = "客观题真题";
const HIGHLIGHT_COLORS = [
  { key: "yellow", label: "黄色", value: "rgba(238, 197, 73, 0.36)" },
  { key: "green", label: "绿色", value: "rgba(111, 181, 121, 0.32)" },
  { key: "pink", label: "粉色", value: "rgba(232, 137, 155, 0.3)" },
  { key: "blue", label: "蓝色", value: "rgba(105, 163, 214, 0.3)" },
];
const DEFAULT_HIGHLIGHT_COLOR = HIGHLIGHT_COLORS[0].key;
const HIGHLIGHT_WIDTH_RATIO = 0.016;
const PARTB_SUGGESTIONS = {
  heading_matching: "先用一句话概括段落主旨，再匹配小标题，避免只抓重复词。",
  gap_fill: "关注空格前后的指代、复现和转折关系，保持段落连贯。",
  ordering: "利用指代词、逻辑连接词与时间线确定段落先后。",
  matching: "核对人物观点与选项的同义改写，排除范围过大或偷换概念。",
  true_false: "回到原文核对绝对化表述、未提及信息与因果倒置。",
};

function normalizePaperState(raw, id) {
  return {
    id,
    answers: raw && typeof raw.answers === "object" && raw.answers ? raw.answers : {},
    submitted:
      raw && typeof raw.submitted === "object" && raw.submitted ? raw.submitted : {},
    highlights:
      raw && typeof raw.highlights === "object" && raw.highlights
        ? raw.highlights
        : {},
    updatedAt: raw?.updatedAt || null,
  };
}

function loadingMarkup() {
  return `<div class="page paper-page">
    <div class="page-loading">
      <span class="loading-orbit"></span>
      <p>正在整理客观题真题…</p>
    </div>
  </div>`;
}

function errorMarkup(error) {
  return `<div class="page paper-page">
    <div class="fatal-state">
      <span>${icon("alert", 28)}</span>
      <h1>真题加载失败</h1>
      <p>${escapeHTML(error?.message || "无法读取客观题数据文件。")}</p>
      <button type="button" class="btn btn-primary" data-papers-retry>重新加载</button>
    </div>
  </div>`;
}

function paperUrl(id, viewMode = "practice", sectionKey = "cloze") {
  if (viewMode === "result") return `#/papers?paper=${encodeURIComponent(id)}&view=result`;
  return `#/papers?paper=${encodeURIComponent(id)}&section=${encodeURIComponent(sectionKey)}`;
}

function partTitle(part) {
  if (part.kind === "cloze") return "完型填空";
  if (part.kind === "reading") return part.title || part.label;
  return `Part B · ${part.partLabel}`;
}

function partEyebrow(part) {
  if (part.kind === "cloze") return "USE OF ENGLISH";
  if (part.kind === "reading") return "READING COMPREHENSION";
  return `PART B · ${String(part.partType || "").replace(/_/g, " ").toUpperCase()}`;
}

function partDescription(part) {
  if (part.kind === "cloze") {
    return "阅读短文，从每题 A–D 中选出最合适的词或短语。每题 0.5 分，共 10 分；提交本板块后统一批改。";
  }
  if (part.kind === "reading") {
    return `阅读 ${part.title || part.label}，完成 5 道选择题。每题 2 分，共 10 分；提交本板块后统一批改。`;
  }
  switch (part.partType) {
    case "heading_matching":
      return "阅读短文，为第 41–45 段选择最合适的小标题。每题 2 分，共 10 分；提交本板块后统一批改。";
    case "gap_fill":
      return "从选项中选出适合第 41–45 空的句子，使短文连贯完整。每题 2 分，共 10 分。";
    case "ordering":
      return "根据文章逻辑，把备选段落排入第 41–45 题的位置；已给段落固定不动。每题 2 分，共 10 分。";
    case "true_false":
      return "判断第 41–45 句是否与原文一致。每题 2 分，共 10 分；提交本板块后统一批改。";
    default:
      return "阅读材料，将第 41–45 题与选项逐一匹配。每题 2 分，共 10 分；提交本板块后统一批改。";
  }
}

function blankLabel(part) {
  if (part.partType === "heading_matching") return "段";
  if (part.partType === "gap_fill") return "空";
  return "题";
}

function splitStem(stem) {
  const text = String(stem || "").trim();
  if (!text) return { name: "", body: "" };
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines[0].length <= 48) {
    return { name: lines[0], body: lines.slice(1).join("\n") };
  }
  return { name: "", body: lines.join(" ") };
}

function getPartOrderLetters(part) {
  return new Set(
    (part.order || []).filter((slot) => slot.kind === "given").map((slot) => slot.letter),
  );
}

function getOrderSequence(part) {
  return (part.order || []).map((slot) => {
    if (slot.kind === "given") return slot.letter;
    return part.questions.find((question) => question.number === slot.number)?.answer || "";
  });
}

function optionText(part, letter) {
  if (part.options?.[letter]) return part.options[letter];
  if (letter === "T") return "正确";
  if (letter === "F") return "错误";
  return "";
}

function scoreClass(score, max) {
  if (!max) return "";
  const ratio = score / max;
  if (ratio >= 0.8) return "is-strong";
  if (ratio >= 0.6) return "is-steady";
  return "is-weak";
}

export function renderPapers(container, app, params = {}) {
  const controller = new AbortController();
  let disposed = false;
  let manifest = null;
  let paper = null;
  let meta = null;
  let paperState = null;
  let subjectKey = normalizeExamSubject(app.state.examSubject);
  let selectedPartKey = "cloze";
  let viewMode = params.view === "result" ? "result" : "practice";
  let saveChain = Promise.resolve();
  let saveErrorShown = false;
  let highlightCleanup = null;

  function getPart() {
    return paper?.parts.find((part) => part.key === selectedPartKey) || paper?.parts[0] || null;
  }

  function answerMap(part, create = false) {
    if (!paperState.answers[part.key] && create) paperState.answers[part.key] = {};
    return paperState.answers[part.key] || {};
  }

  function selectedAnswer(part, number) {
    return answerMap(part)[number] || "";
  }

  function isSubmitted(part) {
    return Boolean(part && paperState.submitted[part.key]);
  }

  function partStats(part) {
    const answers = answerMap(part);
    const answered = part.questions.filter((question) => answers[question.number]).length;
    const submitted = isSubmitted(part);
    let correct = 0;
    let score = 0;
    if (submitted) {
      for (const question of part.questions) {
        if (answers[question.number] === question.answer) {
          correct += 1;
          score += Number(question.score) || 0;
        }
      }
    }
    return {
      part,
      answered,
      correct,
      submitted,
      score,
      maxScore: Number(part.maxScore) || 0,
      unanswered: part.questions.length - answered,
      accuracy: submitted && part.questions.length ? (correct / part.questions.length) * 100 : null,
    };
  }

  function paperSummary() {
    const stats = (paper?.parts || []).map(partStats);
    const submittedStats = stats.filter((entry) => entry.submitted);
    const score = submittedStats.reduce((sum, entry) => sum + entry.score, 0);
    const maxScore = submittedStats.reduce((sum, entry) => sum + entry.maxScore, 0);
    const correct = submittedStats.reduce((sum, entry) => sum + entry.correct, 0);
    const answered = stats.reduce((sum, entry) => sum + entry.answered, 0);
    const questionCount = stats.reduce((sum, entry) => sum + entry.part.questions.length, 0);
    const submittedQuestions = submittedStats.reduce(
      (sum, entry) => sum + entry.part.questions.length,
      0,
    );
    return {
      stats,
      submittedStats,
      submittedCount: submittedStats.length,
      allSubmitted: stats.length > 0 && submittedStats.length === stats.length,
      score,
      maxScore,
      correct,
      answered,
      questionCount,
      submittedQuestions,
      unanswered: questionCount - answered,
      percent: maxScore ? Math.round((score / maxScore) * 100) : 0,
    };
  }

  function persist() {
    if (!paperState) return Promise.resolve();
    paperState.updatedAt = new Date().toISOString();
    const snapshot = {
      ...paperState,
      answers: JSON.parse(JSON.stringify(paperState.answers)),
      submitted: { ...paperState.submitted },
      highlights: JSON.parse(JSON.stringify(paperState.highlights)),
    };
    saveChain = saveChain
      .catch(() => {})
      .then(() => savePaperState(snapshot))
      .then(() => {
        saveErrorShown = false;
      })
      .catch((error) => {
        if (!saveErrorShown) {
          saveErrorShown = true;
          toast(error?.message || "作答保存失败，请检查浏览器存储。", "error");
        }
      });
    return saveChain;
  }

  function setAnswer(part, number, value) {
    if (isSubmitted(part)) return;
    const answers = answerMap(part, true);
    if (!value) delete answers[number];
    else answers[number] = value;
    persist();
  }

  function currentSection() {
    return getPart();
  }

  function navigatePaper(id, mode = "practice", sectionKey = selectedPartKey) {
    const next = paperUrl(id, mode, sectionKey);
    if (location.hash === next) {
      init();
    } else {
      location.hash = next;
    }
  }

  function activePracticeSection() {
    return (
      paper?.parts.find((part) => Object.keys(answerMap(part)).length)?.key ||
      "cloze"
    );
  }

  function renderShell(content, { showTabs = true } = {}) {
    const subject = examSubjectMeta(subjectKey);
    const summary = paperSummary();
    const resultHref = paperUrl(paper.id, "result");
    const papers = papersForSubject(manifest, subjectKey);
    const yearOptions = papers
      .map(
        (entry) =>
          `<option value="${entry.id}" ${entry.id === paper.id ? "selected" : ""}>${entry.year} 年 · ${escapeHTML(entry.subject)}</option>`,
      )
      .join("");
    const tabs = showTabs
      ? `<nav class="paper-part-tabs" aria-label="题型">
          ${paper.parts
            .map((part) => {
              const stats = partStats(part);
              const active = viewMode === "practice" && part.key === selectedPartKey;
              const metaCopy = stats.submitted
                ? `${formatScore(stats.score)}/${formatScore(stats.maxScore)} · 已提交`
                : stats.answered
                  ? `已答 ${stats.answered}/${part.questions.length}`
                  : part.kind === "partb"
                    ? part.partLabel
                    : "未作答";
              return `<button type="button" class="paper-part-tab ${active ? "is-active" : ""} ${stats.submitted ? "is-submitted" : ""}" data-paper-section="${part.key}" aria-pressed="${active}">
                <span class="paper-part-tab-label">${escapeHTML(part.label)}</span>
                <small>${escapeHTML(metaCopy)}</small>
              </button>`;
            })
            .join("")}
        </nav>`
      : "";
    container.innerHTML = `<div class="page paper-page">
      <header class="page-head paper-page-head">
        <div class="page-head-copy">
          <span class="eyebrow">OBJECTIVE PAPERS · ${escapeHTML(subject.name)}</span>
          <div class="title-with-badge">
            <h1>${PAPER_TITLE}</h1>
            <span class="total-badge">客观题 60 分</span>
          </div>
          <p>${escapeHTML(subject.name)} · 2010–2025 · 每套 45 题 · 作答、批改与勾画保存在本机</p>
        </div>
        <div class="page-head-actions">
          <a class="btn btn-ghost btn-small" href="#/overview">${icon("arrowLeft", 15)} 学习总览</a>
          <button type="button" class="btn btn-soft btn-small" data-open-settings>${icon("settings", 15)} 科目设置</button>
        </div>
      </header>

      <section class="paper-toolbar">
        <label class="paper-year-field">
          <span>考试年份</span>
          <span class="paper-year-select">
            <select class="select" data-paper-year aria-label="选择考试年份">${yearOptions}</select>
            ${icon("chevronDown", 15)}
          </span>
        </label>
        <div class="paper-toolbar-meta">
          <span class="paper-subject-pill">${escapeHTML(subject.label)}</span>
          <span>${escapeHTML(meta.partBLabel)}</span>
          <span>${meta.questionCount} 题 · 60 分</span>
          <span class="paper-save-state">${summary.allSubmitted ? "整卷已提交" : summary.submittedCount ? `已提交 ${summary.submittedCount}/6 个板块` : "自动保存进度"}</span>
        </div>
        <a class="btn ${viewMode === "result" ? "btn-primary" : "btn-soft"} btn-small" href="${resultHref}" data-paper-result-link>${icon("chart", 15)} 结果页</a>
      </section>

      ${tabs}
      <div class="paper-body">${content}</div>
    </div>`;
    document.title = `${paper.year} 年 ${subject.name} ${PAPER_TITLE} · 考研英语综合备考站`;
  }

  function resultBanner(part) {
    const stats = partStats(part);
    if (!stats.submitted) return "";
    return `<section class="paper-result-banner ${scoreClass(stats.score, stats.maxScore)}">
      <div class="paper-result-banner-icon">${icon("checkCircle", 22)}</div>
      <div class="paper-result-banner-copy">
        <strong>本板块已提交 · ${formatScore(stats.score)} / ${formatScore(stats.maxScore)} 分</strong>
        <p>答对 ${stats.correct} / ${part.questions.length} 题${stats.correct < part.questions.length ? `，答错或未答 ${part.questions.length - stats.correct} 题` : "，全部答对"}。下方已标出正确答案与每题小分。</p>
      </div>
      <div class="paper-result-banner-actions">
        <a class="btn btn-soft btn-small" href="${paperUrl(paper.id, "result")}" data-paper-result-link>查看结果页</a>
        <button type="button" class="btn btn-ghost btn-small" data-retry-part>重做本板块</button>
      </div>
    </section>`;
  }

  function highlightToolbar(part) {
    const strokes = Array.isArray(paperState.highlights[part.key])
      ? paperState.highlights[part.key]
      : [];
    return `<div class="paper-highlight-tools" data-highlight-tools>
      <button type="button" class="paper-hl-toggle" data-highlight-toggle aria-pressed="false" title="开启后可拖动勾画">
        ${icon("pen", 15)}<span>荧光笔</span>
      </button>
      <div class="paper-hl-colors" role="group" aria-label="荧光笔颜色">
        ${HIGHLIGHT_COLORS.map(
          (color) =>
            `<button type="button" class="paper-hl-color ${color.key === DEFAULT_HIGHLIGHT_COLOR ? "is-active" : ""}" data-highlight-color="${color.key}" style="--hl-color:${color.value}" aria-label="${color.label}荧光笔" title="${color.label}"></button>`,
        ).join("")}
      </div>
      <button type="button" class="paper-hl-tool" data-highlight-eraser aria-pressed="false" aria-label="橡皮擦" title="橡皮擦">${icon("eraser", 15)}</button>
      <button type="button" class="paper-hl-tool" data-highlight-undo aria-label="撤销上一笔" title="撤销">${icon("arrowLeft", 15)}</button>
      <button type="button" class="paper-hl-tool" data-highlight-clear aria-label="清空勾画" title="清空">${icon("trash", 15)}</button>
      <span class="paper-hl-status" data-highlight-status>${strokes.length ? `${strokes.length} 笔勾画` : "勾画会保存在本机"}</span>
    </div>`;
  }

  function textSurfaceMarkup(part) {
    if (!part) return "";
    const hasPassage = Array.isArray(part.passage) && part.passage.length;
    const noPassage = !hasPassage && part.options;
    const isOrdering = part.kind === "partb" && part.partType === "ordering";
    const label = isOrdering ? "备选段落" : noPassage ? "发言摘录" : "阅读材料";
    let body = "";
    if (isOrdering) {
      const given = getPartOrderLetters(part);
      body = `<div class="paper-bank paper-bank-in-passage">
        ${Object.entries(part.options || {})
          .map(
            ([letter, text]) => `<div class="paper-bank-item">
              <span class="paper-bank-letter">${letter}</span>
              <p>${escapeHTML(text)}</p>
              ${given.has(letter) ? `<span class="paper-bank-given">已给出</span>` : ""}
            </div>`,
          )
          .join("")}
      </div>`;
    } else if (noPassage) {
      body = `<div class="paper-source-list">
        ${part.questions
          .filter((question) => question.stem)
          .map((question) => {
            const { name, body: comment } = splitStem(question.stem);
            return `<article class="paper-source-item" id="paper-source-${question.number}">
              <span class="paper-source-index">${question.number}</span>
              <div>
                ${name ? `<strong class="paper-source-name">${escapeHTML(name)}</strong>` : ""}
                <p>${escapeHTML(comment)}</p>
              </div>
            </article>`;
          })
          .join("")}
        ${
          part.questions.some((question) => !question.stem)
            ? `<p class="paper-source-gap">${icon("info", 14)} 数据源未收录第 ${part.questions
                .filter((question) => !question.stem)
                .map((question) => question.number)
                .join("、")} 题的题干，可结合选项与上下文作答。</p>`
            : ""
        }
      </div>`;
    } else {
      body = (part.passage || [])
        .map((paragraph) => {
          const exactBlank = paragraph.match(/^\{\{(\d+)\}\}$/);
          if (exactBlank) {
            return blankSlotMarkup(part, Number(exactBlank[1]));
          }
          return `<p class="paper-paragraph">${inlineBlanksMarkup(part, paragraph)}</p>`;
        })
        .join("");
    }
    return `<section class="paper-text-column">
      <div class="paper-text-card" data-highlight-shell>
        <header class="paper-text-head">
          <span class="paper-text-label">${icon("bookOpen", 14)} ${label}</span>
          ${highlightToolbar(part)}
        </header>
        <div class="paper-passage-scroll" data-paper-passage-scroll>
          <div class="paper-passage" data-paper-passage>
            ${body}
            <canvas class="paper-highlight-canvas" data-highlight-canvas aria-hidden="true"></canvas>
          </div>
        </div>
        <p class="paper-highlight-hint" data-highlight-hint>${icon("info", 13)} 开启荧光笔后拖动勾画；关闭后可正常选词、点击空格。</p>
      </div>
    </section>`;
  }

  function inlineBlanksMarkup(part, text) {
    return escapeHTML(text).replace(/\{\{(\d+)\}\}/g, (_, number) =>
      blankMarkerMarkup(part, Number(number), true),
    );
  }

  function blankMarkerMarkup(part, number, inline) {
    const selected = selectedAnswer(part, number);
    const question = part.questions.find((entry) => entry.number === number);
    const submitted = isSubmitted(part);
    const isCorrect = submitted && question && selected === question.answer;
    const isWrong = submitted && (!selected || (question && selected !== question.answer));
    const classes = [
      "paper-inline-blank",
      inline ? "is-inline" : "is-slot",
      selected ? "is-answered" : "",
      submitted ? (isCorrect ? "is-correct" : "is-wrong") : "",
    ]
      .filter(Boolean)
      .join(" ");
    const selectedCopy = selected
      ? inline
        ? `<strong>${escapeHTML(selected)}</strong>`
        : `<span class="paper-slot-answer">${escapeHTML(selected)}</span>`
      : `<span class="paper-slot-empty">选择${part.partType === "heading_matching" ? "小标题" : "答案"}</span>`;
    return `<button type="button" class="${classes}" data-jump-question="${number}" data-inline-number="${number}" aria-label="第 ${number} 题${selected ? `，已选 ${selected}` : "，未作答"}">
      <span class="paper-inline-number">${number}</span>
      ${selectedCopy}
    </button>`;
  }

  function blankSlotMarkup(part, number) {
    const selected = selectedAnswer(part, number);
    const question = part.questions.find((entry) => entry.number === number);
    const submitted = isSubmitted(part);
    const isCorrect = submitted && question && selected === question.answer;
    const isWrong = submitted && (!selected || (question && selected !== question.answer));
    const selectedText = selected ? optionText(part, selected) : "";
    return `<div class="paper-blank-slot ${selected ? "is-answered" : ""} ${submitted ? (isCorrect ? "is-correct" : "is-wrong") : ""}" data-inline-number="${number}">
      <button type="button" class="paper-blank-slot-main" data-jump-question="${number}" aria-label="第 ${number} 题${selected ? `，已选 ${selected}` : "，未作答"}">
        <span class="paper-blank-slot-number">${number}</span>
        <span class="paper-blank-slot-copy">
          <strong>${selected ? `${escapeHTML(selected)} · ${escapeHTML(truncate(selectedText, 68))}` : `第 ${number} ${blankLabel(part)} · 选择答案`}</strong>
          <small>${submitted ? (isCorrect ? "答对" : "答错，查看下方正确答案") : "点击跳转到答题区"}</small>
        </span>
      </button>
    </div>`;
  }

  function choiceOptions(part, question) {
    if (part.partType === "true_false") {
      return [
        ["T", "正确"],
        ["F", "错误"],
      ];
    }
    return Object.entries(question.options || {});
  }

  function questionFeedback(part, question) {
    if (!isSubmitted(part)) return "";
    const selected = selectedAnswer(part, question.number);
    if (selected === question.answer) {
      return `<p class="paper-question-feedback is-correct">${icon("checkCircle", 14)} 答对 · +${formatScore(question.score)} 分</p>`;
    }
    return `<p class="paper-question-feedback is-wrong">${icon("alert", 14)} ${selected ? "答错" : "未作答"} · 0 / ${formatScore(question.score)} 分 · 正确答案 <strong>${escapeHTML(question.answer)}</strong></p>`;
  }

  function choiceQuestionMarkup(part, question, index) {
    const selected = selectedAnswer(part, question.number);
    const submitted = isSubmitted(part);
    const options = choiceOptions(part, question);
    const optionMarkup = options
      .map(([letter, text]) => {
        const isCorrect = submitted && letter === question.answer;
        const isWrong = submitted && letter === selected && selected !== question.answer;
        const classes = [
          "paper-option",
          selected === letter && !submitted ? "is-selected" : "",
          isCorrect ? "is-correct" : "",
          isWrong ? "is-wrong" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<button type="button" class="${classes}" data-paper-answer="${escapeHTML(letter)}" data-question-number="${question.number}" aria-pressed="${selected === letter}" ${submitted ? "disabled" : ""}>
          <span class="paper-option-key">${escapeHTML(letter)}</span>
          <span class="paper-option-text">${escapeHTML(text)}</span>
          ${isCorrect ? `<span class="paper-option-mark">正确答案</span>` : ""}
        </button>`;
      })
      .join("");
    const stem = question.stem
      ? `<p class="paper-question-stem">${escapeHTML(question.stem)}</p>`
      : `<p class="paper-question-stem is-muted">第 ${question.number} 题 · 选择最合适的选项</p>`;
    return `<article class="paper-question" data-question-row="${question.number}" id="paper-q-${question.number}">
      <header class="paper-question-head">
        <span class="paper-q-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="paper-q-origin">第 ${question.number} 题</span>
        <span class="paper-q-score">${formatScore(question.score)} 分</span>
      </header>
      ${stem}
      <div class="paper-options" role="group" aria-label="第 ${question.number} 题选项">${optionMarkup}</div>
      ${questionFeedback(part, question)}
    </article>`;
  }

  function optionsBankMarkup(part, { compact = false } = {}) {
    if (!part.options) return "";
    return `<section class="paper-options-bank ${compact ? "is-compact" : ""}">
      <div class="paper-options-bank-head"><span>备选选项</span><small>选项不可重复使用</small></div>
      <ul>
        ${Object.entries(part.options)
          .map(
            ([letter, text]) => `<li>
              <span class="paper-bank-letter">${escapeHTML(letter)}</span>
              <p>${escapeHTML(text)}</p>
            </li>`,
          )
          .join("")}
      </ul>
    </section>`;
  }

  function readOnlyQuestionLabel(part, question) {
    if (part.partType === "heading_matching") return `第 ${question.number} 段`;
    if (part.partType === "gap_fill") return `第 ${question.number} 空`;
    const { name } = splitStem(question.stem);
    if (name) return name;
    return `第 ${question.number} 题`;
  }

  function selectQuestionMarkup(part, question) {
    const selected = selectedAnswer(part, question.number);
    const submitted = isSubmitted(part);
    const label = readOnlyQuestionLabel(part, question);
    const stem =
      question.stem && !splitStem(question.stem).name
        ? `<p class="paper-partb-stem">${escapeHTML(question.stem)}</p>`
        : "";
    const missingStem =
      !question.stem && part.partType === "matching" && !part.passage?.length;
    const isCorrect = submitted && selected === question.answer;
    return `<div class="paper-partb-row" data-question-row="${question.number}" id="paper-q-${question.number}">
      <span class="paper-q-number">${question.number}</span>
      <div class="paper-partb-row-main">
        <label class="paper-partb-label" for="paper-select-${question.number}">${escapeHTML(label)}</label>
        ${stem}
        <div class="paper-select-wrap">
          <select class="select paper-select" id="paper-select-${question.number}" data-paper-select data-question-number="${question.number}" ${submitted ? "disabled" : ""} aria-label="第 ${question.number} 题答案">
            <option value="">未选择</option>
            ${Object.entries(part.options || {})
              .map(
                ([letter, text]) => `<option value="${escapeHTML(letter)}" ${selected === letter ? "selected" : ""}>${escapeHTML(letter)} · ${escapeHTML(truncate(text, 58))}</option>`,
              )
              .join("")}
          </select>
          ${icon("chevronDown", 15)}
        </div>
        ${
          missingStem
            ? `<p class="paper-partb-missing">${icon("alert", 13)} 数据源未收录本题题干，请结合其余发言与选项作答。</p>`
            : ""
        }
        ${questionFeedback(part, question)}
      </div>
      ${submitted ? `<span class="paper-row-status ${isCorrect ? "is-correct" : "is-wrong"}">${isCorrect ? "✓" : "✕"}</span>` : ""}
    </div>`;
  }

  function sharedSelectAnswerMarkup(part) {
    return `<section class="paper-answer-card">
      <header class="paper-answer-head">
        <div>
          <span class="eyebrow">ANSWER SHEET</span>
          <h3>答题区</h3>
          <p data-answer-progress>已答 ${part.questions.filter((question) => selectedAnswer(part, question.number)).length} / ${part.questions.length}</p>
        </div>
        <span class="paper-answer-hint">${isSubmitted(part) ? "已提交，答案已锁定" : "选择后自动保存"}</span>
      </header>
      ${part.partType !== "true_false" && part.options ? optionsBankMarkup(part) : ""}
      <div class="paper-partb-list">
        ${part.questions.map((question) => selectQuestionMarkup(part, question)).join("")}
      </div>
      <p class="paper-answer-note">${icon("info", 14)} 每个选项只能使用一次；切换年份或刷新页面后作答仍会保留。</p>
    </section>`;
  }

  function trueFalseAnswerMarkup(part) {
    return `<section class="paper-answer-card">
      <header class="paper-answer-head">
        <div>
          <span class="eyebrow">ANSWER SHEET</span>
          <h3>判断正误</h3>
          <p data-answer-progress>已答 ${part.questions.filter((question) => selectedAnswer(part, question.number)).length} / ${part.questions.length}</p>
        </div>
        <span class="paper-answer-hint">${isSubmitted(part) ? "已提交，答案已锁定" : "选择后自动保存"}</span>
      </header>
      <div class="paper-question-list">
        ${part.questions
          .map((question, index) => choiceQuestionMarkup(part, question, index))
          .join("")}
      </div>
    </section>`;
  }

  function orderingAnswerMarkup(part) {
    const given = getPartOrderLetters(part);
    const answers = answerMap(part);
    const submitted = isSubmitted(part);
    const sequence = getOrderSequence(part).join(" · ");
    return `<section class="paper-answer-card">
      <header class="paper-answer-head">
        <div>
          <span class="eyebrow">SEQUENCE BUILDER</span>
          <h3>段落排序</h3>
          <p data-answer-progress>已答 ${part.questions.filter((question) => answers[question.number]).length} / ${part.questions.length}</p>
        </div>
        <span class="paper-answer-hint">${submitted ? "已提交，答案已锁定" : "已给段落固定，其余选项不可重复"}</span>
      </header>
      <div class="paper-order-list">
        ${(part.order || [])
          .map((slot) => {
            if (slot.kind === "given") {
              const text = part.options?.[slot.letter] || "";
              return `<div class="paper-order-item is-given">
                <span class="paper-order-marker">已给</span>
                <div class="paper-order-item-body">
                  <span class="paper-order-letter">${escapeHTML(slot.letter)}</span>
                  <p>${escapeHTML(truncate(text, 180))}</p>
                </div>
              </div>`;
            }
            const selected = answers[slot.number] || "";
            const question = part.questions.find((entry) => entry.number === slot.number);
            const isCorrect = submitted && question && selected === question.answer;
            const selectedText = selected ? optionText(part, selected) : "";
            return `<div class="paper-order-item" data-question-row="${slot.number}" id="paper-q-${slot.number}">
              <span class="paper-order-marker">${slot.number}</span>
              <div class="paper-order-item-body">
                <div class="paper-select-wrap">
                  <select class="select paper-select" data-paper-select data-question-number="${slot.number}" ${submitted ? "disabled" : ""} aria-label="第 ${slot.number} 题答案">
                    <option value="">选择段落</option>
                    ${Object.keys(part.options || {})
                      .map(
                        (letter) =>
                          `<option value="${escapeHTML(letter)}" ${selected === letter ? "selected" : ""} ${given.has(letter) ? "disabled" : ""}>${escapeHTML(letter)}</option>`,
                      )
                      .join("")}
                  </select>
                  ${icon("chevronDown", 15)}
                </div>
                <p class="paper-order-preview" data-order-preview="${slot.number}">${selected ? `${escapeHTML(selected)} · ${escapeHTML(truncate(selectedText, 130))}` : "尚未选择段落"}</p>
                ${questionFeedback(part, question)}
              </div>
              ${submitted ? `<span class="paper-row-status ${isCorrect ? "is-correct" : "is-wrong"}">${isCorrect ? "✓" : "✕"}</span>` : ""}
            </div>`;
          })
          .join("")}
      </div>
      ${
        submitted
          ? `<div class="paper-order-correct">${icon("checkCircle", 15)} 正确顺序：<strong>${sequence}</strong></div>`
          : ""
      }
      <p class="paper-answer-note">${icon("info", 14)} 利用指代词、逻辑连接词与时间线判断先后；已给段落不能选择。</p>
    </section>`;
  }

  function renderPartPractice(part) {
    const submitted = isSubmitted(part);
    const stats = partStats(part);
    const isPartB = part.kind === "partb";
    let answerMarkup = "";
    if (part.kind === "cloze" || part.kind === "reading") {
      answerMarkup = `<section class="paper-answer-card">
        <header class="paper-answer-head">
          <div>
            <span class="eyebrow">ANSWER SHEET</span>
            <h3>答题区</h3>
            <p data-answer-progress>已答 ${stats.answered} / ${part.questions.length}</p>
          </div>
          <span class="paper-answer-hint">${submitted ? "已提交，答案已锁定" : "选择后自动保存"}</span>
        </header>
        <div class="paper-question-list">
          ${part.questions.map((question, index) => choiceQuestionMarkup(part, question, index)).join("")}
        </div>
      </section>`;
    } else if (part.partType === "true_false") {
      answerMarkup = trueFalseAnswerMarkup(part);
    } else if (part.partType === "ordering") {
      answerMarkup = orderingAnswerMarkup(part);
    } else {
      answerMarkup = sharedSelectAnswerMarkup(part);
    }
    return `<section class="paper-part-head">
      <div class="paper-part-head-copy">
        <span class="eyebrow">${partEyebrow(part)}</span>
        <div class="paper-part-title-row">
          <h2>${escapeHTML(partTitle(part))}</h2>
          <span class="paper-part-points">${formatScore(part.maxScore)} 分</span>
        </div>
        <p>${escapeHTML(partDescription(part))}</p>
      </div>
      <div class="paper-part-head-actions">
        <span class="paper-part-progress" data-part-progress>${submitted ? `已提交 · ${formatScore(stats.score)}/${formatScore(stats.maxScore)}` : `已答 ${stats.answered}/${part.questions.length} 题`}</span>
        ${
          submitted
            ? `<button type="button" class="btn btn-ghost btn-small" data-retry-part>重做本板块</button>`
            : `<button type="button" class="btn btn-primary btn-small" data-submit-part>提交本板块并批改</button>`
        }
      </div>
    </section>
    ${resultBanner(part)}
    <div class="paper-workspace">
      ${textSurfaceMarkup(part)}
      <div class="paper-answer-column">
        ${answerMarkup}
        <div class="paper-section-actions">
          ${
            submitted
              ? `<span class="paper-section-submitted">${icon("checkCircle", 15)} 本板块已批改</span>`
              : `<button type="button" class="btn btn-primary" data-submit-part>${icon("check", 15)} 提交本板块并批改</button>`
          }
          <span class="paper-section-save-note">${icon("database", 14)} 作答保存在本机浏览器</span>
        </div>
        ${
          isPartB
            ? `<section class="paper-submit-panel">
                <div>
                  <span class="eyebrow">FULL PAPER</span>
                  <h3>${submitted || paperSummary().allSubmitted ? "查看整卷结果" : "完成客观题作答"}</h3>
                  <p>${paperSummary().allSubmitted ? "六个板块均已提交，可查看总分、各题小分与薄弱环节。" : "整卷提交会一次性批改完型、Text 1–4 与 Part B，并生成结果页。"}</p>
                </div>
                ${
                  paperSummary().allSubmitted
                    ? `<a class="btn btn-primary" href="${paperUrl(paper.id, "result")}" data-paper-result-link>${icon("chart", 15)} 查看整卷结果</a>`
                    : `<button type="button" class="btn btn-accent" data-submit-paper>${icon("check", 15)} 提交整卷并批改</button>`
                }
              </section>`
            : ""
        }
      </div>
    </div>`;
  }

  function weaknessList(summary) {
    const candidates = summary.submittedStats
      .map((stats) => {
        const suggestion =
          stats.part.kind === "partb"
            ? PARTB_SUGGESTIONS[stats.part.partType] ||
              "回看错题对应的原文依据，辨析选项与原文的差异。"
            : stats.part.kind === "cloze"
              ? "回看空格前后的逻辑关系、固定搭配与词义辨析。"
              : "定位题干关键词所在句，区分事实细节、推断与主旨。";
        return { stats, suggestion };
      })
      .sort((a, b) => (a.stats.accuracy || 0) - (b.stats.accuracy || 0));
    const weak = candidates.filter((entry) => (entry.stats.accuracy || 0) < 80);
    const list = (weak.length ? weak : candidates).slice(0, 3);
    if (!list.length) return "";
    return `<section class="paper-result-section">
      <header class="paper-result-section-head">
        <div><span class="eyebrow">WEAK POINTS</span><h3>薄弱环节</h3></div>
        <span>${weak.length ? "优先回看正确率较低的板块" : "当前已提交板块正确率均较高"}</span>
      </header>
      <div class="paper-weakness-list">
        ${list
          .map(({ stats, suggestion }) => {
            const accuracy = Math.round(stats.accuracy || 0);
            const label =
              stats.part.kind === "partb"
                ? `${stats.part.label} · ${stats.part.partLabel}`
                : stats.part.kind === "cloze"
                  ? "完型填空"
                  : stats.part.title || stats.part.label;
            return `<article class="paper-weakness ${scoreClass(stats.score, stats.maxScore)}">
              <div class="paper-weakness-top">
                <strong>${escapeHTML(label)}</strong>
                <span>${accuracy}%</span>
              </div>
              <div class="paper-weakness-bar"><i style="width:${accuracy}%"></i></div>
              <p>${escapeHTML(suggestion)}</p>
              <small>${formatScore(stats.score)} / ${formatScore(stats.maxScore)} 分 · 答对 ${stats.correct}/${stats.part.questions.length} 题</small>
            </article>`;
          })
          .join("")}
      </div>
    </section>`;
  }

  function resultTable(part, stats) {
    const answers = answerMap(part);
    return `<article class="paper-result-table-group">
      <header class="paper-result-table-head">
        <div>
          <h4>${escapeHTML(part.kind === "partb" ? `${part.label} · ${part.partLabel}` : partTitle(part))}</h4>
          <span>答对 ${stats.correct}/${part.questions.length} 题</span>
        </div>
        <strong>${formatScore(stats.score)} / ${formatScore(stats.maxScore)}</strong>
      </header>
      <div class="table-scroll">
        <table class="paper-result-table">
          <thead><tr><th>题号</th><th>你的答案</th><th>正确答案</th><th>小分</th></tr></thead>
          <tbody>
            ${part.questions
              .map((question) => {
                const selected = answers[question.number] || "";
                const correct = selected === question.answer;
                return `<tr class="${correct ? "is-correct" : "is-wrong"}">
                  <td>${question.number}</td>
                  <td>${selected ? escapeHTML(selected) : `<span class="paper-answer-empty">未作答</span>`}</td>
                  <td>${escapeHTML(question.answer)}</td>
                  <td>${correct ? formatScore(question.score) : "0"}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </article>`;
  }

  function renderResult() {
    const summary = paperSummary();
    if (!summary.submittedCount) {
      renderShell(
        `<section class="paper-result-empty">
          <div class="empty-illustration" aria-hidden="true">
            <span class="empty-illustration-paper">${icon("target", 28)}</span>
            <span class="empty-illustration-mark">研</span>
            <span class="empty-illustration-line"></span>
          </div>
          <span class="eyebrow">NO SUBMITTED SECTIONS</span>
          <h2>还没有提交任何板块</h2>
          <p>完成一个板块并提交后，这里会显示得分、各题小分与薄弱环节。完成 Part B 后还可以整卷提交。</p>
          <a class="btn btn-primary" href="${paperUrl(paper.id, "practice", "cloze")}">去完成完型填空 ${icon("arrowRight", 15)}</a>
        </section>`,
        { showTabs: false },
      );
      return;
    }
    const partialCopy = summary.allSubmitted
      ? "整卷已提交，以下成绩按客观题 60 分制计算。"
      : `已提交 ${summary.submittedCount}/6 个板块；当前分数只统计已提交部分。完成 Part B 后可整卷提交。`;
    const maxDisplay = summary.allSubmitted ? paper.maxScore : summary.maxScore;
    const scorePercent = summary.percent;
    renderShell(
      `<section class="paper-result-hero ${scoreClass(summary.score, maxDisplay)}">
        <div class="paper-result-hero-copy">
          <span class="eyebrow">RESULT · ${paper.year} · ${escapeHTML(examSubjectMeta(subjectKey).name)}</span>
          <h2>${escapeHTML(paper.title)}</h2>
          <p>${escapeHTML(partialCopy)}</p>
          <div class="paper-result-hero-stats">
            <div><strong>${summary.correct}</strong><span>答对题数</span></div>
            <div><strong>${summary.answered}</strong><span>已作答题数</span></div>
            <div><strong>${summary.unanswered}</strong><span>未作答题数</span></div>
            <div><strong>${summary.submittedCount}/6</strong><span>已提交板块</span></div>
          </div>
        </div>
        <div class="paper-score-ring" style="--paper-score:${scorePercent}%">
          <div class="paper-score-ring-inner">
            <strong>${formatScore(summary.score)}</strong>
            <span>/ ${formatScore(maxDisplay)}</span>
            <small>${summary.allSubmitted ? "客观题总分" : "已提交板块"}</small>
          </div>
        </div>
      </section>
      ${
        !summary.allSubmitted
          ? `<div class="paper-partial-note">${icon("info", 16)}<p>${escapeHTML(partialCopy)}</p></div>`
          : ""
      }
      ${weaknessList(summary)}
      <section class="paper-result-section">
        <header class="paper-result-section-head">
          <div><span class="eyebrow">SECTION SCORES</span><h3>板块得分</h3></div>
          <span>点击板块可回看做题与批改</span>
        </header>
        <div class="paper-result-parts">
          ${summary.stats
            .map((stats) => {
              const accuracy = Math.round(stats.accuracy || 0);
              return `<a class="paper-result-part ${stats.submitted ? "is-submitted" : "is-pending"}" href="${paperUrl(paper.id, "practice", stats.part.key)}">
                <div class="paper-result-part-top">
                  <strong>${escapeHTML(stats.part.kind === "partb" ? `${stats.part.label} · ${stats.part.partLabel}` : stats.part.label)}</strong>
                  <span>${stats.submitted ? `${formatScore(stats.score)}/${formatScore(stats.maxScore)}` : "未提交"}</span>
                </div>
                <div class="paper-result-part-meta">
                  <span>${stats.submitted ? `答对 ${stats.correct}/${stats.part.questions.length} 题 · ${accuracy}%` : `已答 ${stats.answered}/${stats.part.questions.length} 题`}</span>
                  <span>${stats.submitted ? icon("chevronRight", 13) : "去完成"}</span>
                </div>
                <span class="paper-result-part-bar"><i style="width:${stats.submitted ? accuracy : 0}%"></i></span>
              </a>`;
            })
            .join("")}
        </div>
      </section>
      <section class="paper-result-section">
        <header class="paper-result-section-head">
          <div><span class="eyebrow">QUESTION SCORES</span><h3>各题目小分</h3></div>
          <span>未提交板块不参与当前计分</span>
        </header>
        <div class="paper-result-tables">
          ${summary.submittedStats.map((stats) => resultTable(stats.part, stats)).join("")}
        </div>
      </section>
      <div class="paper-result-actions">
        <a class="btn btn-soft" href="${paperUrl(paper.id, "practice", activePracticeSection())}">${icon("arrowLeft", 15)} 返回试卷</a>
        <button type="button" class="btn btn-ghost btn-danger-text" data-retry-paper>${icon("refresh", 15)} 重做本卷</button>
      </div>`,
      { showTabs: true },
    );
  }

  function renderPractice() {
    const part = getPart();
    if (!part) {
      renderShell(`<div class="table-empty">当前试卷没有可作答的板块。</div>`);
      return;
    }
    renderShell(renderPartPractice(part));
  }

  function render() {
    teardownHighlighter();
    if (disposed) return;
    if (viewMode === "result") renderResult();
    else renderPractice();
    afterRender();
  }

  function afterRender() {
    syncSelectAvailability();
    setupHighlighter();
  }

  function setSelectedPart(partKey) {
    if (!paper?.parts.some((part) => part.key === partKey)) return;
    selectedPartKey = partKey;
    viewMode = "practice";
    if (location.hash !== paperUrl(paper.id, "practice", selectedPartKey)) {
      navigatePaper(paper.id, "practice", selectedPartKey);
    } else {
      render();
    }
  }

  function refreshBlankMarkers(part, numbers = null) {
    const targetNumbers = numbers
      ? new Set(numbers.map((number) => String(number)))
      : null;
    container.querySelectorAll("[data-inline-number]").forEach((element) => {
      if (targetNumbers && !targetNumbers.has(element.dataset.inlineNumber)) return;
      const number = Number(element.dataset.inlineNumber);
      if (!number) return;
      const markup = element.classList.contains("paper-blank-slot")
        ? blankSlotMarkup(part, number)
        : blankMarkerMarkup(part, number, element.classList.contains("is-inline"));
      const wrapper = document.createElement("div");
      wrapper.innerHTML = markup;
      const replacement = wrapper.firstElementChild;
      if (replacement) element.replaceWith(replacement);
    });
  }

  function updateOrderPreviews(part, number) {
    const selected = selectedAnswer(part, number);
    const preview = container.querySelector(`[data-order-preview="${number}"]`);
    if (preview) {
      preview.textContent = selected
        ? `${selected} · ${truncate(optionText(part, selected), 130)}`
        : "尚未选择段落";
    }
  }

  function updateProgressLabels(part) {
    const stats = partStats(part);
    container.querySelectorAll("[data-answer-progress]").forEach((element) => {
      element.textContent = `已答 ${stats.answered} / ${part.questions.length}`;
    });
    container.querySelectorAll("[data-part-progress]").forEach((element) => {
      element.textContent = stats.submitted
        ? `已提交 · ${formatScore(stats.score)}/${formatScore(stats.maxScore)}`
        : `已答 ${stats.answered}/${part.questions.length} 题`;
    });
    paper.parts.forEach((entry) => {
      const entryStats = partStats(entry);
      const button = container.querySelector(`[data-paper-section="${entry.key}"]`);
      if (!button) return;
      button.classList.toggle("is-submitted", entryStats.submitted);
      const small = button.querySelector("small");
      if (small) {
        small.textContent = entryStats.submitted
          ? `${formatScore(entryStats.score)}/${formatScore(entryStats.maxScore)} · 已提交`
          : entryStats.answered
            ? `已答 ${entryStats.answered}/${entry.questions.length}`
            : entry.kind === "partb"
              ? entry.partLabel
              : "未作答";
      }
    });
  }

  function syncSelectAvailability() {
    const part = getPart();
    if (!part || part.kind !== "partb") return;
    const selects = [...container.querySelectorAll("select[data-paper-select]")];
    if (!selects.length) return;
    const given = getPartOrderLetters(part);
    const selectedByOthers = new Map();
    selects.forEach((select) => {
      const number = select.dataset.questionNumber;
      if (select.value) selectedByOthers.set(select.value, number);
    });
    selects.forEach((select) => {
      const ownNumber = select.dataset.questionNumber;
      [...select.options].forEach((option) => {
        if (!option.value) return;
        const other = selectedByOthers.get(option.value);
        option.disabled = given.has(option.value) || (other && other !== ownNumber);
      });
    });
  }

  function highlightColorValue(key) {
    return HIGHLIGHT_COLORS.find((color) => color.key === key)?.value || HIGHLIGHT_COLORS[0].value;
  }

  function teardownHighlighter() {
    highlightCleanup?.();
    highlightCleanup = null;
  }

  function setupHighlighter() {
    const part = getPart();
    if (viewMode !== "practice" || !part) return;
    const shell = container.querySelector("[data-highlight-shell]");
    const passage = shell?.querySelector("[data-paper-passage]");
    const canvas = shell?.querySelector("[data-highlight-canvas]");
    if (!shell || !passage || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const localController = new AbortController();
    const tool = {
      active: false,
      mode: "marker",
      color: DEFAULT_HIGHLIGHT_COLOR,
      drawing: false,
      erasing: false,
      stroke: null,
    };
    let strokes = Array.isArray(paperState.highlights[part.key])
      ? JSON.parse(JSON.stringify(paperState.highlights[part.key]))
      : [];
    let resizeObserver = null;
    let frame = 0;

    function persistHighlights() {
      paperState.highlights[part.key] = strokes;
      persist();
      const status = shell.querySelector("[data-highlight-status]");
      if (status) status.textContent = strokes.length ? `${strokes.length} 笔勾画` : "勾画会保存在本机";
    }

    function setStatus(text) {
      const status = shell.querySelector("[data-highlight-status]");
      if (status) status.textContent = text;
    }

    function activeColorButton() {
      shell.querySelectorAll("[data-highlight-color]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.highlightColor === tool.color);
      });
    }

    function setToolButtons() {
      const toggle = shell.querySelector("[data-highlight-toggle]");
      const eraser = shell.querySelector("[data-highlight-eraser]");
      toggle?.classList.toggle("is-active", tool.active && tool.mode === "marker");
      toggle?.setAttribute("aria-pressed", String(tool.active && tool.mode === "marker"));
      eraser?.classList.toggle("is-active", tool.active && tool.mode === "eraser");
      eraser?.setAttribute("aria-pressed", String(tool.active && tool.mode === "eraser"));
      shell.classList.toggle("is-drawing", tool.active);
      const hint = shell.querySelector("[data-highlight-hint]");
      if (hint) {
        hint.classList.toggle("is-active", tool.active);
        hint.innerHTML = tool.active
          ? `${icon("pen", 13)} 勾画中：拖动涂抹；点击工具按钮退出后可正常答题。`
          : `${icon("info", 13)} 开启荧光笔后拖动勾画；关闭后可正常选词、点击空格。`;
      }
    }

    function setActive(active, mode = tool.mode) {
      tool.active = active;
      if (mode) tool.mode = mode;
      if (active) tool.color = tool.color || DEFAULT_HIGHLIGHT_COLOR;
      setToolButtons();
    }

    function resizeCanvas() {
      const rect = passage.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { rect, dpr };
    }

    function drawStroke(stroke, rect) {
      if (!stroke?.points?.length) return;
      const width = Math.max(8, (Number(stroke.width) || HIGHLIGHT_WIDTH_RATIO) * rect.width);
      context.strokeStyle = highlightColorValue(stroke.color);
      context.fillStyle = highlightColorValue(stroke.color);
      context.lineWidth = width;
      context.lineCap = "round";
      context.lineJoin = "round";
      if (stroke.points.length === 1) {
        const [x, y] = stroke.points[0];
        context.beginPath();
        context.arc(x * rect.width, y * rect.height, width / 2, 0, Math.PI * 2);
        context.fill();
        return;
      }
      context.beginPath();
      stroke.points.forEach(([x, y], index) => {
        const px = x * rect.width;
        const py = y * rect.height;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.stroke();
    }

    function redraw() {
      if (disposed) return;
      frame = 0;
      const size = resizeCanvas();
      if (!size) return;
      context.clearRect(0, 0, size.rect.width, size.rect.height);
      strokes.forEach((stroke) => drawStroke(stroke, size.rect));
      if (tool.stroke) drawStroke(tool.stroke, size.rect);
    }

    function scheduleRedraw() {
      if (frame) return;
      frame = requestAnimationFrame(redraw);
    }

    function pointFromEvent(event) {
      const rect = passage.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      return [x, y];
    }

    function distanceToSegment(point, start, end) {
      const [px, py] = point;
      const [ax, ay] = start;
      const [bx, by] = end;
      const dx = bx - ax;
      const dy = by - ay;
      if (!dx && !dy) return Math.hypot(px - ax, py - ay);
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    function eraseAt(point) {
      const rect = passage.getBoundingClientRect();
      const threshold = 16 / Math.max(1, rect.width);
      const thresholdY = 16 / Math.max(1, rect.height);
      const before = strokes.length;
      strokes = strokes.filter((stroke) => {
        if (!stroke.points?.length) return false;
        if (stroke.points.length === 1) {
          return (
            Math.abs(stroke.points[0][0] - point[0]) > threshold ||
            Math.abs(stroke.points[0][1] - point[1]) > thresholdY
          );
        }
        for (let index = 1; index < stroke.points.length; index += 1) {
          if (distanceToSegment(point, stroke.points[index - 1], stroke.points[index]) <= threshold) {
            return false;
          }
        }
        return true;
      });
      if (before !== strokes.length) scheduleRedraw();
    }

    function endStroke() {
      if (tool.erasing) {
        tool.erasing = false;
        persistHighlights();
      }
      if (tool.stroke) {
        if (tool.stroke.points.length) strokes.push(tool.stroke);
        tool.stroke = null;
        tool.drawing = false;
        persistHighlights();
        scheduleRedraw();
      }
    }

    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (!tool.active || event.button > 0) return;
        event.preventDefault();
        canvas.setPointerCapture?.(event.pointerId);
        const point = pointFromEvent(event);
        if (tool.mode === "eraser") {
          tool.erasing = true;
          eraseAt(point);
        } else {
          tool.drawing = true;
          tool.stroke = {
            color: tool.color,
            width: HIGHLIGHT_WIDTH_RATIO,
            points: [point],
          };
          scheduleRedraw();
        }
      },
      { signal: localController.signal },
    );

    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (!tool.drawing && !tool.erasing) return;
        event.preventDefault();
        const point = pointFromEvent(event);
        if (tool.erasing) {
          eraseAt(point);
        } else if (tool.stroke) {
          const last = tool.stroke.points[tool.stroke.points.length - 1];
          const rect = passage.getBoundingClientRect();
          if (Math.hypot((point[0] - last[0]) * rect.width, (point[1] - last[1]) * rect.height) > 1.5) {
            tool.stroke.points.push(point);
            scheduleRedraw();
          }
        }
      },
      { signal: localController.signal },
    );

    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
      canvas.addEventListener(type, endStroke, { signal: localController.signal });
    });

    shell.querySelector("[data-highlight-toggle]")?.addEventListener(
      "click",
      () => {
        if (tool.active && tool.mode === "marker") {
          setActive(false);
        } else {
          setActive(true, "marker");
        }
      },
      { signal: localController.signal },
    );

    shell.querySelectorAll("[data-highlight-color]").forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          tool.color = button.dataset.highlightColor || DEFAULT_HIGHLIGHT_COLOR;
          activeColorButton();
          setActive(true, "marker");
        },
        { signal: localController.signal },
      );
    });

    shell.querySelector("[data-highlight-eraser]")?.addEventListener(
      "click",
      () => {
        if (tool.active && tool.mode === "eraser") {
          setActive(false);
        } else {
          setActive(true, "eraser");
        }
      },
      { signal: localController.signal },
    );

    shell.querySelector("[data-highlight-undo]")?.addEventListener(
      "click",
      () => {
        if (!strokes.length) {
          setStatus("没有可撤销的勾画");
          return;
        }
        strokes.pop();
        persistHighlights();
        scheduleRedraw();
      },
      { signal: localController.signal },
    );

    shell.querySelector("[data-highlight-clear]")?.addEventListener(
      "click",
      async () => {
        if (!strokes.length) {
          setStatus("没有可清空的勾画");
          return;
        }
        const confirmed = await confirmDialog({
          title: "清空荧光笔勾画",
          message: "将清除本板块的全部勾画，且无法恢复。作答不会受影响。",
          confirmText: "清空勾画",
          danger: true,
        });
        if (!confirmed || disposed) return;
        strokes = [];
        persistHighlights();
        scheduleRedraw();
      },
      { signal: localController.signal },
    );

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => scheduleRedraw());
      resizeObserver.observe(passage);
    }
    window.addEventListener("resize", scheduleRedraw, { signal: localController.signal });
    document.fonts?.ready?.then(() => scheduleRedraw()).catch(() => {});
    redraw();
    setToolButtons();
    activeColorButton();

    highlightCleanup = () => {
      localController.abort();
      resizeObserver?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      canvas.width = 0;
      canvas.height = 0;
    };
  }

  async function submitPart(part) {
    if (!part || isSubmitted(part)) return;
    const unanswered = part.questions.filter(
      (question) => !selectedAnswer(part, question.number),
    ).length;
    const confirmed = await confirmDialog({
      title: `提交${part.kind === "partb" ? " Part B" : ` ${part.label}`}`,
      message: unanswered
        ? `还有 ${unanswered} 题未作答，未作答按 0 分计算。提交后将锁定本板块答案，仍要提交吗？`
        : "提交后将立即批改并锁定本板块答案，仍要提交吗？",
      confirmText: "提交并批改",
    });
    if (!confirmed || disposed) return;
    paperState.answers[part.key] = answerMap(part, true);
    paperState.submitted[part.key] = true;
    persist();
    const scrollY = window.scrollY;
    render();
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
    toast("本板块已提交并完成批改。");
  }

  async function submitPaper() {
    if (disposed || !paper) return;
    if (paperSummary().allSubmitted) {
      await persist();
      if (!disposed) navigatePaper(paper.id, "result");
      return;
    }
    const unanswered = paper.parts.reduce(
      (sum, part) =>
        sum +
        part.questions.filter((question) => !selectedAnswer(part, question.number)).length,
      0,
    );
    const confirmed = await confirmDialog({
      title: "提交整卷并批改",
      message: unanswered
        ? `整卷还有 ${unanswered} 题未作答，未作答按 0 分计算。提交后会批改全部六个板块并生成结果页。`
        : "提交后会批改全部六个板块，并生成总分、各题小分与薄弱环节。",
      confirmText: "提交整卷",
    });
    if (!confirmed || disposed) return;
    paper.parts.forEach((part) => {
      paperState.answers[part.key] = answerMap(part, true);
      paperState.submitted[part.key] = true;
    });
    await persist();
    if (disposed) return;
    navigatePaper(paper.id, "result");
    toast("整卷已提交，正在打开结果页。");
  }

  async function retryPart() {
    const part = getPart();
    if (!part) return;
    const confirmed = await confirmDialog({
      title: "重做本板块",
      message: "将清除本板块的作答与批改结果，荧光笔勾画会保留。",
      confirmText: "重做",
    });
    if (!confirmed || disposed) return;
    delete paperState.answers[part.key];
    delete paperState.submitted[part.key];
    persist();
    render();
    toast("本板块已重置，可以重新作答。");
  }

  async function retryPaper() {
    const confirmed = await confirmDialog({
      title: "重做整卷",
      message: "将清除本卷全部作答与批改结果，荧光笔勾画会保留。",
      confirmText: "重做整卷",
      danger: true,
    });
    if (!confirmed || disposed) return;
    paperState.answers = {};
    paperState.submitted = {};
    await persist();
    if (disposed) return;
    navigatePaper(paper.id, "practice", "cloze");
    toast("本卷作答已重置。");
  }

  function jumpToQuestion(number) {
    const target = container.querySelector(`[data-question-row="${number}"], #paper-q-${number}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("is-flashing");
    setTimeout(() => target.classList.remove("is-flashing"), 900);
    const focusable = target.querySelector(
      "button[data-paper-answer], select[data-paper-select]",
    );
    focusable?.focus({ preventScroll: true });
  }

  async function init() {
    teardownHighlighter();
    if (disposed) return;
    subjectKey = normalizeExamSubject(app.state.examSubject);
    container.innerHTML = loadingMarkup();
    try {
      manifest = await loadPaperManifest();
      if (disposed) return;
      const available = papersForSubject(manifest, subjectKey);
      if (!available.length) throw new Error("当前科目没有可用的客观题试卷。");
      meta =
        available.find((entry) => entry.id === params.paper) ||
        available[0];
      paper = await loadPaper(meta.id);
      if (disposed) return;
      const sectionKeys = new Set(paper.parts.map((part) => part.key));
      selectedPartKey = sectionKeys.has(params.section) ? params.section : "cloze";
      viewMode = params.view === "result" ? "result" : "practice";
      paperState = normalizePaperState(await getPaperState(paper.id), paper.id);
      if (disposed) return;
      const expected = paperUrl(paper.id, viewMode, selectedPartKey);
      if (location.hash !== expected) {
        history.replaceState(null, "", expected);
      }
      render();
    } catch (error) {
      if (disposed) return;
      console.error(error);
      container.innerHTML = errorMarkup(error);
    }
  }

  container.addEventListener(
    "click",
    async (event) => {
      if (event.target.closest("[data-papers-retry]")) {
        init();
        return;
      }
      const resultLink = event.target.closest("[data-paper-result-link]");
      if (resultLink) {
        event.preventDefault();
        await persist();
        if (!disposed) navigatePaper(paper.id, "result");
        return;
      }
      const sectionButton = event.target.closest("[data-paper-section]");
      if (sectionButton) {
        setSelectedPart(sectionButton.dataset.paperSection);
        return;
      }
      const jump = event.target.closest("[data-jump-question]");
      if (jump) {
        jumpToQuestion(Number(jump.dataset.jumpQuestion));
        return;
      }
      const answerButton = event.target.closest("[data-paper-answer]");
      if (answerButton) {
        const part = currentSection();
        if (!part || isSubmitted(part)) return;
        const number = Number(answerButton.dataset.questionNumber);
        const value = answerButton.dataset.paperAnswer;
        setAnswer(part, number, value);
        container
          .querySelectorAll(
            `[data-question-row="${number}"] [data-paper-answer]`,
          )
          .forEach((button) => {
            const selected = button.dataset.paperAnswer === value;
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-pressed", String(selected));
          });
        refreshBlankMarkers(part, [number]);
        updateProgressLabels(part);
        updateOrderPreviews(part, number);
        return;
      }
      if (event.target.closest("[data-submit-part]")) {
        submitPart(currentSection());
        return;
      }
      if (event.target.closest("[data-submit-paper]")) {
        submitPaper();
        return;
      }
      if (event.target.closest("[data-retry-part]")) {
        retryPart();
        return;
      }
      if (event.target.closest("[data-retry-paper]")) {
        retryPaper();
      }
    },
    { signal: controller.signal },
  );

  container.addEventListener(
    "change",
    (event) => {
      const yearSelect = event.target.closest("[data-paper-year]");
      if (yearSelect) {
        const selectedMeta = manifest?.papers.find((entry) => entry.id === yearSelect.value);
        if (!selectedMeta || selectedMeta.subjectKey !== subjectKey) return;
        navigatePaper(selectedMeta.id, viewMode, selectedPartKey);
        return;
      }
      const select = event.target.closest("[data-paper-select]");
      if (!select) return;
      const part = currentSection();
      if (!part || isSubmitted(part)) return;
      const number = Number(select.dataset.questionNumber);
      setAnswer(part, number, select.value);
      syncSelectAvailability();
      refreshBlankMarkers(part, [number]);
      updateOrderPreviews(part, number);
      updateProgressLabels(part);
    },
    { signal: controller.signal },
  );

  init();

  return () => {
    disposed = true;
    controller.abort();
    teardownHighlighter();
  };
}
