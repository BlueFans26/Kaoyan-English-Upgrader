import { isApiConfigured, loadApiConfig } from "./api.js";
import { countDueVocab, deleteRecord, listRecords, saveRecord } from "./db.js";
import { SUBJECTS } from "./data.js";
import {
  examSubjectMeta,
  loadExamSubject,
  normalizeExamSubject,
  saveExamSubject,
} from "./papers.js";
import { escapeHTML, isTouchDevice } from "./utils.js";
import { icon, toast } from "./ui.js";
import { openSettings } from "./settings.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderGrade } from "./views/grade.js";
import { renderPapers } from "./views/papers.js";
import { renderPractice } from "./views/practice.js";
import { renderVocabulary } from "./views/vocabulary.js";

const root = document.getElementById("app");
const state = {
  records: [],
  config: loadApiConfig(),
  drafts: {},
  isTouch: isTouchDevice(),
  vocabDue: 0,
  examSubject: loadExamSubject(),
};
let activeRoute = null;
let activeCleanup = null;

const app = {
  state,
  navigate,
  refreshRoute,
  refreshVocabDue,
  openSettings: () => openSettings(app),
  setConfig,
  setExamSubject,
  persistRecord,
  removeRecord,
  reloadRecords,
};

function shellMarkup() {
  return `<a class="skip-link" href="#page-content">跳到主要内容</a>
    <div class="mobile-topbar">
      <button type="button" class="icon-btn mobile-menu-button" data-nav-toggle aria-label="打开导航菜单" aria-expanded="false" aria-controls="app-sidebar">${icon("menu", 21)}</button>
      <a class="mobile-brand" href="#/overview">
        <span class="mini-mark">研</span>
        <span>考研英语综合备考站</span>
      </a>
      <button type="button" class="icon-btn" data-open-settings aria-label="打开设置">${icon("settings", 19)}</button>
    </div>
    <div class="sidebar-backdrop" data-nav-close aria-hidden="true"></div>
    <aside class="sidebar" id="app-sidebar">
      <a class="brand" href="#/overview" aria-label="考研英语综合备考站首页">
        <span class="brand-mark">研</span>
        <span class="brand-copy">
          <strong>考研英语综合备考站</strong>
          <small>AI GRADING STUDIO</small>
        </span>
      </a>
      <div class="sidebar-scroll">
        <nav class="main-nav" aria-label="主导航">
          <a href="#/overview" class="nav-link nav-overview" data-nav="overview">
            <span class="nav-icon">${icon("overview", 18)}</span>
            <span>学习总览</span>
            <span class="nav-active-mark"></span>
          </a>
          <div class="nav-group">
            <span class="nav-group-label">词汇 VOCABULARY</span>
            <a href="#/vocabulary" class="nav-link" data-nav="vocabulary">
              <span class="nav-icon">${icon("cards", 18)}</span><span>背单词</span><span class="nav-count" data-vocab-due></span><span class="nav-active-mark"></span>
            </a>
          </div>
          <div class="nav-group">
            <span class="nav-group-label">真题 PAPERS</span>
            <a href="#/papers" class="nav-link" data-nav="papers">
              <span class="nav-icon">${icon("target", 18)}</span><span>客观题真题</span><span class="nav-subject" data-exam-subject>${escapeHTML(examSubjectMeta(state.examSubject).short)}</span><span class="nav-active-mark"></span>
            </a>
          </div>
          <div class="nav-group">
            <span class="nav-group-label">批改 GRADING</span>
            <a href="#/grade/translation" class="nav-link" data-nav="grade-translation">
              <span class="nav-icon">${icon("languages", 18)}</span><span>翻译批改</span><span class="nav-active-mark"></span>
            </a>
            <a href="#/grade/letter" class="nav-link" data-nav="grade-letter">
              <span class="nav-icon">${icon("pen", 18)}</span><span>小作文批改</span><span class="nav-active-mark"></span>
            </a>
            <a href="#/grade/essay" class="nav-link" data-nav="grade-essay">
              <span class="nav-icon">${icon("fileText", 18)}</span><span>大作文批改</span><span class="nav-active-mark"></span>
            </a>
          </div>
          <div class="nav-group">
            <span class="nav-group-label">练习 REVIEW</span>
            <a href="#/practice/translation" class="nav-link" data-nav="practice-translation">
              <span class="nav-icon">${icon("bookOpen", 18)}</span><span>翻译练习</span><span class="nav-count" data-nav-count="translation"></span><span class="nav-active-mark"></span>
            </a>
            <a href="#/practice/letter" class="nav-link" data-nav="practice-letter">
              <span class="nav-icon">${icon("bookOpen", 18)}</span><span>小作文练习</span><span class="nav-count" data-nav-count="letter"></span><span class="nav-active-mark"></span>
            </a>
            <a href="#/practice/essay" class="nav-link" data-nav="practice-essay">
              <span class="nav-icon">${icon("bookOpen", 18)}</span><span>大作文练习</span><span class="nav-count" data-nav-count="essay"></span><span class="nav-active-mark"></span>
            </a>
          </div>
        </nav>
      </div>
      <div class="sidebar-foot">
        <button type="button" class="sidebar-api" data-open-settings data-api-status>
          <span class="status-dot"></span>
          <span class="sidebar-api-copy">
            <strong data-api-label>AI 接口未配置</strong>
            <small data-api-hint>点击配置模型接口</small>
          </span>
          ${icon("chevronRight", 15)}
        </button>
        <button type="button" class="sidebar-settings" data-open-settings>${icon("settings", 16)}<span>设置与本地数据</span></button>
        <p class="local-note">${icon("database", 13)} 离线可用 · 数据仅保存在本机</p>
        <a class="local-note local-source" href="https://github.com/serendipity0526/Kaoyan-English-Upgrader" target="_blank" rel="noopener">源代码 · AGPL-3.0</a>
      </div>
    </aside>
    <main class="main-content">
      <div class="content-container" id="page-content">
        <div class="page-loading"><span class="loading-orbit"></span><p>正在打开学习空间…</p></div>
      </div>
    </main>`;
}

