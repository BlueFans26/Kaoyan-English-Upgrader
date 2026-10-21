import { averageScore, escapeHTML, formatScore, formatShortDate } from "./utils.js";

function chartEmpty(subject) {
  return `<div class="chart-empty">
    <svg class="chart-empty-line" viewBox="0 0 460 160" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="80" x2="460" y2="80" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 7" opacity=".35"/>
      <circle cx="80" cy="80" r="3.5" fill="currentColor" opacity=".25"/>
      <circle cx="230" cy="80" r="3.5" fill="currentColor" opacity=".25"/>
      <circle cx="380" cy="80" r="3.5" fill="currentColor" opacity=".25"/>
    </svg>
    <div class="chart-empty-copy">
      <span>尚无${escapeHTML(subject.label)}记录</span>
      <a href="#/grade/${subject.key}">去完成第一次批改 ${iconArrow()}</a>
    </div>
  </div>`;
}

function iconArrow() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
}

export function renderVocabChart(days) {
  const width = 620;
  const height = 236;
  const padding = { top: 30, right: 20, bottom: 34, left: 38 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const baseline = padding.top + plotHeight;
  const maxValue = Math.max(...days.map((day) => day.total), 0);
  const yMax = Math.max(10, Math.ceil(maxValue / 5) * 5);
  const xFor = (index) =>
    days.length <= 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (days.length - 1)) * plotWidth;
  const yFor = (value) => padding.top + (1 - Number(value) / yMax) * plotHeight;
  const points = days.map((day, index) => ({
    x: xFor(index),
    y: yFor(day.total),
    ...day,
  }));
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${points.at(-1).x.toFixed(2)},${baseline} L${points[0].x.toFixed(2)},${baseline} Z`;
  const gradientId = "vocab-chart-gradient";
  const ticks = [0, yMax / 2, yMax];
  const allEmpty = maxValue === 0;
  const total = days.reduce((sum, day) => sum + day.total, 0);

  return `<div class="vocab-chart ${allEmpty ? "is-empty" : ""}">
    <svg class="chart-svg vocab-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="近 ${days.length} 天背单词数量曲线，共完成 ${total} 词">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--chart-color)" stop-opacity=".2"/>
          <stop offset="100%" stop-color="var(--chart-color)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${ticks
        .map((tick) => {
          const y = yFor(tick).toFixed(2);
          return `<line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"/>
            <text class="chart-axis-text vocab-chart-axis" x="${padding.left - 9}" y="${Number(y) + 4}" text-anchor="end">${Math.round(tick)}</text>`;
        })
        .join("")}
      <path class="chart-area" d="${areaPath}" fill="url(#${gradientId})"/>
      <path class="chart-line vocab-chart-line" d="${linePath}"/>
      ${points
        .map(
          (point, index) => `<g class="chart-point vocab-chart-point ${index === points.length - 1 ? "is-latest" : ""}">
            <circle class="chart-point-ring" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="8"/>
            <circle class="chart-dot" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${index === points.length - 1 ? 3.8 : 3}"/>
            <title>${escapeHTML(point.label)} · 完成 ${point.total} 词（新学 ${point.newWords} · 复习 ${point.reviews}）</title>
          </g>
          ${point.total > 0 ? `<text class="vocab-chart-value" x="${point.x.toFixed(2)}" y="${(point.y - 11).toFixed(2)}" text-anchor="middle">${point.total}</text>` : ""}`,
        )
        .join("")}
      ${points
        .map((point, index) => {
          const anchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
          return `<text class="chart-date-text vocab-chart-date" x="${point.x.toFixed(2)}" y="${height - 9}" text-anchor="${anchor}">${escapeHTML(point.label)}</text>`;
        })
        .join("")}
      ${points.length ? `<circle class="chart-latest-ring" cx="${points.at(-1).x.toFixed(2)}" cy="${points.at(-1).y.toFixed(2)}" r="9"/>` : ""}
    </svg>
    ${allEmpty ? `<p class="vocab-chart-empty-note">还没有完成记录，从第一组词开始。</p>` : ""}
  </div>`;
}

export function renderScoreChart(records, subject) {
  const scored = records.filter(
    (record) => record?.score !== null && record?.score !== undefined && Number.isFinite(Number(record.score)),
  );
  if (!scored.length) return chartEmpty(subject);
  const chronological = [...scored].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const average = averageScore(chronological);
  const visible = chronological.slice(-12);
  const width = 460;
  const height = 208;
  const padding = { top: 16, right: 20, bottom: 32, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const baseline = padding.top + plotHeight;
  const total = subject.total;
  const xFor = (index) => {
    if (visible.length === 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (visible.length - 1)) * plotWidth;
  };
  const yFor = (score) => padding.top + (1 - Number(score) / total) * plotHeight;
  const points = visible.map((record, index) => ({
    x: xFor(index),
    y: yFor(record.score),
    score: record.score,
    date: record.createdAt,
  }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${points.at(-1).x.toFixed(2)},${baseline} L${points[0].x.toFixed(2)},${baseline} Z`;
  const averageY = yFor(average).toFixed(2);
  const gradientId = `chart-gradient-${subject.key}`;
  const tickScores = [total, total / 2, 0];
  const labelIndexes = new Set([0, visible.length - 1]);
  if (visible.length <= 5) visible.forEach((_, index) => labelIndexes.add(index));
  else labelIndexes.add(Math.floor((visible.length - 1) / 2));
  const latest = points.at(-1);
  const formatAxis = (value) => (Number.isInteger(value) ? value : formatScore(value));

  return `<div class="score-chart">
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(subject.label)}历史得分曲线，共 ${chronological.length} 条记录，平均 ${formatScore(average)} 分">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--chart-color)" stop-opacity=".18"/>
          <stop offset="100%" stop-color="var(--chart-color)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${tickScores
        .map((tick) => {
          const y = yFor(tick).toFixed(2);
          return `<line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"/>
            <text class="chart-axis-text" x="${padding.left - 8}" y="${Number(y) + 4}" text-anchor="end">${formatAxis(tick)}</text>`;
        })
        .join("")}
      <line class="chart-average-line" x1="${padding.left}" y1="${averageY}" x2="${width - padding.right}" y2="${averageY}"/>
      <rect class="chart-average-tag-bg" x="${width - padding.right - 78}" y="${Number(averageY) - 21}" width="78" height="18" rx="9"/>
      <text class="chart-average-text" x="${width - padding.right - 7}" y="${Number(averageY) - 8}" text-anchor="end">均分 ${formatScore(average)}</text>
      <path class="chart-area" d="${areaPath}" fill="url(#${gradientId})"/>
      <path class="chart-line" d="${linePath}"/>
      ${points
        .map(
          (point, index) => `<g class="chart-point ${index === points.length - 1 ? "is-latest" : ""}">
            <circle class="chart-point-ring" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${index === points.length - 1 ? 8 : 6}"/>
            <circle class="chart-dot" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${index === points.length - 1 ? 4 : 3.1}"/>
            <title>${formatShortDate(point.date)} · ${formatScore(point.score)}/${total} 分</title>
          </g>`,
        )
        .join("")}
      ${[...labelIndexes]
        .sort((a, b) => a - b)
        .map((index) => {
          const point = points[index];
          const anchor = index === 0 ? "start" : index === visible.length - 1 ? "end" : "middle";
          return `<text class="chart-date-text" x="${point.x.toFixed(2)}" y="${height - 9}" text-anchor="${anchor}">${formatShortDate(point.date)}</text>`;
        })
        .join("")}
      <circle class="chart-latest-ring" cx="${latest.x.toFixed(2)}" cy="${latest.y.toFixed(2)}" r="10"/>
    </svg>
  </div>`;
}
