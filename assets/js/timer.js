import { icon } from "./ui.js";

const STORAGE_KEY = "yingyu-daguan.answer-timer.v1";
const EDGE_GAP = 16;
const SNAP_DISTANCE = 34;
const HEARTBEAT_MS = 5000;

export const MIN_VALID_SECTION_MS = 5 * 60 * 1000;
export const PAPER_OVERTIME_MS = 100 * 60 * 1000;

let store = loadStore();
let widget = null;
let session = null;
let ticker = null;
let lastHeartbeat = 0;
let dragState = null;

function freshStore() {
  return { version: 1, position: null, objective: {}, subjective: {} };
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadStore() {
  const base = freshStore();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return base;
    if (raw.position && Number.isFinite(Number(raw.position.left)) && Number.isFinite(Number(raw.position.top))) {
      base.position = { left: Number(raw.position.left), top: Number(raw.position.top) };
    }
    if (raw.objective && typeof raw.objective === "object") {
      for (const [id, context] of Object.entries(raw.objective)) {
        if (!context || typeof context !== "object") continue;
        const sections = {};
        if (context.sections && typeof context.sections === "object") {
          for (const [key, value] of Object.entries(context.sections)) {
            sections[key] = { ms: Math.max(0, Number(value?.ms) || 0) };
          }
        }
        base.objective[id] = {
          startedAt: context.startedAt || null,
          running: false,
          activeSince: null,
          wholeMs: Math.max(0, Number(context.wholeMs) || 0),
          sections,
          activeKey: typeof context.activeKey === "string" ? context.activeKey : null,
          sectionEnabled: context.sectionEnabled !== false,
          updatedAt: context.updatedAt || null,
        };
      }
    }
    if (raw.subjective && typeof raw.subjective === "object") {
      for (const [key, context] of Object.entries(raw.subjective)) {
        if (!context || typeof context !== "object") continue;
        base.subjective[key] = {
          startedAt: context.startedAt || null,
          running: false,
          activeSince: null,
          ms: Math.max(0, Number(context.ms) || 0),
          updatedAt: context.updatedAt || null,
        };
      }
    }
  } catch {
    return base;
  }
  return base;
}

function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Timing still works in memory when storage is unavailable.
  }
}

function now() {
  return Date.now();
}

function ensureObjective(paperId) {
  if (!store.objective[paperId]) {
    store.objective[paperId] = {
      startedAt: null,
      running: false,
      activeSince: null,
      wholeMs: 0,
      sections: {},
      activeKey: null,
      sectionEnabled: true,
      updatedAt: null,
    };
  }
  return store.objective[paperId];
}

function ensureSubjective(subjectKey) {
  if (!store.subjective[subjectKey]) {
    store.subjective[subjectKey] = {
      startedAt: null,
      running: false,
      activeSince: null,
      ms: 0,
      updatedAt: null,
    };
  }
  return store.subjective[subjectKey];
}

function activeContext() {
  if (!session) return null;
  return session.kind === "objective"
    ? store.objective[session.id] || null
    : store.subjective[session.id] || null;
}

function deltaFor(context) {
  return context.running && Number.isFinite(context.activeSince)
    ? Math.max(0, now() - context.activeSince)
    : 0;
}

function commitContext(context) {
  const delta = deltaFor(context);
  if (!delta) {
    context.updatedAt = new Date().toISOString();
    return;
  }
  if ("ms" in context) {
    context.ms += delta;
  } else {
    context.wholeMs += delta;
    if (context.sectionEnabled && context.activeKey && context.sections[context.activeKey]) {
      context.sections[context.activeKey].ms += delta;
    }
  }
  context.activeSince = now();
  context.updatedAt = new Date().toISOString();
}