function updateApiStatus() {
  const status = root.querySelector("[data-api-status]");
  const label = root.querySelector("[data-api-label]");
  const hint = root.querySelector("[data-api-hint]");
  const configured = isApiConfigured(state.config);
  status?.classList.toggle("is-on", configured);
  if (label) label.textContent = configured ? "AI 接口已就绪" : "AI 接口未配置";
  if (hint) hint.textContent = configured ? `${state.config.model} · 点击修改` : "点击配置模型接口";
}

function updateNavCounts() {
  ["translation", "letter", "essay"].forEach((type) => {
    const count = state.records.filter((record) => record.type === type).length;
    root.querySelectorAll(`[data-nav-count="${type}"]`).forEach((element) => {
      element.textContent = count ? String(count) : "";
      element.classList.toggle("is-empty", count === 0);
    });
  });
}

function updateVocabDueBadge() {
  const count = Number(state.vocabDue) || 0;
  root.querySelectorAll("[data-vocab-due]").forEach((element) => {
    element.textContent = count > 99 ? "99+" : count ? String(count) : "";
    element.classList.toggle("is-empty", count === 0);
    element.setAttribute("title", count ? `${count} 个单词待复习` : "");
  });
}

function updateExamSubjectBadge() {
  const meta = examSubjectMeta(state.examSubject);
  root.querySelectorAll("[data-exam-subject]").forEach((element) => {
    element.textContent = meta.short;
    element.setAttribute("title", `当前备考科目：${meta.name}`);
  });
}

async function refreshVocabDue() {
  try {
    state.vocabDue = await countDueVocab();
  } catch (error) {
    console.error(error);
    state.vocabDue = 0;
  }
  updateVocabDueBadge();
}

function updateChrome() {
  updateApiStatus();
  updateNavCounts();
  updateVocabDueBadge();
  updateExamSubjectBadge();
}

function resolveRoute() {
  const raw = location.hash.replace(/^#/, "") || "/overview";
  const [pathPart, queryPart = ""] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(queryPart));
  if (!segments.length || segments[0] === "overview") return { name: "overview", path: "/overview" };
  if (segments[0] === "vocabulary") return { name: "vocabulary", path: "/vocabulary" };
  if (segments[0] === "papers") return { name: "papers", path: "/papers", params };
  if (segments[0] === "grade" && SUBJECTS[segments[1]]) {
    return { name: "grade", subjectKey: segments[1], path: `/grade/${segments[1]}`, params };
  }
  if (segments[0] === "practice" && SUBJECTS[segments[1]]) {
    return { name: "practice", subjectKey: segments[1], path: `/practice/${segments[1]}`, params };
  }
  return { name: "overview", path: "/overview", invalid: true };
}

