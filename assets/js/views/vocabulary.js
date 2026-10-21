import { renderVocabChart } from "../charts.js";
import { completeVocabWord, saveVocabState } from "../db.js";
import { confirmDialog, icon, toast } from "../ui.js";
import { escapeHTML, formatDayKey } from "../utils.js";
import {
  MAX_DAILY_NEW,
  MIN_DAILY_NEW,
  VOCAB_ORDER_RANDOM,
  VOCAB_ORDER_SEQUENTIAL,
  applyLearningAnswer,
  buildOptions,
  buildVocabDays,
  createVocabState,
  formatReviewDate,
  isVocabDue,
  loadVocabulary,
  loadVocabPlan,
  loadVocabSnapshot,
  pickRandomNewWords,
  saveVocabPlan,
} from "../vocabulary.js";
import { LearningSession, ReviewSession } from "../vocab-session.js";

const PHASE_LABELS = {
  first: "01 · 初见",
  second: "02 · 再见",
  final: "03 · 最终",
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightExample(example, word) {
  const safe = escapeHTML(example);
  if (!word) return safe;
  try {
    return safe.replace(new RegExp(`\\b(${escapeRegExp(word)})\\b`, "gi"), "<mark>$1</mark>");
  } catch {
    return safe;
  }
}

function loadingMarkup() {
  return `<div class="page vocab-page">
    <div class="page-loading">
      <span class="loading-orbit"></span>
      <p>正在打开考纲词库…</p>
    </div>
  </div>`;
}

function errorMarkup(error) {
  return `<div class="page vocab-page">
    <div class="fatal-state">
      <span>${icon("alert", 28)}</span>
      <h1>词库加载失败</h1>
      <p>${escapeHTML(error?.message || "无法读取本地词库文件。")}</p>
      <button type="button" class="btn btn-primary" data-vocab-retry>重新加载</button>
    </div>
  </div>`;
}

export function renderVocabulary(container, app) {
  const controller = new AbortController();
  let disposed = false;
  let dataset = null;
  let plan = loadVocabPlan();
  let snapshot = {
    states: [],
    stateById: new Map(),
    daily: [],
    dailyByDate: new Map(),
  };
  let active = null;

  function computeStats() {
    const now = new Date();
    const todayKey = formatDayKey(now);
    const today = snapshot.dailyByDate.get(todayKey) || {
      date: todayKey,
      newWords: 0,
      reviews: 0,
      total: 0,
    };
    const planRemaining = Math.max(0, plan.dailyNew - (Number(today.newWords) || 0));
    const learned = snapshot.states.filter((state) => state.stage === 3).length;
    const partials = snapshot.states.filter((state) => state.stage < 3);
    const due = snapshot.states.filter((state) => isVocabDue(state, now.getTime()));
    const retests = snapshot.states.filter((state) => state.status === "retest");
    const futureRetests = retests.filter((state) => !isVocabDue(state, now.getTime()));
    const unseen = dataset.orderedWords.filter((word) => !snapshot.stateById.has(word.id));
    const available =
      unseen.length + partials.filter((state) => dataset.byId.has(state.id)).length;
    return {
      now,
      todayKey,
      today,
      planRemaining,
      learned,
      partials,
      due,
      retests,
      futureRetests,
      unseen,
      available,
      total: dataset.total,
      unlearned: Math.max(0, dataset.total - learned),
    };
  }

  async function refreshSnapshot() {
    snapshot = await loadVocabSnapshot();
  }

  function stopSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function disposeSession() {
    stopSpeech();
    active = null;
  }

  async function init() {
    disposeSession();
    container.innerHTML = loadingMarkup();
    try {
      dataset = await loadVocabulary();
      if (disposed) return;
      await refreshSnapshot();
      if (disposed) return;
      renderLanding();
      app.refreshVocabDue?.();
    } catch (error) {
      if (!disposed) container.innerHTML = errorMarkup(error);
    }
  }

  function stageMapMarkup() {
    return `<div class="vocab-stage-map" aria-label="每个单词的学习流程">
      <div class="vocab-stage-item">
        <span class="vocab-stage-num">01</span>
        <div><strong>初见</strong><small>四选一 · 看例句</small></div>
      </div>
      <span class="vocab-stage-link" aria-hidden="true"></span>
      <div class="vocab-stage-item">
        <span class="vocab-stage-num">02</span>
        <div><strong>再见</strong><small>四选一 · 无例句</small></div>
      </div>
      <span class="vocab-stage-link" aria-hidden="true"></span>
      <div class="vocab-stage-item">
        <span class="vocab-stage-num">03</span>
        <div><strong>最终</strong><small>只看单词 · 自评</small></div>
      </div>
    </div>`;
  }

  function renderLanding() {
    if (disposed) return;
    disposeSession();
    const stats = computeStats();
    const percent = stats.total ? (stats.learned / stats.total) * 100 : 0;
    const percentLabel =
      percent > 0 && percent < 1 ? "<1" : percent.toFixed(percent >= 10 ? 0 : 1).replace(/\.0$/, "");
    const days = buildVocabDays(snapshot.daily, 7, stats.now);
    const weekTotal = days.reduce((sum, day) => sum + day.total, 0);
    const canLearn = stats.planRemaining > 0 && stats.available > 0;
    const allLearned = stats.learned >= stats.total;
    const heroTitle = allLearned
      ? "考纲词库已全部学完"
      : stats.planRemaining === 0
        ? "今日新词计划已完成"
        : `今天再认识 <em>${stats.planRemaining}</em> 个新词`;
    const orderCopy =
      plan.order === VOCAB_ORDER_RANDOM
        ? "新词会从尚未背过的词中随机抽取。"
        : "新词按词库正序出现。";
    const heroCopy = allLearned
      ? `全部 ${formatNumber(stats.total)} 个考纲词都完成过一轮记忆，接下来交给复习曲线。`
      : stats.planRemaining === 0
        ? `今天已完成 ${stats.today.newWords} 个新词。可以调整计划继续，或先清理到期的复习。`
        : `每日计划 ${plan.dailyNew} 个，今天已完成 ${stats.today.newWords} 个。${orderCopy}新词先连续出现，再见与最终会固定穿插，直到目标全部走完。`;
    const dueCopy = stats.due.length
      ? `${stats.due.length} 个词已到复习时间，复习不占用新词计划。`
      : "复习会按记忆曲线自动到期，不需要手动挑选。";

    const learnAction = canLearn
      ? `<button type="button" class="btn btn-accent" data-vocab-start="learn">${stats.today.newWords ? "继续学习" : "开始学习"} ${icon("arrowRight", 16)}</button>`
      : stats.planRemaining === 0 && !allLearned
        ? `<button type="button" class="btn btn-accent" data-vocab-plan>${icon("calendar", 16)} 调整今日计划</button>`
        : `<button type="button" class="btn btn-accent" disabled>${allLearned ? "词库已学完" : "暂无可学新词"}</button>`;
    const reviewAction = stats.due.length
      ? `<button type="button" class="btn vocab-hero-ghost" data-vocab-start="review">${icon("repeat", 16)} 复习到期 ${stats.due.length} 词</button>`
      : `<span class="vocab-hero-quiet">${icon("checkCircle", 15)} 暂无到期复习</span>`;

    container.innerHTML = `<div class="page vocab-page">
      <header class="page-head vocab-page-head">
        <div class="page-head-copy">
          <span class="eyebrow">VOCABULARY / 考纲词汇</span>
          <h1>背单词</h1>
          <p>初见认识词义，再见脱离例句，最终凭记忆确认。</p>
        </div>
        <div class="page-head-actions">
          <button type="button" class="btn btn-ghost" data-vocab-plan>${icon("calendar", 16)} 设置计划</button>
        </div>
      </header>

      <section class="vocab-hero">
        <div class="vocab-hero-copy">
          <span class="vocab-hero-kicker">TODAY'S PLAN</span>
          <h2>${heroTitle}</h2>
          <p>${heroCopy}</p>
          <div class="vocab-hero-actions">
            ${learnAction}
            ${reviewAction}
          </div>
          <p class="vocab-hero-note">${icon("repeat", 13)} ${dueCopy}</p>
        </div>
        ${stageMapMarkup()}
      </section>

      <section class="stats-grid vocab-stats" aria-label="背单词状态">
        <article class="stat-card vocab-stat">
          <span class="stat-icon">${icon("checkCircle", 18)}</span>
          <div>
            <span class="stat-label">今日背单词</span>
            <strong>${stats.today.total || 0}<small> 词</small></strong>
            <span class="vocab-stat-meta">新学 ${stats.today.newWords || 0} · 复习 ${stats.today.reviews || 0}</span>
          </div>
        </article>
        <article class="stat-card vocab-stat">
          <span class="stat-icon">${icon("target", 18)}</span>
          <div>
            <span class="stat-label">计划内剩余</span>
            <strong>${stats.planRemaining}<small> 词</small></strong>
            <span class="vocab-stat-meta">每日 ${plan.dailyNew} 个 · ${plan.order === VOCAB_ORDER_RANDOM ? "乱序" : "正序"} · <button type="button" class="vocab-inline-action" data-vocab-plan>调整计划</button></span>
          </div>
        </article>
        <article class="stat-card vocab-stat">
          <span class="stat-icon">${icon("repeat", 18)}</span>
          <div>
            <span class="stat-label">待复习</span>
            <strong>${stats.due.length}<small> 词</small></strong>
            <span class="vocab-stat-meta">${stats.futureRetests.length ? `另有 ${stats.futureRetests.length} 个待复测` : stats.due.length ? "已到记忆曲线复习时间" : "暂无到期项"}</span>
          </div>
        </article>
        <article class="stat-card vocab-stat">
          <span class="stat-icon">${icon("cards", 18)}</span>
          <div>
            <span class="stat-label">词库进度</span>
            <strong>${formatNumber(stats.learned)}<small> / ${formatNumber(stats.total)}</small></strong>
            <span class="vocab-stat-meta">${percentLabel}% · 还剩 ${formatNumber(stats.unlearned)} 词</span>
          </div>
        </article>
      </section>

      <div class="vocab-main-grid">
        <section class="vocab-chart-card">
          <header class="vocab-panel-head">
            <div>
              <span class="eyebrow">RECENT RHYTHM</span>
              <h2>近日背单词数量</h2>
            </div>
            <span class="vocab-panel-total">近 7 天 <strong>${weekTotal}</strong> 词</span>
          </header>
          ${renderVocabChart(days)}
          <footer class="vocab-chart-foot">
            <span>完成词数 = 新学 + 复习</span>
            <span>${stats.today.total ? `今天已完成 ${stats.today.total} 词` : "今天还没有完成记录"}</span>
          </footer>
        </section>

        <aside class="vocab-side">
          <section class="vocab-side-card vocab-progress-card">
            <span class="eyebrow">WORD BANK</span>
            <div class="vocab-side-head">
              <h2>词库进度</h2>
              <span>${formatNumber(stats.total)} 词</span>
            </div>
            <div class="vocab-progress-value">
              <strong>${formatNumber(stats.learned)}</strong>
              <span>/ ${formatNumber(stats.total)}</span>
            </div>
            <div class="vocab-meter" role="progressbar" aria-label="词库完成进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}">
              <span style="width:${Math.min(100, percent)}%"></span>
            </div>
            <dl class="vocab-breakdown">
              <div><dt>完成一轮</dt><dd>${formatNumber(stats.learned)}</dd></div>
              <div><dt>进行中</dt><dd>${formatNumber(stats.partials.length)}</dd></div>
              <div><dt>到期复习</dt><dd>${formatNumber(stats.due.length)}</dd></div>
              <div><dt>待复测</dt><dd>${formatNumber(stats.retests.length)}</dd></div>
            </dl>
            <p class="vocab-side-note">${icon("repeat", 14)} 完成一轮后次日首次复习，之后按 3、7、15 天逐步拉长间隔。</p>
          </section>

          <section class="vocab-source-card">
            <span class="vocab-source-icon">${icon("bookOpen", 20)}</span>
            <div>
              <h3>词库与例句</h3>
              <p>5,530 个考纲词，三个易混选项指向其他单词，例句保留 Tatoeba 来源编号。</p>
              <button type="button" class="vocab-inline-action" data-vocab-license>来源与许可 ${icon("arrowUpRight", 14)}</button>
            </div>
          </section>
        </aside>
      </div>
    </div>`;
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function openPlanDialog() {
    container.querySelector(".vocab-plan-modal")?.remove();
    const stats = computeStats();
    const dialog = document.createElement("dialog");
    dialog.className = "modal vocab-plan-modal";
    dialog.innerHTML = `<div class="modal-card vocab-plan-card">
      <header class="vocab-plan-head">
        <div>
          <span class="eyebrow">DAILY PLAN</span>
          <h2>设置每日新词计划</h2>
          <p>只统计新学单词；复习和复测不占用名额，两种顺序都只影响尚未开始的新词。</p>
        </div>
        <button type="button" class="icon-btn modal-close" data-plan-close aria-label="关闭">${icon("x", 19)}</button>
      </header>
      <form class="vocab-plan-form" novalidate>
        <div class="vocab-plan-today">
          <span>今天已完成</span>
          <strong>${stats.today.newWords || 0} <small>个新词</small></strong>
        </div>
        <label class="field">
          <span class="field-label">每日新词数量</span>
          <span class="vocab-plan-input-row">
            <button type="button" class="vocab-stepper" data-plan-step="-5" aria-label="减少 5 个">−</button>
            <input class="input vocab-plan-input" type="number" name="dailyNew" inputmode="numeric" min="${MIN_DAILY_NEW}" max="${MAX_DAILY_NEW}" step="1" value="${plan.dailyNew}">
            <button type="button" class="vocab-stepper" data-plan-step="5" aria-label="增加 5 个">+</button>
          </span>
        </label>
        <div class="vocab-plan-presets" aria-label="快捷选择">
          ${[10, 20, 30, 50].map((value) => `<button type="button" class="${plan.dailyNew === value ? "is-active" : ""}" data-plan-preset="${value}">${value} 个</button>`).join("")}
        </div>
        <fieldset class="vocab-plan-order">
          <legend class="field-label">新词顺序</legend>
          <div class="vocab-order-options">
            <label class="vocab-order-option">
              <input type="radio" name="order" value="${VOCAB_ORDER_SEQUENTIAL}" ${plan.order === VOCAB_ORDER_SEQUENTIAL ? "checked" : ""}>
              <span class="vocab-order-body">
                <span class="vocab-order-mark" aria-hidden="true"></span>
                <span class="vocab-order-copy">
                  <strong>正序背诵</strong>
                  <small>A 到 Z 稳定推进</small>
                </span>
              </span>
            </label>
            <label class="vocab-order-option">
              <input type="radio" name="order" value="${VOCAB_ORDER_RANDOM}" ${plan.order === VOCAB_ORDER_RANDOM ? "checked" : ""}>
              <span class="vocab-order-body">
                <span class="vocab-order-mark" aria-hidden="true"></span>
                <span class="vocab-order-copy">
                  <strong>乱序背诵</strong>
                  <small>未背词中随机抽取</small>
                </span>
              </span>
            </label>
          </div>
        </fieldset>
        <p class="vocab-plan-hint">可设置 ${MIN_DAILY_NEW}–${MAX_DAILY_NEW} 个。计划与顺序随时可调，不影响已完成的记录。</p>
        <p class="vocab-plan-error" data-plan-error role="alert"></p>
        <div class="vocab-plan-actions">
          <button type="button" class="btn btn-ghost" data-plan-close>取消</button>
          <button type="submit" class="btn btn-primary">${icon("check", 16)} 保存计划</button>
        </div>
      </form>
    </div>`;
    container.appendChild(dialog);
    const form = dialog.querySelector("form");
    const input = form.elements.dailyNew;
    const errorElement = dialog.querySelector("[data-plan-error]");
    const close = () => {
      if (dialog.open) dialog.close();
      setTimeout(() => dialog.remove(), 0);
    };
    const setValue = (value) => {
      input.value = String(Math.min(MAX_DAILY_NEW, Math.max(MIN_DAILY_NEW, Number(value) || MIN_DAILY_NEW)));
      errorElement.textContent = "";
      dialog.querySelectorAll("[data-plan-preset]").forEach((button) => {
        button.classList.toggle("is-active", Number(button.dataset.planPreset) === Number(input.value));
      });
    };
    dialog.querySelectorAll("[data-plan-close]").forEach((button) => button.addEventListener("click", close));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.querySelectorAll("[data-plan-preset]").forEach((button) => {
      button.addEventListener("click", () => setValue(button.dataset.planPreset));
    });
    dialog.querySelectorAll("[data-plan-step]").forEach((button) => {
      button.addEventListener("click", () => setValue(Number(input.value) + Number(button.dataset.planStep)));
    });
    input.addEventListener("input", () => {
      errorElement.textContent = "";
      dialog.querySelectorAll("[data-plan-preset]").forEach((button) => {
        button.classList.toggle("is-active", Number(button.dataset.planPreset) === Number(input.value));
      });
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = Number(input.value);
      if (!Number.isInteger(value) || value < MIN_DAILY_NEW || value > MAX_DAILY_NEW) {
        errorElement.textContent = `请输入 ${MIN_DAILY_NEW}–${MAX_DAILY_NEW} 之间的整数。`;
        input.focus();
        return;
      }
      plan = saveVocabPlan({
        dailyNew: value,
        order: form.elements.order.value,
      });
      close();
      renderLanding();
      toast(
        `每日计划已设为 ${plan.dailyNew} 个新词，当前为${plan.order === VOCAB_ORDER_RANDOM ? "乱序" : "正序"}背诵。`,
      );
    });
    dialog.showModal();
    input.focus();
    input.select();
  }

  function openLicenseDialog() {
    container.querySelector(".vocab-license-modal")?.remove();
    const dialog = document.createElement("dialog");
    dialog.className = "modal vocab-license-modal";
    dialog.innerHTML = `<div class="modal-card vocab-license-card">
      <header class="vocab-license-head">
        <div>
          <span class="eyebrow">SOURCES &amp; LICENSES</span>
          <h2>词库来源与许可</h2>
          <p>词表、释义、例句与易混选项的出处。</p>
        </div>
        <button type="button" class="icon-btn modal-close" data-license-close aria-label="关闭">${icon("x", 19)}</button>
      </header>
      <div class="vocab-license-body">
        <dl class="vocab-license-list">
          <div><dt>词表与释义</dt><dd>NETEMVocabulary · 考研英语考试大纲词汇 5,530 词 · CC BY-NC-SA 4.0</dd></div>
          <div><dt>音标与词形</dt><dd>ECDICT · MIT License · Copyright (c) 2025 Linwei</dd></div>
          <div><dt>例句</dt><dd>Tatoeba · CC BY 2.0 · 每条例句保留 sentence ID，版权归各贡献者所有</dd></div>
          <div><dt>易混选项</dt><dd>由本项目基于词表、释义与拼写相似度算法生成，指向其他考纲单词，不代表官方词义辨析。</dd></div>
        </dl>
        <div class="callout callout-soft">
          ${icon("shield", 17)}
          <p>词库与派生数据仅限非商业学习用途，再分发时请保留署名与相同方式共享要求。</p>
        </div>
        <p class="vocab-license-more">例句中的少量缺失项由本站按学习场景补写；完整许可见随词库分发的说明文件。</p>
        <a class="btn btn-ghost vocab-license-link" href="./assets/data/NOTICE.txt" target="_blank" rel="noopener">查看完整说明 ${icon("arrowUpRight", 15)}</a>
      </div>
    </div>`;
    container.appendChild(dialog);
    const close = () => {
      if (dialog.open) dialog.close();
      setTimeout(() => dialog.remove(), 0);
    };
    dialog.querySelector("[data-license-close]").addEventListener("click", close);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.showModal();
  }

  function buildLearningWords(stats) {
    const needed = stats.planRemaining;
    if (needed <= 0) return [];
    const words = [];
    const ids = new Set();
    const partials = stats.partials
      .filter((state) => dataset.byId.has(state.id))
      .sort(
        (a, b) =>
          new Date(a.updatedAt || a.createdAt || 0) - new Date(b.updatedAt || b.createdAt || 0),
      );
    for (const state of partials) {
      if (words.length >= needed) break;
      const word = dataset.byId.get(state.id);
      if (word && !ids.has(word.id)) {
        words.push(word);
        ids.add(word.id);
      }
    }
    const remaining = needed - words.length;
    const newWords =
      plan.order === VOCAB_ORDER_RANDOM
        ? pickRandomNewWords(stats.unseen, remaining)
        : stats.unseen;
    for (const word of newWords) {
      if (words.length >= needed) break;
      if (snapshot.stateById.has(word.id) || ids.has(word.id)) continue;
      words.push(word);
      ids.add(word.id);
    }
    return words;
  }

  function startLearning() {
    const stats = computeStats();
    if (stats.planRemaining <= 0) {
      toast("今日新词计划已完成，可以在计划设置中调整。", "info");
      return;
    }
    const words = buildLearningWords(stats);
    if (!words.length) {
      toast("当前没有可学习的新词。", "info");
      return;
    }
    const stateById = new Map(
      words.map((word) => {
        const existing = snapshot.stateById.get(word.id);
        return [word.id, existing ? { ...existing } : createVocabState(word.id)];
      }),
    );
    const engine = new LearningSession({
      words,
      stateById,
      makeOptions: (word) => buildOptions(dataset, word),
    });
    if (!engine.total) {
      toast("当前没有需要继续学习的单词。", "info");
      return;
    }
    active = {
      mode: "learn",
      engine,
      stateById,
      question: null,
      feedback: null,
      locked: false,
      finished: false,
    };
    askNext();
  }

  function startReview() {
    const stats = computeStats();
    const dueStates = stats.due.filter((state) => dataset.byId.has(state.id));
    if (!dueStates.length) {
      toast("暂无到期复习。", "info");
      return;
    }
    const words = dueStates.map((state) => dataset.byId.get(state.id));
    const stateById = new Map(dueStates.map((state) => [state.id, { ...state }]));
    const engine = new ReviewSession({ words, stateById });
    if (!engine.total) {
      toast("暂无到期复习。", "info");
      return;
    }
    active = {
      mode: "review",
      engine,
      stateById,
      question: null,
      feedback: null,
      locked: false,
      finished: false,
    };
    askNext();
  }

  function askNext() {
    if (!active || disposed) return;
    stopSpeech();
    if (active.engine.done) {
      active.finished = true;
      renderSession();
      return;
    }
    const question = active.engine.next();
    if (!question) {
      active.finished = true;
      renderSession();
      return;
    }
    active.question = question;
    active.feedback = null;
    renderSession();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function answerQuestion({ correct, selectedIndex = null }) {
    if (!active || active.feedback || active.locked || !active.question) return;
    const session = active;
    session.locked = true;
    const question = session.question;
    const engineResult = session.engine.answer(correct);
    if (!engineResult) {
      session.locked = false;
      return;
    }
    const now = new Date();
    const currentState =
      session.stateById.get(question.word.id) || createVocabState(question.word.id, now);
    let nextState;
    let completed = false;
    if (session.mode === "learn") {
      const applied = applyLearningAnswer(currentState, engineResult.fromStage, correct, now);
      nextState = applied.state;
      completed = applied.completed;
    } else {
      nextState = engineResult.state;
    }
    session.stateById.set(nextState.id, nextState);
    try {
      if (session.mode === "learn") {
        if (completed) await completeVocabWord(nextState, "new", formatDayKey(now));
        else await saveVocabState(nextState);
      } else {
        await completeVocabWord(nextState, "review", formatDayKey(now));
      }
    } catch (error) {
      toast(error?.message || "本地进度保存失败，请检查浏览器存储空间。", "error");
    }
    if (disposed || active !== session) return;
    session.feedback = {
      correct,
      selectedIndex,
      nextState,
      done: session.engine.done,
    };
    session.locked = false;
    renderSession();
  }

  function continueSession() {
    if (!active || !active.feedback) return;
    const done = active.engine.done;
    active.feedback = null;
    if (done) {
      active.finished = true;
      renderSession();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      askNext();
    }
  }

  async function returnToLanding() {
    disposeSession();
    try {
      await refreshSnapshot();
    } catch (error) {
      toast(error?.message || "刷新本地学习数据失败。", "error");
    }
    if (disposed) return;
    renderLanding();
    app.refreshVocabDue?.();
  }

  async function exitSession() {
    if (!active) return;
    if (active.finished) {
      await returnToLanding();
      return;
    }
    const confirmed = await confirmDialog({
      title: active.mode === "learn" ? "结束本轮学习？" : "结束本轮复习？",
      message:
        active.mode === "learn"
          ? "已作答的单词会保留当前阶段；本轮未完成的词会留在当前阶段，下次学习时继续。"
          : "已答完的复习结果会保存；尚未复习的到期词会继续留在待复习列表。",
      confirmText: "结束本轮",
    });
    if (!confirmed || disposed) return;
    await returnToLanding();
  }

  function speak(word) {
    if (!word) return;
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      toast("当前浏览器不支持朗读。", "info");
      return;
    }
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.88;
    window.speechSynthesis.speak(utterance);
  }

  function sessionTopMarkup() {
    const progress = active.engine.progress();
    const total = progress.total;
    const done = active.mode === "learn" ? progress.completed : progress.answered;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const queue =
      active.mode === "learn"
        ? `<span>未初见 ${progress.first}</span><span>再见 ${progress.second}</span><span>最终 ${progress.final}</span>`
        : `<span>通过 ${progress.passed}</span><span>待复测 ${progress.failed}</span>`;
    return `<div class="vocab-session-top">
        <button type="button" class="vocab-exit" data-vocab-exit>${icon("arrowLeft", 17)} 结束</button>
        <span class="vocab-session-mode">${active.mode === "learn" ? `${icon("cards", 15)} 新词学习 · ${plan.order === VOCAB_ORDER_RANDOM ? "乱序" : "正序"}` : `${icon("repeat", 15)} 到期复习`}</span>
        <span class="vocab-session-count">${done} / ${total}</span>
      </div>
      <div class="vocab-session-track" role="progressbar" aria-label="本轮进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
        <span style="width:${percent}%"></span>
      </div>
      <div class="vocab-session-meta">
        <div>${queue}</div>
        <span>${active.mode === "learn" ? "每轮固定穿插再见与最终" : "复习直接进入最终自评"}</span>
      </div>`;
  }

  function questionHint(question) {
    if (question.review) return "完成过一轮记忆的词。直接判断：还会吗？";
    if (question.phase === "first") return "选出最贴近的主要含义，例句会帮你判断。";
    if (question.phase === "second") return "例句已收起。再选一次，确认词义是否真的记住。";
    return "只看单词，凭记忆确认。忘了就会回到未初见。";
  }

  function optionOwnerMarkup(option, feedback) {
    if (!feedback || option.correct) return "";
    const owner = dataset.byId.get(option.ownerId);
    return owner ? `<span class="vocab-option-owner">${escapeHTML(owner.id)}</span>` : "";
  }

  function optionsMarkup(question, feedback) {
    return `<div class="vocab-options" role="group" aria-label="选择一个词义">
      ${question.options
        .map((option, index) => {
          const classes = feedback
            ? option.correct
              ? "is-correct"
              : index === feedback.selectedIndex
                ? "is-wrong"
                : "is-muted"
            : "";
          return `<button type="button" class="vocab-option ${classes}" data-vocab-option="${index}" ${feedback ? "disabled" : ""}>
            <span class="vocab-option-key">${String.fromCharCode(65 + index)}</span>
            <span class="vocab-option-text">${escapeHTML(option.meaning)}</span>
            ${feedback && option.correct ? `<span class="vocab-option-flag">${icon("check", 15)}</span>` : optionOwnerMarkup(option, feedback)}
          </button>`;
        })
        .join("")}
    </div>
    ${feedback ? "" : `<p class="vocab-key-hint">按 A–D 或点击选择</p>`}`;
  }

  function finalActionsMarkup() {
    const reviewing = active.mode === "review";
    return `<div class="vocab-final-actions">
      <button type="button" class="vocab-final-btn is-no" data-vocab-final="no">
        ${icon("refresh", 20)}
        <span><strong>不会</strong><small>${reviewing ? "7 天后进入复测" : "回到未初见"}</small></span>
      </button>
      <button type="button" class="vocab-final-btn is-yes" data-vocab-final="yes">
        ${icon("check", 20)}
        <span><strong>会了</strong><small>${reviewing ? "完成本轮复习" : "完成这一轮"}</small></span>
      </button>
    </div>
    <p class="vocab-key-hint">按 1 选择「不会」· 按 2 选择「会了」</p>`;
  }

  function selectedOptionNote(question, feedback) {
    if (feedback.correct || feedback.selectedIndex === null) return "";
    const option = question.options[feedback.selectedIndex];
    if (!option || option.correct) return "";
    const owner = dataset.byId.get(option.ownerId);
    if (!owner) return "";
    return `你选的「${escapeHTML(option.meaning)}」是 <strong>${escapeHTML(owner.id)}</strong> 的主要含义。`;
  }

  function feedbackCopy(question, feedback) {
    const nextState = feedback.nextState;
    if (active.mode === "review") {
      if (feedback.correct) {
        return {
          title: "复习通过",
          text: `下次复习安排在 ${formatReviewDate(nextState.nextReviewAt)}。`,
        };
      }
      return {
        title: "已加入待复测",
        text: `${formatReviewDate(nextState.nextReviewAt)}后会再次出现在复习列表。`,
      };
    }
    if (feedback.correct) {
      if (question.phase === "first") {
        return { title: "答对了，进入「再见」", text: "下一次会收起例句，再选一次。" };
      }
      if (question.phase === "second") {
        return { title: "答对了，进入「最终」", text: "最后一次只看单词，凭记忆确认。" };
      }
      return {
        title: "本轮记忆完成",
        text: `第一次复习安排在 ${formatReviewDate(nextState.nextReviewAt)}。`,
      };
    }
    if (question.phase === "final") {
      return { title: "回到「未初见」", text: "这个词会从初见重新开始，稍后再完整走一轮。" };
    }
    return { title: "回到「未初见」", text: "这次没有选中主要含义，单词会重新从初见开始。" };
  }

  function feedbackMarkup(question, feedback) {
    const copy = feedbackCopy(question, feedback);
    const note = selectedOptionNote(question, feedback);
    const showExample = question.phase !== "first" && question.word.example;
    return `<div class="vocab-feedback ${feedback.correct ? "is-correct" : "is-wrong"}" role="status" aria-live="polite">
      <span class="vocab-feedback-icon">${icon(feedback.correct ? "checkCircle" : "alert", 21)}</span>
      <div class="vocab-feedback-copy">
        <strong>${copy.title}</strong>
        <p>${copy.text}</p>
        ${note ? `<p class="vocab-feedback-note">${note}</p>` : ""}
        <div class="vocab-feedback-answer">
          <span>主要含义</span>
          <strong>${escapeHTML(question.word.meaning)}</strong>
        </div>
        ${showExample ? `<p class="vocab-feedback-example">${highlightExample(question.word.example, question.word.id)}</p>` : ""}
      </div>
      <button type="button" class="btn btn-primary vocab-continue" data-vocab-continue>
        ${feedback.done ? "查看总结" : "继续"} ${icon("arrowRight", 15)}
      </button>
    </div>`;
  }

  function questionMarkup() {
    const question = active.question;
    if (!question) return "";
    const word = question.word;
    const feedback = active.feedback;
    const isFinal = question.phase === "final";
    const showMeta = !question.review && !isFinal;
    const showExample = !question.review && question.phase === "first";
    const stageLabel = question.review ? "复习 · 最终" : PHASE_LABELS[question.phase];
    const stageClass = question.review ? "is-review" : `is-${question.phase}`;
    const phonetic = word.phonetic ? `<span class="vocab-phonetic">/${escapeHTML(word.phonetic)}/</span>` : "";
    const category = word.category ? `<span class="vocab-category">${escapeHTML(word.category)}</span>` : "";
    return `<section class="vocab-study-card ${isFinal ? "is-final" : ""}">
      <div class="vocab-question-head">
        <span class="vocab-stage-badge ${stageClass}">${stageLabel}</span>
        <span class="vocab-question-hint">${questionHint(question)}</span>
      </div>
      <div class="vocab-word-row">
        <h1 class="vocab-word" lang="en">${escapeHTML(word.id)}</h1>
        <button type="button" class="vocab-speak" data-vocab-speak aria-label="朗读 ${escapeHTML(word.id)}">${icon("volume", 19)}</button>
      </div>
      ${showMeta ? `<div class="vocab-word-meta">${phonetic}${category}</div>` : ""}
      ${showExample ? `<figure class="vocab-example">
        <figcaption>${icon("bookOpen", 13)} EXAMPLE</figcaption>
        <blockquote>${highlightExample(word.example, word.id)}</blockquote>
      </figure>` : ""}
      ${isFinal ? (feedback ? "" : finalActionsMarkup()) : optionsMarkup(question, feedback)}
      ${feedback ? feedbackMarkup(question, feedback) : ""}
    </section>`;
  }

  function completionMarkup() {
    const progress = active.engine.progress();
    if (active.mode === "learn") {
      return `<section class="vocab-complete-card">
        <span class="vocab-complete-seal">${icon("checkCircle", 32)}</span>
        <span class="eyebrow">ROUND COMPLETE</span>
        <h1>本轮学习完成</h1>
        <p>本轮目标中的 ${progress.total} 个单词全部走到「最终」，没有留下仍在初见、再见或最终的词。</p>
        <div class="vocab-complete-stats">
          <div><strong>${progress.total}</strong><span>完成单词</span></div>
          <div><strong>${progress.answered}</strong><span>本轮作答</span></div>
          <div><strong>${progress.resets}</strong><span>回炉次数</span></div>
        </div>
        <p class="vocab-complete-note">这些词会从明天开始进入复习曲线，之后到期即可在复习中直接自评。</p>
        <div class="vocab-complete-actions">
          <button type="button" class="btn btn-primary" data-vocab-return>返回背单词 ${icon("arrowRight", 15)}</button>
        </div>
      </section>`;
    }
    return `<section class="vocab-complete-card">
      <span class="vocab-complete-seal is-review">${icon("repeat", 30)}</span>
      <span class="eyebrow">REVIEW COMPLETE</span>
      <h1>本轮复习完成</h1>
      <p>${progress.total} 个到期单词都已完成自评。</p>
      <div class="vocab-complete-stats">
        <div><strong>${progress.passed}</strong><span>复习通过</span></div>
        <div><strong>${progress.failed}</strong><span>待复测</span></div>
        <div><strong>${progress.total}</strong><span>本轮复习</span></div>
      </div>
      <p class="vocab-complete-note">选择「不会」的单词已安排 7 天后复测，届时会重新出现在复习列表。</p>
      <div class="vocab-complete-actions">
        <button type="button" class="btn btn-primary" data-vocab-return>返回背单词 ${icon("arrowRight", 15)}</button>
      </div>
    </section>`;
  }

  function renderSession() {
    if (!active || disposed) return;
    container.innerHTML = `<div class="page vocab-session-page">
      ${sessionTopMarkup()}
      ${active.finished ? completionMarkup() : questionMarkup()}
    </div>`;
    if (active.feedback) {
      const feedbackElement = container.querySelector(".vocab-feedback");
      const continueButton = container.querySelector("[data-vocab-continue]");
      requestAnimationFrame(() => {
        continueButton?.focus({ preventScroll: true });
        if (feedbackElement && window.innerWidth < 900) {
          feedbackElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }
  }

  async function handleClick(event) {
    if (event.target.closest("[data-vocab-retry]")) {
      init();
      return;
    }
    if (event.target.closest("[data-vocab-plan]")) {
      openPlanDialog();
      return;
    }
    if (event.target.closest("[data-vocab-license]")) {
      openLicenseDialog();
      return;
    }
    const start = event.target.closest("[data-vocab-start]");
    if (start) {
      if (start.dataset.vocabStart === "review") startReview();
      else startLearning();
      return;
    }
    if (!active) return;
    if (event.target.closest("[data-vocab-exit]")) {
      exitSession();
      return;
    }
    if (event.target.closest("[data-vocab-speak]")) {
      speak(active.question?.word.id);
      return;
    }
    if (event.target.closest("[data-vocab-continue]")) {
      continueSession();
      return;
    }
    if (event.target.closest("[data-vocab-return]")) {
      returnToLanding();
      return;
    }
    const option = event.target.closest("[data-vocab-option]");
    if (option && !active.feedback) {
      const index = Number(option.dataset.vocabOption);
      const selected = active.question?.options[index];
      if (selected) answerQuestion({ correct: selected.correct, selectedIndex: index });
      return;
    }
    const finalChoice = event.target.closest("[data-vocab-final]");
    if (finalChoice && !active.feedback) {
      answerQuestion({ correct: finalChoice.dataset.vocabFinal === "yes" });
    }
  }

  function handleKeydown(event) {
    if (!active || disposed || event.repeat) return;
    if (document.querySelector("dialog.modal[open]")) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    ) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      exitSession();
      return;
    }
    if (active.feedback) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        continueSession();
      }
      return;
    }
    const question = active.question;
    if (!question) return;
    if (question.phase === "final") {
      if (event.key === "1" || event.key === "ArrowLeft") {
        event.preventDefault();
        answerQuestion({ correct: false });
      } else if (event.key === "2" || event.key === "ArrowRight") {
        event.preventDefault();
        answerQuestion({ correct: true });
      }
      return;
    }
    const keys = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 };
    const index = keys[event.key.toLowerCase()];
    if (index === undefined) return;
    const option = question.options[index];
    if (!option) return;
    event.preventDefault();
    answerQuestion({ correct: option.correct, selectedIndex: index });
  }

  container.addEventListener("click", handleClick, { signal: controller.signal });
  document.addEventListener("keydown", handleKeydown, { signal: controller.signal });

  init();

  return () => {
    disposed = true;
    controller.abort();
    stopSpeech();
    active = null;
  };
}