function objectiveSnapshot(context) {
  const delta = deltaFor(context);
  const sections = {};
  for (const [key, value] of Object.entries(context.sections)) {
    const extra = context.sectionEnabled && context.activeKey === key ? delta : 0;
    const durationMs = Math.round(value.ms + extra);
    sections[key] = {
      durationMs,
      valid: durationMs > 0 ? durationMs >= MIN_VALID_SECTION_MS : null,
    };
  }
  const totalMs = Math.round(context.wholeMs + delta);
  return {
    startedAt: context.startedAt,
    updatedAt: new Date().toISOString(),
    totalMs,
    totalValid: totalMs > 0 ? totalMs <= PAPER_OVERTIME_MS : null,
    sections,
  };
}

function subjectiveSnapshot(context) {
  const durationMs = Math.round(context.ms + deltaFor(context));
  return {
    startedAt: context.startedAt,
    updatedAt: new Date().toISOString(),
    durationMs,
    valid: context.startedAt ? durationMs >= MIN_VALID_SECTION_MS : null,
  };
}

function notifyCommit() {
  if (session?.kind !== "objective" || typeof session.onCommit !== "function") return;
  const context = store.objective[session.id];
  if (!context) return;
  try {
    session.onCommit(objectiveSnapshot(context));
  } catch (error) {
    console.error(error);
  }
}