function updateActiveNav(route) {
  const activeKey =
    route.name === "overview"
      ? "overview"
      : route.name === "vocabulary"
        ? "vocabulary"
        : route.name === "papers"
          ? "papers"
          : `${route.name}-${route.subjectKey}`;
  root.querySelectorAll(".nav-link").forEach((link) => {
    const isActive = link.dataset.nav === activeKey;
    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function closeMobileNav() {
  document.body.classList.remove("nav-open");
  const toggle = root.querySelector("[data-nav-toggle]");
  toggle?.setAttribute("aria-expanded", "false");
}

function renderRoute({ scroll = true } = {}) {
  const route = resolveRoute();
  if (route.invalid) {
    history.replaceState(null, "", "#/overview");
    route.path = "/overview";
  }
  activeRoute = route;
  activeCleanup?.();
  activeCleanup = null;
  updateActiveNav(route);
  closeMobileNav();
  const page = root.querySelector("#page-content");
  const subject = route.subjectKey ? SUBJECTS[route.subjectKey] : null;
  document.title =
    route.name === "overview"
      ? "考研英语综合备考站 · 学习总览"
      : route.name === "vocabulary"
        ? "背单词 · 考研英语综合备考站"
        : route.name === "papers"
          ? "客观题真题 · 考研英语综合备考站"
          : route.name === "grade"
            ? `${subject.gradeTitle} · 考研英语综合备考站`
            : `${subject.practiceTitle} · 考研英语综合备考站`;

  try {
    if (route.name === "overview") {
      activeCleanup = renderDashboard(page, app);
    } else if (route.name === "vocabulary") {
      activeCleanup = renderVocabulary(page, app);
    } else if (route.name === "papers") {
      activeCleanup = renderPapers(page, app, route.params);
    } else if (route.name === "grade") {
      activeCleanup = renderGrade(page, app, route.subjectKey);
    } else if (route.name === "practice") {
      activeCleanup = renderPractice(page, app, route.subjectKey, route.params);
    }
  } catch (error) {
    console.error(error);
    page.innerHTML = `<div class="page"><div class="fatal-state">
      <span>${icon("alert", 28)}</span>
      <h1>页面加载失败</h1>
      <p>${escapeHTML(error?.message || "发生未知错误。")}</p>
      <button type="button" class="btn btn-primary" data-reload-app>重新加载</button>
    </div></div>`;
    page.querySelector("[data-reload-app]")?.addEventListener("click", () => location.reload());
  }
  if (scroll) window.scrollTo({ top: 0, behavior: "auto" });
}

function navigate(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (location.hash === `#${normalized}`) {
    renderRoute({ scroll: false });
  } else {
    location.hash = normalized;
  }
}

function refreshRoute() {
  renderRoute({ scroll: false });
}

async function setConfig(nextConfig) {
  state.config = nextConfig;
  updateApiStatus();
  if (activeRoute?.name === "grade" || activeRoute?.name === "overview") {
    renderRoute({ scroll: false });
  }
}

function setExamSubject(nextSubject) {
  state.examSubject = saveExamSubject(normalizeExamSubject(nextSubject));
  updateExamSubjectBadge();
  if (activeRoute?.name === "papers") renderRoute({ scroll: false });
}

async function persistRecord(record) {
  await saveRecord(record);
  state.records.push(record);
  state.records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  updateChrome();
}

async function removeRecord(id) {
  await deleteRecord(id);
  state.records = state.records.filter((record) => record.id !== id);
  updateChrome();
}

async function reloadRecords() {
  state.records = await listRecords();
  updateChrome();
  renderRoute({ scroll: false });
}

function bindShellEvents() {
  document.addEventListener("click", (event) => {
    const settingsTrigger = event.target.closest("[data-open-settings]");
    if (settingsTrigger) {
      event.preventDefault();
      closeMobileNav();
      app.openSettings();
      return;
    }
    if (event.target.closest("[data-nav-toggle]")) {
      const isOpen = document.body.classList.toggle("nav-open");
      root.querySelector("[data-nav-toggle]")?.setAttribute("aria-expanded", String(isOpen));
      return;
    }
    if (event.target.closest("[data-nav-close]") || event.target.closest(".main-nav a")) {
      closeMobileNav();
      return;
    }
    const navLink = event.target.closest(".nav-link");
    if (navLink) closeMobileNav();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileNav();
  });
  window.addEventListener("hashchange", () => renderRoute());
}

async function boot() {
  root.innerHTML = shellMarkup();
  bindShellEvents();
  updateApiStatus();
  try {
    state.records = await listRecords();
  } catch (error) {
    console.error(error);
    toast(error?.message || "读取本地记录失败。", "error");
  }
  updateNavCounts();
  refreshVocabDue();
  if (!location.hash) history.replaceState(null, "", "#/overview");
  renderRoute();
  if ("serviceWorker" in navigator && ["http:", "https:"].includes(location.protocol)) {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  }
}

boot();
