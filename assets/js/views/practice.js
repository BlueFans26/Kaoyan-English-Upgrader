import { MODE_LABELS, SUBJECTS } from "../data.js";
import {
  copyText,
  escapeAttr,
  escapeHTML,
  formatDateTime,
  formatScore,
  truncate,
  whyData,
} from "../utils.js";
import { confirmDialog, icon, initWhyPopover, toast } from "../ui.js";

function hasScore(record) {
  return record?.score !== null && record?.score !== undefined && Number.isFinite(Number(record.score));
}

function safeImageSource(value) {
  const raw = String(value || "");
  if (/^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(raw)) return raw;
  return /^assets\/images\/exams\/[a-z0-9/_-]+\.(?:jpe?g|png|webp)$/i.test(raw) ? raw : "";
}

function recordImages(images, alt) {
  const valid = (Array.isArray(images) ? images : [])
    .map((image) => safeImageSource(image?.dataUrl || image))
    .filter(Boolean);
  if (!valid.length) return "";
  return `<div class="record-image-grid">${valid
    .map((source, index) => `<img src="${escapeAttr(source)}" alt="${escapeAttr(`${alt} ${index + 1}`)}">`)
    .join("")}</div>`;
}

function scoreValue(record) {
  const candidate = record?.score ?? record?.result?.score;
  if (candidate === null || candidate === undefined) return null;
  const value = Number(candidate);
  return Number.isFinite(value) ? value : null;
}

function recordItemMarkup(record, subject, selectedId) {
  const score = scoreValue(record);
  return `<a class="record-list-item ${record.id === selectedId ? "is-active" : ""}" href="#/practice/${subject.key}?record=${encodeURIComponent(record.id)}" ${record.id === selectedId ? 'aria-current="page"' : ""}>
    <div class="record-list-top">
      <span class="record-mode">${escapeHTML(MODE_LABELS[record.mode] || "批改")}</span>
      <time datetime="${escapeAttr(record.createdAt)}">${escapeHTML(formatDateTime(record.createdAt).slice(0, 10))}</time>
    </div>
    <strong class="record-list-title">${escapeHTML(truncate(record.title || subject.label, 30))}</strong>
    <div class="record-list-bottom">
      <span class="record-list-score">${score === null ? "—" : formatScore(score)}<small>/${subject.total}</small></span>
      <span class="record-list-view">查看批改 ${icon("chevronRight", 13)}</span>
    </div>
  </a>`;
}

function renderEmpty(subject) {
  return `<div class="practice-empty">
    <div class="empty-illustration" aria-hidden="true">
      <span class="empty-illustration-paper">${icon("bookOpen", 28)}</span>
      <span class="empty-illustration-mark">研</span>
      <span class="empty-illustration-line"></span>
    </div>
    <span class="eyebrow">NO RECORDS YET</span>
    <h2>还没有${escapeHTML(subject.label)}批改记录</h2>
    <p>完成一次${escapeHTML(subject.label)}批改后，这里会出现逐句分析、优化对照和可交互的范文。</p>
    <a href="#/grade/${subject.key}" class="btn btn-primary">去批改第一篇 ${icon("arrowRight", 15)}</a>
  </div>`;
}

function normalizeForMatch(text) {
  let normalized = "";
  const map = [];
  const source = String(text || "");
  for (let index = 0; index < source.length; index += 1) {
    if (!/\s/.test(source[index])) {
      normalized += source[index];
      map.push(index);
    }
  }
  return { normalized, map };
}

function whyButton(text, why, extraClass = "why-sentence") {
  if (!why) return escapeHTML(text);
  return `<button type="button" class="${extraClass}" data-why="${escapeAttr(whyData(why))}" aria-expanded="false">${escapeHTML(text)}</button>`;
}