export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDurationLabel(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours} 小时 ${minutes} 分`;
  if (minutes) return `${minutes} 分 ${seconds} 秒`;
  return `${seconds} 秒`;
}

function buildWidget() {
  if (widget || typeof document === "undefined") return;
  const root = document.createElement("section");
  root.className = "answer-timer";
  root.hidden = true;
  root.setAttribute("aria-label", "答题计时");
  root.innerHTML = `
    <header class="answer-timer-head" data-timer-drag title="拖动计时器">
      <span class="answer-timer-grip">${icon("grip", 15)}</span>
      <span class="answer-timer-heading">
        <strong data-timer-title>答题计时</strong>
        <small data-timer-subtitle></small>
      </span>
      <span class="answer-timer-state" data-timer-state><i></i><span data-timer-state-label>未开始</span></span>
    </header>
    <div class="answer-timer-body">
      <div class="answer-timer-row" data-timer-section-row>
        <span data-timer-section-label>本题</span>
        <strong data-timer-section>00:00</strong>
      </div>
      <div class="answer-timer-row is-whole" data-timer-whole-row>
        <span>整卷</span>
        <strong data-timer-whole>00:00</strong>
      </div>
    </div>
    <p class="answer-timer-warning" data-timer-warning hidden></p>
    <div class="answer-timer-foot">
      <button type="button" class="answer-timer-toggle" data-timer-toggle></button>
      <span class="answer-timer-hint">离开页面自动暂停</span>
    </div>`;
  document.body.appendChild(root);
  widget = {
    root,
    title: root.querySelector("[data-timer-title]"),
    subtitle: root.querySelector("[data-timer-subtitle]"),
    state: root.querySelector("[data-timer-state]"),
    stateLabel: root.querySelector("[data-timer-state-label]"),
    sectionRow: root.querySelector("[data-timer-section-row]"),
    wholeRow: root.querySelector("[data-timer-whole-row]"),
    sectionLabel: root.querySelector("[data-timer-section-label]"),
    sectionTime: root.querySelector("[data-timer-section]"),
    wholeTime: root.querySelector("[data-timer-whole]"),
    warning: root.querySelector("[data-timer-warning]"),
    toggle: root.querySelector("[data-timer-toggle]"),
    drag: root.querySelector("[data-timer-drag]"),
  };
  bindWidgetEvents();
  applyPosition();
}

function clampPosition(left, top) {
  if (!widget) return { left, top };
  const width = widget.root.offsetWidth || 218;
  const height = widget.root.offsetHeight || 150;
  const maxLeft = Math.max(8, window.innerWidth - width - EDGE_GAP);
  const maxTop = Math.max(8, window.innerHeight - height - EDGE_GAP);
  return {
    left: clampNumber(left, EDGE_GAP, maxLeft),
    top: clampNumber(top, EDGE_GAP, maxTop),
  };
}

function defaultPosition() {
  if (!widget) return { left: 16, top: 16 };
  const width = widget.root.offsetWidth || 218;
  const height = widget.root.offsetHeight || 150;
  return {
    left: EDGE_GAP,
    top: Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP),
  };
}

function applyPosition(position = store.position) {
  if (!widget) return;
  const next = clampPosition(
    Number.isFinite(position?.left) ? position.left : defaultPosition().left,
    Number.isFinite(position?.top) ? position.top : defaultPosition().top,
  );
  widget.root.style.left = `${Math.round(next.left)}px`;
  widget.root.style.top = `${Math.round(next.top)}px`;
}

function snapPosition(left, top) {
  if (!widget) return { left, top };
  const width = widget.root.offsetWidth || 218;
  const height = widget.root.offsetHeight || 150;
  let nextLeft = left;
  let nextTop = top;
  if (left <= SNAP_DISTANCE) nextLeft = EDGE_GAP;
  else if (window.innerWidth - (left + width) <= SNAP_DISTANCE) {
    nextLeft = window.innerWidth - width - EDGE_GAP;
  }
  if (top <= SNAP_DISTANCE) nextTop = EDGE_GAP;
  else if (window.innerHeight - (top + height) <= SNAP_DISTANCE) {
    nextTop = window.innerHeight - height - EDGE_GAP;
  }
  return clampPosition(nextLeft, nextTop);
}

function bindWidgetEvents() {
  widget.toggle.addEventListener("click", () => {
    const context = activeContext();
    if (!context) return;
    if (context.running) {
      pauseActiveTimer();
      return;
    }
    if (!context.startedAt) context.startedAt = new Date().toISOString();
    context.running = true;
    context.activeSince = now();
    context.updatedAt = new Date().toISOString();
    saveStore();
    ensureTicker();
    renderWidget();
  });

  widget.drag.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    event.preventDefault();
    const rect = widget.root.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    widget.drag.setPointerCapture?.(event.pointerId);
    widget.root.classList.add("is-dragging");
  });

  widget.drag.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    const next = clampPosition(
      dragState.left + event.clientX - dragState.startX,
      dragState.top + event.clientY - dragState.startY,
    );
    widget.root.style.left = `${Math.round(next.left)}px`;
    widget.root.style.top = `${Math.round(next.top)}px`;
  });

  const finishDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const snapped = snapPosition(
      Number.parseFloat(widget.root.style.left) || dragState.left,
      Number.parseFloat(widget.root.style.top) || dragState.top,
    );
    widget.root.style.left = `${Math.round(snapped.left)}px`;
    widget.root.style.top = `${Math.round(snapped.top)}px`;
    store.position = snapped;
    saveStore();
    dragState = null;
    widget.root.classList.remove("is-dragging");
  };

  widget.drag.addEventListener("pointerup", finishDrag);
  widget.drag.addEventListener("pointercancel", finishDrag);

  window.addEventListener("resize", () => {
    if (!widget || widget.root.hidden) return;
    applyPosition(store.position);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pauseActiveTimer();
  });
  window.addEventListener("pagehide", () => pauseActiveTimer());
}

export function initTimerWidget() {
  buildWidget();
}

function ensureTicker() {
  if (ticker || typeof window === "undefined") return;
  ticker = window.setInterval(() => {
    if (!session) return;
    const context = activeContext();
    if (!context?.running) return;
    renderWidget();
    if (now() - lastHeartbeat >= HEARTBEAT_MS) {
      commitContext(context);
      lastHeartbeat = now();
      saveStore();
    }
  }, 1000);
}

function stopTicker() {
  if (!ticker) return;
  window.clearInterval(ticker);
  ticker = null;
}

function sectionLabel(context) {
  if (session.kind === "subjective") return "作答";
  const part = session.parts?.find((entry) => entry.key === context.activeKey);
  if (!part) return "本题";
  return context.sectionEnabled ? part.label : `${part.label} · 已交`;
}

function renderWidget() {
  if (!widget) return;
  const context = activeContext();
  if (!session || !context) {
    widget.root.hidden = true;
    stopTicker();
    return;
  }
  widget.root.hidden = false;
  widget.title.textContent = session.kind === "objective" ? "答题计时" : "作答计时";
  widget.subtitle.textContent = session.title || "";
  widget.subtitle.title = session.title || "";
  const running = Boolean(context.running);
  widget.root.classList.toggle("is-running", running);
  widget.stateLabel.textContent = running ? "计时中" : context.startedAt ? "已暂停" : "未开始";
  widget.toggle.innerHTML = running
    ? `${icon("pause", 15)}<span>暂停</span>`
    : `${icon("play", 15)}<span>${context.startedAt ? "继续计时" : "开始计时"}</span>`;
  widget.toggle.classList.toggle("is-running", running);
  widget.wholeRow.hidden = session.kind !== "objective";

  let sectionMs = 0;
  let totalMs = 0;
  let sectionValid = null;
  let warning = "";
  let overtime = false;
  if (session.kind === "objective") {
    const snapshot = objectiveSnapshot(context);
    sectionMs = context.activeKey ? snapshot.sections[context.activeKey]?.durationMs || 0 : 0;
    sectionValid = context.activeKey ? snapshot.sections[context.activeKey]?.valid ?? null : null;
    totalMs = snapshot.totalMs;
    widget.sectionLabel.textContent = sectionLabel(context);
    widget.sectionTime.textContent = formatClock(sectionMs);
    widget.wholeTime.textContent = formatClock(totalMs);
    overtime = totalMs > PAPER_OVERTIME_MS;
    if (overtime) warning = "已超过 100 分钟，需注意考场时间分配。";
    else if (!context.startedAt) warning = "开始后本题与整卷分别计时。";
    else if (!running && sectionMs > 0 && sectionValid === false) {
      warning = "本题用时不足 5 分钟，可能为答案对照环节。";
    }
  } else {
    const snapshot = subjectiveSnapshot(context);
    totalMs = snapshot.durationMs;
    sectionValid = snapshot.valid;
    widget.sectionLabel.textContent = "作答";
    widget.sectionTime.textContent = formatClock(totalMs);
    if (!context.startedAt) warning = "点击开始计时，记录本次作答时间。";
    else if (!running && sectionValid === false) {
      warning = "本次作答不足 5 分钟，可能为答案对照环节。";
    }
  }
  widget.warning.hidden = !warning;
  widget.warning.textContent = warning;
  widget.warning.classList.toggle("is-overtime", overtime);
  widget.state.classList.toggle("is-running", running);
}

export function attachObjectiveTimer({
  paperId,
  title,
  activePartKey = null,
  sectionEnabled = true,
  parts = [],
  initialTiming = null,
  onCommit = null,
}) {
  initTimerWidget();
  if (!paperId) return;
  if (session && (session.kind !== "objective" || session.id !== paperId)) {
    pauseActiveTimer();
  }
  const context = ensureObjective(paperId);
  if (!context.startedAt && initialTiming?.startedAt) {
    context.startedAt = initialTiming.startedAt;
    context.wholeMs = Math.max(0, Number(initialTiming.totalMs) || 0);
    for (const [key, value] of Object.entries(initialTiming.sections || {})) {
      context.sections[key] = { ms: Math.max(0, Number(value?.durationMs) || 0) };
    }
  }
  for (const part of parts) {
    if (!context.sections[part.key]) context.sections[part.key] = { ms: 0 };
  }
  const nextKey = parts.some((part) => part.key === activePartKey) ? activePartKey : null;
  const nextEnabled = Boolean(nextKey) && sectionEnabled !== false;
  if (context.running && (context.activeKey !== nextKey || context.sectionEnabled !== nextEnabled)) {
    commitContext(context);
    context.activeSince = now();
  }
  context.activeKey = nextKey;
  context.sectionEnabled = nextEnabled;
  context.updatedAt = new Date().toISOString();
  session = {
    kind: "objective",
    id: paperId,
    title,
    parts,
    onCommit: typeof onCommit === "function" ? onCommit : null,
  };
  if (context.running) ensureTicker();
  else stopTicker();
  renderWidget();
  if (context.startedAt) notifyCommit();
  saveStore();
}

export function attachSubjectiveTimer({ subjectKey, title, onCommit = null }) {
  initTimerWidget();
  if (!subjectKey) return;
  if (session && (session.kind !== "subjective" || session.id !== subjectKey)) {
    pauseActiveTimer();
  }
  ensureSubjective(subjectKey);
  session = {
    kind: "subjective",
    id: subjectKey,
    title,
    parts: [],
    onCommit: typeof onCommit === "function" ? onCommit : null,
  };
  const context = store.subjective[subjectKey];
  if (context.running) ensureTicker();
  else stopTicker();
  renderWidget();
  saveStore();
}

export function detachTimer() {
  session = null;
  stopTicker();
  if (widget) widget.root.hidden = true;
}

export function pauseActiveTimer() {
  if (session) {
    const context = activeContext();
    if (context?.running) {
      commitContext(context);
      context.running = false;
      context.activeSince = null;
      context.updatedAt = new Date().toISOString();
      saveStore();
      notifyCommit();
    }
    stopTicker();
    renderWidget();
    return;
  }
  let changed = false;
  for (const context of [...Object.values(store.objective), ...Object.values(store.subjective)]) {
    if (!context.running) continue;
    commitContext(context);
    context.running = false;
    context.activeSince = null;
    context.updatedAt = new Date().toISOString();
    changed = true;
  }
  if (changed) saveStore();
}

export function getObjectiveSnapshot(paperId) {
  const context = store.objective[paperId];
  return context ? objectiveSnapshot(context) : null;
}

export function finalizeObjectiveTimer(paperId) {
  const context = store.objective[paperId];
  if (!context) return null;
  commitContext(context);
  const snapshot = objectiveSnapshot(context);
  delete store.objective[paperId];
  if (session?.kind === "objective" && session.id === paperId) {
    session = null;
    stopTicker();
    if (widget) widget.root.hidden = true;
  }
  saveStore();
  return snapshot;
}

export function finalizeSubjectiveTimer(subjectKey) {
  const context = store.subjective[subjectKey];
  if (!context) return { started: false, durationMs: null, valid: null, startedAt: null };
  commitContext(context);
  const snapshot = subjectiveSnapshot(context);
  delete store.subjective[subjectKey];
  if (session?.kind === "subjective" && session.id === subjectKey) {
    session = null;
    stopTicker();
    if (widget) widget.root.hidden = true;
  }
  saveStore();
  return {
    started: Boolean(context.startedAt),
    durationMs: context.startedAt ? snapshot.durationMs : null,
    valid: context.startedAt ? snapshot.valid : null,
    startedAt: context.startedAt,
  };
}

export function resetObjectiveSection(paperId, sectionKey) {
  const context = store.objective[paperId];
  if (!context || !sectionKey) return;
  commitContext(context);
  const removed = context.sections[sectionKey]?.ms || 0;
  if (context.sections[sectionKey]) context.sections[sectionKey].ms = 0;
  context.wholeMs = Math.max(0, context.wholeMs - removed);
  if (context.running) context.activeSince = now();
  context.updatedAt = new Date().toISOString();
  saveStore();
  notifyCommit();
  renderWidget();
}

export function clearObjectiveTimer(paperId) {
  if (!store.objective[paperId]) return;
  delete store.objective[paperId];
  if (session?.kind === "objective" && session.id === paperId) {
    session = null;
    stopTicker();
    if (widget) widget.root.hidden = true;
  }
  saveStore();
}

export const timer = {
  init: initTimerWidget,
  attachObjective: attachObjectiveTimer,
  attachSubjective: attachSubjectiveTimer,
  detach: detachTimer,
  pause: pauseActiveTimer,
  getObjectiveSnapshot,
  finalizeObjective: finalizeObjectiveTimer,
  finalizeSubjective: finalizeSubjectiveTimer,
  resetObjectiveSection,
  clearObjective: clearObjectiveTimer,
};
