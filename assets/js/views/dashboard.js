import { isApiConfigured } from "../api.js";
import { renderObjectiveChart, renderScoreChart } from "../charts.js";
import { MODE_LABELS, SUBJECT_ORDER, SUBJECTS } from "../data.js";
import { listPaperStates, savePaperState } from "../db.js";
import {
  examSubjectMeta,
  loadPaper,
  loadPaperManifest,
  papersForSubject,
} from "../papers.js";
import { PAPER_OVERTIME_MS } from "../timer.js";
import { icon } from "../ui.js";
import {
  averageScore,
  computeStreak,
  countThisWeek,
  escapeHTML,
  formatDateHeadline,
  formatDayLabel,
  formatScore,
} from "../utils.js";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了，慢慢来";
  if (hour < 12) return "早上好，开始今天的练习";
  if (hour < 18) return "下午好，留一点时间给表达";
  return "晚上好，把今天写下的再读一遍";
}

function validSummary(summary) {
  return (
    summary &&
    Number.isFinite(Number(summary.score)) &&
    Number.isFinite(Number(summary.maxScore)) &&
    Number(summary.maxScore) > 0
  );
}

function timeValue(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function summaryFromPaper(paperData, state) {
  const answers = state.answers && typeof state.answers === "object" ? state.answers : {};
  let score = 0;
  let maxScore = 0;
  let correct = 0;
  let questionCount = 0;
  for (const part of paperData.parts || []) {
    const partAnswers =
      answers[part.key] && typeof answers[part.key] === "object" ? answers[part.key] : {};
    maxScore += Number(part.maxScore) || 0;
    for (const question of part.questions || []) {
      questionCount += 1;
      if (partAnswers[question.number] === question.answer) {
        correct += 1;
        score += Number(question.score) || 0;
      }
    }
  }
  const totalMs = Math.round(Number(state.timing?.totalMs) || 0);
  const timed = Boolean(state.timing?.startedAt) && Number.isFinite(Number(state.timing?.totalMs));
  return {
    score,
    maxScore,
    correct,
    questionCount,
    submittedAt: state.updatedAt || new Date().toISOString(),
    durationMs: timed ? totalMs : null,
    overtime: timed ? totalMs > PAPER_OVERTIME_MS : null,
  };
}

function objectiveCardMarkup(subject) {
  return `<article class="chart-card subject-objective" data-objective-card>
    <header class="chart-card-head">
      <span class="subject-emblem">${icon("target", 20)}</span>
      <div class="chart-card-title">
        <h3>客观题 · ${escapeHTML(subject.short)}</h3>
        <p data-objective-total>${escapeHTML(subject.name)} · 整卷满分 60 分</p>
      </div>
      <div class="chart-latest">
        <span>最近整卷</span>
        <strong data-objective-latest>—</strong>
      </div>
    </header>
    <div class="chart-metrics">
      <span data-objective-average>平均 <strong>—</strong> 分</span>
      <span data-objective-count>等待整套提交</span>
    </div>
    <div class="objective-chart-slot" data-objective-chart>
      <div class="chart-loading"><span class="loading-orbit" aria-hidden="true"></span><span>正在读取整卷记录…</span></div>
    </div>
    <footer class="chart-card-foot">
      <span class="legend-average"><i></i> 历年整卷均分</span>
      <span data-objective-foot>仅统计完整提交的整卷</span>
    </footer>
  </article>`;
}

async function hydrateObjectiveCard(card, subject, isDisposed) {
  const chartSlot = card.querySelector("[data-objective-chart]");
  const latestValue = card.querySelector("[data-objective-latest]");
  const averageValue = card.querySelector("[data-objective-average]");
  const countValue = card.querySelector("[data-objective-count]");
  const totalCopy = card.querySelector("[data-objective-total]");
  const foot = card.querySelector("[data-objective-foot]");
  const manifest = await loadPaperManifest();
  if (isDisposed()) return;
  const papers = papersForSubject(manifest, subject.key);
  const metaById = new Map(papers.map((entry) => [entry.id, entry]));
  const total = Math.max(0, ...papers.map((entry) => Number(entry.maxScore) || 0)) || 60;
  if (totalCopy) totalCopy.textContent = `${subject.name} · 整卷满分 ${formatScore(total)} 分`;
  const states = await listPaperStates();
  if (isDisposed()) return;

  const rows = [];
  for (const state of states) {
    if (!state?.id || !metaById.has(state.id)) continue;
    const paperMeta = metaById.get(state.id);
    let summary = state.summary;
    if (!validSummary(summary)) {
      const submittedCount = Object.values(state.submitted || {}).filter(Boolean).length;
      if (submittedCount < 6) continue;
      let paperData;
      try {
        paperData = await loadPaper(state.id);
      } catch (error) {
        console.warn("无法补全整卷记录：", state.id, error);
        continue;
      }
      if (isDisposed()) return;
      if (!(paperData.parts || []).every((part) => state.submitted?.[part.key])) continue;
      summary = summaryFromPaper(paperData, state);
      try {
        await savePaperState({ ...state, summary });
      } catch (error) {
        console.warn("无法保存补全的整卷记录：", state.id, error);
      }
      if (isDisposed()) return;
    }
    rows.push({
      id: state.id,
      year: Number(paperMeta.year),
      score: Number(summary.score),
      maxScore: Number(summary.maxScore),
      submittedAt: summary.submittedAt || state.updatedAt || null,
    });
  }

  const byYear = new Map();
  for (const row of rows) {
    const existing = byYear.get(row.year);
    if (!existing || timeValue(row.submittedAt) > timeValue(existing.submittedAt)) {
      byYear.set(row.year, row);
    }
  }
  const points = [...byYear.values()].sort((a, b) => a.year - b.year);
  const latest = [...points].sort((a, b) => timeValue(b.submittedAt) - timeValue(a.submittedAt))[0] || null;
  const average = points.length
    ? points.reduce((sum, point) => sum + Number(point.score), 0) / points.length
    : null;

  if (latestValue) {
    latestValue.innerHTML = latest
      ? `${formatScore(latest.score)}<small>/${formatScore(latest.maxScore)}</small>`
      : "—";
  }
  if (averageValue) {
    averageValue.innerHTML = `平均 <strong>${average === null ? "—" : formatScore(average)}</strong> 分`;
  }
  if (countValue) {
    countValue.textContent = points.length
      ? `${points.length} 个年份 · ${rows.length} 套完整整卷`
      : "等待整套提交";
  }
  if (foot) {
    foot.textContent =
      latest && timeValue(latest.submittedAt)
        ? `最近 ${formatDayLabel(latest.submittedAt)}`
        : "仅统计完整提交的整卷";
  }
  if (isDisposed()) return;
  chartSlot.innerHTML = renderObjectiveChart(points, {
    subjectName: subject.name,
    total,
  });
}

function renderSubjectChart(records, subject) {
  const typed = records.filter((record) => record.type === subject.key);
  const scored = typed.filter(
    (record) => record.score !== null && record.score !== undefined && Number.isFinite(Number(record.score)),
  );
  const latest = scored[0];
  const average = averageScore(scored);
  return `<article class="chart-card subject-${subject.key}">
    <header class="chart-card-head">
      <span class="subject-emblem">${icon(subject.icon, 20)}</span>
      <div class="chart-card-title">
        <h3>${escapeHTML(subject.label)}</h3>
        <p>满分 ${subject.total} 分</p>
      </div>
      <div class="chart-latest">
        <span>最近得分</span>
        <strong>${latest ? formatScore(latest.score) : "—"}<small>${latest ? `/${subject.total}` : ""}</small></strong>
      </div>
    </header>
    <div class="chart-metrics">
      <span>平均 <strong>${average === null ? "—" : formatScore(average)}</strong> 分</span>
      <span>${typed.length} 次记录${typed.length > scored.length ? ` · ${typed.length - scored.length} 条无有效得分` : ""}</span>
    </div>
    ${renderScoreChart(scored, subject)}
    <footer class="chart-card-foot">
      <span class="legend-average"><i></i> 题型平均分</span>
      ${typed.length > 12 ? `<span>曲线显示最近 12 次</span>` : `<span>${latest ? `最近 ${formatDayLabel(latest.createdAt)}` : "等待第一条曲线"}</span>`}
    </footer>
  </article>`;
}

function renderRecent(records) {
  if (!records.length) {
    return `<div class="empty-panel recent-empty">
      <span class="empty-panel-icon">${icon("pen", 25)}</span>
      <div>
        <h3>你的第一条批改记录会出现在这里</h3>
        <p>选择翻译、小作文或大作文，提交后再回到练习页精读修改。</p>
      </div>
      <a href="#/grade/translation" class="btn btn-primary btn-small">开始批改 ${icon("arrowRight", 15)}</a>
    </div>`;
  }
  return `<div class="recent-list">
    ${records
      .slice(0, 6)
      .map((record) => {
        const subject = SUBJECTS[record.type];
        if (!subject) return "";
        return `<a class="recent-row" href="#/practice/${record.type}?record=${encodeURIComponent(record.id)}">
          <span class="recent-subject subject-${subject.key}">${icon(subject.icon, 18)}</span>
          <span class="recent-main">
            <strong>${escapeHTML(record.title || subject.label)}</strong>
            <span>${escapeHTML(MODE_LABELS[record.mode] || "练习")} · ${escapeHTML(formatDayLabel(record.createdAt))}</span>
          </span>
          <span class="recent-score">${formatScore(record.score)}<small>/${subject.total}</small></span>
          <span class="recent-arrow">${icon("arrowUpRight", 16)}</span>
        </a>`;
      })
      .join("")}
  </div>`;
}

export function renderDashboard(container, app) {
  const records = app.state.records;
  const configured = isApiConfigured(app.state.config);
  const scoredRecords = records.filter(
    (record) => record.score !== null && record.score !== undefined && Number.isFinite(Number(record.score)),
  );
  const normalizedAverage = scoredRecords.length
    ? scoredRecords.reduce(
        (sum, record) => sum + Number(record.score) / (SUBJECTS[record.type]?.total || 15),
        0,
      ) / scoredRecords.length
    : null;
  const streak = computeStreak(records);
  const weekCount = countThisWeek(records);
  const latest = records[0];
  const examSubject = examSubjectMeta(app.state.examSubject);

  container.innerHTML = `
    <div class="page dashboard-page">
      <header class="page-head">
        <div class="page-head-copy">
          <span class="eyebrow">YOUR STUDY DESK / 学习总览</span>
          <h1>学习总览</h1>
          <p>四条曲线，记录你在客观题与主观题上的每一步。</p>
        </div>
        <div class="page-head-actions">
          <a href="#/grade/translation" class="btn btn-primary">${icon("plus", 17)} 开始批改</a>
        </div>
      </header>

      ${
        configured
          ? ""
          : `<div class="setup-banner">
              <span class="setup-banner-icon">${icon("sparkles", 19)}</span>
              <p><strong>先连接你的 AI 模型。</strong> 配置一次，即可开始翻译和作文批改；接口与密钥只保存在本机。</p>
              <button class="btn btn-soft btn-small" type="button" data-open-settings>配置接口</button>
            </div>`
      }

      <section class="hero-panel" aria-labelledby="hero-title">
        <div class="hero-copy">
          <span class="hero-date">${escapeHTML(formatDateHeadline())}</span>
          <p class="hero-greeting">${escapeHTML(greeting())}</p>
          <h2 id="hero-title">把每一次落笔，<br><em>变成看得见的进步。</em></h2>
          <p class="hero-desc">AI 逐句批改、高分表达替换与范文精读，让每一处修改都有理由。</p>
          <div class="hero-actions">
            <a href="#/grade/translation" class="btn btn-accent">开始一次批改 ${icon("arrowRight", 16)}</a>
            ${
              latest
                ? `<a href="#/practice/${latest.type}?record=${encodeURIComponent(latest.id)}" class="text-link">继续上次练习 ${icon("arrowUpRight", 15)}</a>`
                : `<a href="#/practice/translation" class="text-link">查看练习方式 ${icon("arrowUpRight", 15)}</a>`
            }
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="hero-paper">
            <div class="hero-paper-top"><span>DAILY NOTE</span><span>No. 01</span></div>
            <p class="hero-paper-quote">“Every sentence<br>deserves a second look.”</p>
            <span class="hero-paper-rule"></span>
            <p class="hero-paper-cn">每一次修改，都是一次重读。</p>
            <span class="hero-paper-seal">研</span>
          </div>
          <span class="hero-orbit hero-orbit-one"></span>
          <span class="hero-orbit hero-orbit-two"></span>
        </div>
      </section>

      <section class="stats-grid" aria-label="学习状态">
        <article class="stat-card">
          <span class="stat-icon">${icon("checkCircle", 18)}</span>
          <div><span class="stat-label">累计批改</span><strong>${records.length}<small> 次</small></strong></div>
        </article>
        <article class="stat-card">
          <span class="stat-icon">${icon("target", 18)}</span>
          <div><span class="stat-label">平均得分率</span><strong>${normalizedAverage === null ? "—" : `${Math.round(normalizedAverage * 100)}`}<small>${normalizedAverage === null ? "" : " %"}</small></strong></div>
        </article>
        <article class="stat-card">
          <span class="stat-icon">${icon("sparkles", 18)}</span>
          <div><span class="stat-label">连续练习</span><strong>${streak}<small> 天</small></strong></div>
        </article>
        <article class="stat-card">
          <span class="stat-icon">${icon("clock", 18)}</span>
          <div><span class="stat-label">本周批改</span><strong>${weekCount}<small> 次</small></strong></div>
        </article>
      </section>

      <section class="dashboard-section">
        <div class="section-heading">
          <div>
            <span class="eyebrow">PROGRESS CURVES</span>
            <h2>历史评分曲线</h2>
          </div>
          <p>虚线为对应题型的平均分；客观题按完整整卷统计</p>
        </div>
        <div class="chart-grid">
          ${objectiveCardMarkup(examSubject)}
          ${SUBJECT_ORDER.map((key) => renderSubjectChart(records, SUBJECTS[key])).join("")}
        </div>
      </section>

      <section class="dashboard-section recent-section">
        <div class="section-heading">
          <div>
            <span class="eyebrow">RECENT REVIEWS</span>
            <h2>最近批改</h2>
          </div>
          ${records.length ? `<span class="section-count">共 ${records.length} 条记录</span>` : ""}
        </div>
        ${renderRecent(records)}
      </section>
    </div>`;

  let disposed = false;
  const objectiveCard = container.querySelector("[data-objective-card]");
  if (objectiveCard) {
    hydrateObjectiveCard(objectiveCard, examSubject, () => disposed).catch((error) => {
      if (disposed || !objectiveCard.isConnected) return;
      console.error(error);
      const slot = objectiveCard.querySelector("[data-objective-chart]");
      if (slot) {
        slot.innerHTML = `<div class="chart-loading is-error"><p>无法读取本机整卷记录</p><span>请稍后重新打开学习总览</span></div>`;
      }
    });
  }

  return () => {
    disposed = true;
  };
}