function buildSampleCopy(sampleText, notes, subject) {
  const activeNotes = notes.filter((note) => note.sentence?.trim() && note.why?.trim());
  let text = sampleText || activeNotes.map((note) => note.sentence).join(" ");
  if (!text) return "";
  if (!activeNotes.length) return `<div class="sample-copy">${escapeHTML(text)}</div>`;

  const full = normalizeForMatch(text);
  let cursorNorm = 0;
  let cursorOrig = 0;
  let matched = 0;
  const parts = [];
  for (const note of activeNotes) {
    const noteNormalized = normalizeForMatch(note.sentence).normalized;
    if (!noteNormalized) continue;
    const found = full.normalized.indexOf(noteNormalized, cursorNorm);
    if (found === -1) continue;
    const start = full.map[found];
    const end = full.map[found + noteNormalized.length - 1] + 1;
    if (start < cursorOrig || end > text.length) continue;
    parts.push(escapeHTML(text.slice(cursorOrig, start)));
    const actualSentence = text.slice(start, end);
    parts.push(whyButton(actualSentence, note.why));
    cursorOrig = end;
    cursorNorm = found + noteNormalized.length;
    matched += 1;
  }
  parts.push(escapeHTML(text.slice(cursorOrig)));

  if (!matched) {
    const fallbackNotes = activeNotes
      .map((note) => whyButton(note.sentence, note.why))
      .join(subject.tableVariant === "translation" ? "" : " ");
    return `<div class="sample-copy">${escapeHTML(text)}</div><div class="sample-fallback-notes"><span>句意解析</span><p>${fallbackNotes}</p></div>`;
  }
  return `<div class="sample-copy">${parts.join("")}</div>`;
}

