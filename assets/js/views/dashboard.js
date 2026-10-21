import { isApiConfigured } from "../api.js";
import { renderScoreChart } from "../charts.js";
import { MODE_LABELS, SUBJECT_ORDER, SUBJECTS } from "../data.js";
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

  container.innerHTML = `
    <div class="page dashboard-page">
      <header class="page-head">
        <div class="page-head-copy">
          <span class="eyebrow">YOUR STUDY DESK / 学习总览</span>
          <h1>学习总览</h1>
          <p>三条曲线，记录你在翻译与写作上的每一步。</p>
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
          <p>虚线为对应题型的全部记录平均分</p>
        </div>
        <div class="chart-grid">
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

  return null;
}