function renderSentenceTable(record, result, subject) {
  const rows = Array.isArray(result.sentenceRows) ? result.sentenceRows : [];
  const isTranslation = subject.tableVariant === "translation";
  const columnCount = isTranslation ? 4 : 5;
  const totalDeductionRaw = Number(result.totalDeduction);
  const totalDeduction = Number.isFinite(totalDeductionRaw) ? Math.abs(totalDeductionRaw) : null;
  const score = scoreValue(record);
  const total = Number(record.total) || subject.total;

  const bodyRows = rows.length
    ? rows
        .map((row, index) => {
          const penalty = Number(row.deduction) || 0;
          const penaltyMarkup = `<div class="penalty-cell">
            <span class="penalty-amount ${penalty > 0 ? "has-penalty" : ""}">${penalty > 0 ? `−${formatScore(penalty)}` : "未扣分"}</span>
            ${row.deductionReason ? `<p class="cell-note">${escapeHTML(row.deductionReason)}</p>` : ""}
          </div>`;
          const reasonMarkup = `<div class="cell-reason">${row.reason ? escapeHTML(row.reason) : `<span class="muted">—</span>`}</div>`;
          return `<tr>
            <td class="cell-index">${String(index + 1).padStart(2, "0")}</td>
            <td class="cell-original"><div class="cell-copy">${row.original ? escapeHTML(row.original) : `<span class="muted">—</span>`}</div></td>
            <td class="cell-improved"><div class="cell-copy">${row.improved ? escapeHTML(row.improved) : `<span class="muted">—</span>`}</div></td>
            ${isTranslation ? "" : `<td class="cell-why">${reasonMarkup}</td>`}
            <td class="cell-deduction">
              ${isTranslation && row.reason ? `<p class="cell-note is-reason">${escapeHTML(row.reason)}</p>` : ""}
              ${penaltyMarkup}
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="${columnCount}"><div class="table-empty">本次结果没有逐句明细。${result.parsed === false ? "请查看下方的 AI 原始返回。" : ""}</div></td></tr>`;

  return `<section class="review-card sentence-card">
    <header class="review-card-head">
      <div>
        <span class="eyebrow">SENTENCE BY SENTENCE</span>
        <h2>逐句批改</h2>
      </div>
      <span class="section-meta">${rows.length ? `${rows.length} 句分析` : "逐句对照"}</span>
    </header>
    <p class="review-card-desc">原作答与 AI 生成的高分表达逐句对照，扣分项写清采分点与修改方向。</p>
    <div class="table-scroll">
      <table class="feedback-table">
        <thead>
          <tr>
            <th class="cell-index">#</th>
            <th>作答</th>
            <th>高分作答</th>
            ${isTranslation ? "" : "<th>为什么这样修改</th>"}
            <th>扣分明细</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="${columnCount - 2}" class="table-total-label">合计</td>
            <td class="table-deduction-total">总扣分 <strong>${totalDeduction === null ? "—" : `−${formatScore(totalDeduction)}`}</strong></td>
            <td class="table-score-total">总得分 <strong>${score === null ? "—" : formatScore(score)}<small>/${total}</small></strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p class="table-mobile-hint">${icon("info", 14)} 左右滑动可查看完整表格</p>
  </section>`;
}

function renderOptimization(result, subject) {
  const optimizations = Array.isArray(result.optimizations)
    ? result.optimizations.filter((item) => item && (item.original || item.improved))
    : [];
  if (!optimizations.length && !result.optimizedText) return "";
  const hasWhy = optimizations.some((item) => item.why);
  return `<section class="review-card optimization-card">
    <header class="review-card-head">
      <div>
        <span class="eyebrow">REWRITE &amp; REFINE</span>
        <h2>${escapeHTML(subject.optimizeTitle)}</h2>
      </div>
      <span class="section-meta">${hasWhy ? "轻点建议表达查看原因" : "表达对照"}</span>
    </header>
    <p class="review-card-desc">${escapeHTML(subject.optimizeHint)}</p>
    ${
      optimizations.length
        ? `<div class="optimization-list">
            ${optimizations
              .map(
                (item, index) => `<article class="optimization-item">
                  <span class="opt-number">${String(index + 1).padStart(2, "0")}</span>
                  <div class="opt-content">
                    ${item.original ? `<p class="opt-original"><del>${escapeHTML(item.original)}</del></p>` : ""}
                    <p class="opt-improved">
                      ${icon("arrowRight", 15)}
                      ${item.improved ? (item.why ? whyButton(item.improved, item.why, "why-token") : `<span class="opt-improved-text">${escapeHTML(item.improved)}</span>`) : ""}
                    </p>
                  </div>
                </article>`,
              )
              .join("")}
          </div>`
        : `<div class="inline-notice is-soft">${icon("info", 16)}<p>本次结果没有返回逐句优化对照，下面保留了优化后的全文。</p></div>`
    }
    ${
      result.optimizedText
        ? `<details class="optimized-full" ${optimizations.length ? "" : "open"}>
            <summary>查看${escapeHTML(subject.optimizedLabel)} ${icon("chevronDown", 15)}</summary>
            <div class="prose-block">${escapeHTML(result.optimizedText)}</div>
          </details>`
        : ""
    }
  </section>`;
}

function renderSample(result, subject) {
  const noteCount = Array.isArray(result.sampleNotes) ? result.sampleNotes.length : 0;
  const sampleText = result.sampleEssay || "";
  if (!sampleText && !noteCount) {
    return `<section class="review-card sample-card">
      <header class="review-card-head"><div><span class="eyebrow">MODEL ANSWER</span><h2>${escapeHTML(subject.sampleTitle)}</h2></div></header>
      <div class="table-empty">本次批改没有返回范文。</div>
    </section>`;
  }
  const copySource = sampleText || (result.sampleNotes || []).map((note) => note.sentence).join(" ");
  return `<section class="review-card sample-card">
    <header class="review-card-head">
      <div>
        <span class="eyebrow">MODEL ANSWER</span>
        <h2>${escapeHTML(subject.sampleTitle)}</h2>
      </div>
      <div class="sample-head-actions">
        <span class="section-meta">${icon("info", 14)} 悬停或轻点句子查看原因</span>
        <button type="button" class="icon-btn" data-action="copy-sample" aria-label="复制${escapeHTML(subject.sampleTitle)}" title="复制">${icon("copy", 16)}</button>
      </div>
    </header>
    <p class="review-card-desc">${escapeHTML(subject.sampleHint)}</p>
    ${buildSampleCopy(sampleText, result.sampleNotes || [], subject)}
    <textarea data-sample-copy hidden>${escapeHTML(copySource)}</textarea>
  </section>`;
}

function renderRaw(result) {
  if (!result.raw || (result.parsed !== false && result.truncated !== true)) return "";
  const message =
    result.truncated === true
      ? "AI 输出在模型长度上限处被截断，页面已解析并展示可用的部分。原始输出保留在下方，便于排查或复制。"
      : "AI 返回内容未完全遵循结构化格式。页面已尽力解析可见信息，原始输出保留在下方，便于排查或复制。";
  return `<section class="review-card raw-card">
    <div class="inline-notice is-warning">${icon("alert", 18)}<p>${message}</p></div>
    <details class="raw-response">
      <summary>查看 AI 原始返回 ${icon("chevronDown", 15)}</summary>
      <pre>${escapeHTML(result.raw)}</pre>
    </details>
  </section>`;
}

function renderRecordContext(record, subject) {
  const questionText = record.questionText || "";
  const answerText = record.answerText || "";
  const questionImageHtml = recordImages(record.questionImages, "题干图片");
  const answerImageHtml = recordImages(record.answerImages, "作答图片");
  return `<details class="record-context">
    <summary>
      <span>${icon("fileText", 16)} 查看原题与我的作答</span>
      ${icon("chevronDown", 15)}
    </summary>
    <div class="record-context-body">
      <div class="context-column">
        <span class="eyebrow">QUESTION</span>
        <h3>题目</h3>
        <div class="context-text">${questionText ? escapeHTML(questionText) : `<span class="muted">题干以图片形式提交。</span>`}</div>
        ${questionImageHtml}
      </div>
      <div class="context-column">
        <span class="eyebrow">YOUR ANSWER</span>
        <h3>我的作答</h3>
        ${
          record.answerMode === "text" || answerText
            ? `<div class="context-text">${escapeHTML(answerText) || "（未保存文本）"}</div>`
            : `<div class="context-text muted">作答以图片形式提交。</div>`
        }
        ${answerImageHtml}
      </div>
    </div>
  </details>`;
}

export function renderPractice(container, app, subjectKey, params = {}) {
  const subject = SUBJECTS[subjectKey];
  const records = app.state.records.filter((record) => record.type === subjectKey);
  const requestedId = params.record;
  const selected =
    records.find((record) => record.id === requestedId) || records[0] || null;
  const cleanupController = new AbortController();

  const header = `
    <header class="page-head">
      <div class="page-head-copy">
        <span class="eyebrow">${escapeHTML(subject.eyebrow)} / REVIEW ARCHIVE</span>
        <div class="title-with-badge">
          <h1>${escapeHTML(subject.practiceTitle)}</h1>
          <span class="total-badge">共 ${records.length} 次</span>
        </div>
        <p>${escapeHTML(subject.practiceDescription)}</p>
      </div>
      <div class="page-head-actions">
        <a href="#/grade/${subjectKey}" class="btn btn-primary">${icon("plus", 17)} 新建批改</a>
      </div>
    </header>`;

  if (!records.length) {
    container.innerHTML = `<div class="page practice-page">${header}${renderEmpty(subject)}</div>`;
    return () => cleanupController.abort();
  }

  const record = selected;
  const result = record.result || {};
  const score = scoreValue(record);
  const total = Number(record.total) || subject.total;
  const percentage = score === null ? 0 : Math.min(100, Math.max(0, (score / total) * 100));
  const weaknesses = Array.isArray(result.weaknesses) ? result.weaknesses.filter(Boolean) : [];
  const hasRows = Array.isArray(result.sentenceRows) && result.sentenceRows.length > 0;
  const parseWarning =
    result.parsed === false && result.truncated !== true
      ? `<div class="inline-notice is-warning">${icon("alert", 18)}<p>AI 返回内容未完全结构化，得分与逐句信息可能不完整。请查看原始返回，或换用支持稳定 JSON 输出的模型重试。</p></div>`
      : "";
  const truncatedNotice =
    result.truncated === true
      ? `<div class="inline-notice is-warning">${icon("alert", 18)}<p>AI 输出达到了模型长度上限，页面已展示可解析的部分；总评、逐句明细或范文可能不完整。建议换用输出上限更高或非推理模型重新批改。</p></div>`
      : "";
  const summaryText = result.summary || "本次批改没有返回文字总评。";
  const optimization = renderOptimization(result, subject);
  const sample = renderSample(result, subject);
  const raw = renderRaw(result);

  container.innerHTML = `
    <div class="page practice-page">
      ${header}
      <div class="practice-layout">
        <aside class="record-sidebar" aria-label="批改记录">
          <div class="record-sidebar-head">
            <div><span>批改记录</span><strong>${records.length}</strong></div>
            <a href="#/grade/${subjectKey}" class="icon-btn" aria-label="新建批改" title="新建批改">${icon("plus", 17)}</a>
          </div>
          <div class="record-list">
            ${records.map((item) => recordItemMarkup(item, subject, record.id)).join("")}
          </div>
          <div class="record-sidebar-foot">${icon("database", 14)} 记录仅保存在本机</div>
        </aside>

        <div class="review-content">
          <section class="review-hero">
            <div class="review-hero-head">
              <div class="review-title-area">
                <div class="record-tags">
                  <span class="tag subject-tag">${escapeHTML(MODE_LABELS[record.mode] || "批改")}</span>
                  ${record.yearLabel ? `<span class="tag tag-muted">${escapeHTML(record.yearLabel)}</span>` : ""}
                </div>
                <h2>${escapeHTML(record.title || `${subject.label}批改记录`)}</h2>
                <p class="review-meta">
                  <time datetime="${escapeAttr(record.createdAt)}">${escapeHTML(formatDateTime(record.createdAt))}</time>
                  ${record.model ? `<span class="meta-divider"></span><span>${escapeHTML(record.model)}</span>` : ""}
                </p>
              </div>
              <div class="review-hero-side">
                <div class="score-display ${score === null ? "is-missing" : ""}" style="--score-angle:${(percentage * 3.6).toFixed(1)}deg">
                  <div class="score-display-inner">
                    <strong>${score === null ? "—" : formatScore(score)}</strong>
                    <span>/${total}</span>
                  </div>
                </div>
                <button type="button" class="icon-btn delete-record" data-action="delete-record" aria-label="删除这条批改记录" title="删除记录">${icon("trash", 16)}</button>
              </div>
            </div>
            <div class="review-summary">
              <div class="review-summary-main">
                <span class="eyebrow">OVERALL FEEDBACK</span>
                <h3>总评</h3>
                <p>${escapeHTML(summaryText)}</p>
              </div>
              <div class="weakness-block">
                <h3>薄弱点</h3>
                ${
                  weaknesses.length
                    ? `<div class="weakness-tags">${weaknesses.map((item) => `<span>${escapeHTML(item)}</span>`).join("")}</div>`
                    : `<p class="muted">本次未单独列出薄弱点。</p>`
                }
              </div>
            </div>
          </section>

          ${renderRecordContext(record, subject)}
          ${parseWarning}
          ${truncatedNotice}
          ${renderSentenceTable(record, result, subject)}
          ${optimization}
          ${sample}
          ${raw}
          ${!hasRows && result.parsed !== false && result.truncated !== true ? `<div class="inline-notice is-soft">${icon("info", 16)}<p>这份记录的逐句明细为空，可能是模型未返回完整表格。你可以删除后重新批改。</p></div>` : ""}
        </div>
      </div>
    </div>`;

  const cleanupWhy = initWhyPopover(container.querySelector(".review-content"));

  container.addEventListener(
    "click",
    async (event) => {
      const actionElement = event.target.closest("[data-action]");
      if (!actionElement) return;
      if (actionElement.dataset.action === "copy-sample") {
        const copyField = container.querySelector("[data-sample-copy]");
        if (!copyField?.value) return;
        try {
          await copyText(copyField.value);
          toast("范文已复制。");
        } catch {
          toast("复制失败，请手动选择文本。", "error");
        }
      } else if (actionElement.dataset.action === "delete-record") {
        const confirmed = await confirmDialog({
          title: "删除这条批改记录",
          message: "记录、作答图片和逐句分析将从本机永久删除，且无法恢复。确定删除吗？",
          confirmText: "删除记录",
          danger: true,
        });
        if (!confirmed) return;
        try {
          await app.removeRecord(record.id);
          const remaining = app.state.records.filter((item) => item.type === subjectKey);
          toast("批改记录已删除。");
          if (remaining[0]) {
            app.navigate(`/practice/${subjectKey}?record=${encodeURIComponent(remaining[0].id)}`);
          } else {
            const target = `/practice/${subjectKey}`;
            if (location.hash === `#${target}`) app.refreshRoute();
            else app.navigate(target);
          }
        } catch (error) {
          toast(error?.message || "删除记录失败。", "error");
        }
      }
    },
    { signal: cleanupController.signal },
  );

  return () => {
    cleanupController.abort();
    cleanupWhy?.();
  };
}
