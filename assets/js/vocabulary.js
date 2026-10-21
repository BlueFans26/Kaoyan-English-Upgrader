import { listVocabDaily, listVocabStates } from "./db.js";
import { clamp, formatDayKey } from "./utils.js";

export const VOCAB_PLAN_KEY = "yingyu-daguan.vocab.plan.v1";
export const MIN_DAILY_NEW = 1;
export const MAX_DAILY_NEW = 200;
export const DEFAULT_DAILY_NEW = 30;
export const VOCAB_ORDER_SEQUENTIAL = "sequential";
export const VOCAB_ORDER_RANDOM = "random";

const FIRST_REVIEW_DAYS = 1;
const REVIEW_FAIL_DAYS = 7;
const REVIEW_INTERVALS = [3, 7, 15, 30, 60, 90, 180];

let vocabularyPromise;

function normalizeDailyNew(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return DEFAULT_DAILY_NEW;
  return clamp(number, MIN_DAILY_NEW, MAX_DAILY_NEW);
}

export function normalizeVocabOrder(value) {
  return value === VOCAB_ORDER_RANDOM ? VOCAB_ORDER_RANDOM : VOCAB_ORDER_SEQUENTIAL;
}

export function loadVocabPlan() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VOCAB_PLAN_KEY) || "null");
    return {
      dailyNew: normalizeDailyNew(parsed?.dailyNew),
      order: normalizeVocabOrder(parsed?.order),
    };
  } catch {
    return { dailyNew: DEFAULT_DAILY_NEW, order: VOCAB_ORDER_SEQUENTIAL };
  }
}

export function saveVocabPlan({ dailyNew, order }) {
  const plan = {
    version: 2,
    dailyNew: normalizeDailyNew(dailyNew),
    order: normalizeVocabOrder(order),
  };
  localStorage.setItem(VOCAB_PLAN_KEY, JSON.stringify(plan));
  return plan;
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function pickRandomNewWords(words, limit) {
  const pool = [...words];
  const count = Math.min(pool.length, Math.max(0, Math.floor(Number(limit) || 0)));
  for (let index = 0; index < count; index += 1) {
    const swapIndex = index + Math.floor(Math.random() * (pool.length - index));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

export function loadVocabulary() {
  if (vocabularyPromise) return vocabularyPromise;
  vocabularyPromise = fetch("./assets/data/vocabulary.json")
    .then((response) => {
      if (!response.ok) throw new Error(`词库加载失败（HTTP ${response.status}）。`);
      return response.json();
    })
    .then((payload) => {
      const rawWords = Array.isArray(payload?.words) ? payload.words : [];
      if (!rawWords.length) throw new Error("词库文件为空，请重新获取完整项目文件。");
      const entries = rawWords.map((row, index) => ({
        id: String(row?.[0] ?? "").trim(),
        phonetic: String(row?.[1] ?? "").trim(),
        meaning: String(row?.[2] ?? "").trim(),
        example: String(row?.[3] ?? "").trim(),
        category: String(row?.[4] ?? "").trim(),
        sentenceId: row?.[6] ?? null,
        distractorIndexes: Array.isArray(row?.[5]) ? row[5] : [],
        index,
      }));
      entries.forEach((entry, index) => {
        const seen = new Set();
        entry.distractorIds = entry.distractorIndexes
          .map((target) => entries[target]?.id)
          .filter((id) => {
            if (!id || id === entry.id || seen.has(id)) return false;
            seen.add(id);
            return true;
          });
      });
      const validEntries = entries.filter((entry) => entry.id && entry.meaning);
      const orderedWords = [...validEntries].sort((a, b) =>
        a.id.localeCompare(b.id, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id),
      );
      const byId = new Map(validEntries.map((entry) => [entry.id, entry]));
      return {
        version: payload.version || 1,
        generatedAt: payload.generatedAt || "",
        source: payload.source || {},
        total: validEntries.length,
        words: validEntries,
        orderedWords,
        byId,
      };
    })
    .catch((error) => {
      vocabularyPromise = null;
      throw error;
    });
  return vocabularyPromise;
}

export function buildOptions(dataset, word) {
  const seenMeanings = new Set([word.meaning]);
  const options = [{ meaning: word.meaning, ownerId: word.id, correct: true }];
  for (const distractorId of word.distractorIds || []) {
    const candidate = dataset.byId.get(distractorId);
    if (!candidate || candidate.id === word.id) continue;
    if (seenMeanings.has(candidate.meaning)) continue;
    seenMeanings.add(candidate.meaning);
    options.push({ meaning: candidate.meaning, ownerId: candidate.id, correct: false });
    if (options.length === 4) break;
  }
  if (options.length < 4) {
    const list = dataset.orderedWords;
    const start = list.length ? word.index % list.length : 0;
    for (let offset = 0; offset < list.length && options.length < 4; offset += 1) {
      const candidate = list[(start + offset) % list.length];
      if (!candidate || candidate.id === word.id || seenMeanings.has(candidate.meaning)) continue;
      seenMeanings.add(candidate.meaning);
      options.push({ meaning: candidate.meaning, ownerId: candidate.id, correct: false });
    }
  }
  return shuffle(options);
}

export function createVocabState(id, now = new Date()) {
  const timestamp = new Date(now).toISOString();
  return {
    version: 1,
    id,
    stage: 0,
    status: "learning",
    attempts: 0,
    reviewCount: 0,
    lapses: 0,
    learnedAt: null,
    lastReviewedAt: null,
    nextReviewAt: null,
    lastResult: null,
    lastSeenAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function addDays(now, days) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function applyLearningAnswer(state, askedStage, correct, now = new Date()) {
  const timestamp = new Date(now).toISOString();
  const next = {
    ...state,
    attempts: (state.attempts || 0) + 1,
    lastSeenAt: timestamp,
    updatedAt: timestamp,
    lastResult: correct ? "pass" : "fail",
    status: "learning",
    nextReviewAt: null,
  };
  if (!correct) {
    next.stage = 0;
    return { state: next, completed: false };
  }
  if (askedStage >= 2) {
    next.stage = 3;
    next.status = "review";
    next.learnedAt = state.learnedAt || timestamp;
    next.reviewCount = state.reviewCount || 0;
    next.lastReviewedAt = null;
    next.nextReviewAt = addDays(now, FIRST_REVIEW_DAYS);
    return { state: next, completed: true };
  }
  next.stage = askedStage + 1;
  return { state: next, completed: false };
}

export function applyReviewAnswer(state, passed, now = new Date()) {
  const timestamp = new Date(now).toISOString();
  const next = {
    ...state,
    stage: 3,
    attempts: (state.attempts || 0) + 1,
    lastSeenAt: timestamp,
    lastReviewedAt: timestamp,
    updatedAt: timestamp,
    learnedAt: state.learnedAt || timestamp,
    lastResult: passed ? "pass" : "fail",
  };
  if (passed) {
    next.status = "review";
    next.reviewCount = (state.reviewCount || 0) + 1;
    next.nextReviewAt = addDays(
      now,
      REVIEW_INTERVALS[Math.min(next.reviewCount - 1, REVIEW_INTERVALS.length - 1)],
    );
  } else {
    next.status = "retest";
    next.reviewCount = state.reviewCount || 0;
    next.lapses = (state.lapses || 0) + 1;
    next.nextReviewAt = addDays(now, REVIEW_FAIL_DAYS);
  }
  return next;
}

export function isVocabDue(state, now = Date.now()) {
  if (!state?.nextReviewAt) return false;
  if (state.status !== "review" && state.status !== "retest") return false;
  const dueAt = new Date(state.nextReviewAt).getTime();
  return Number.isFinite(dueAt) && dueAt <= now;
}

export function buildVocabDays(dailyEntries, dayCount = 7, now = new Date()) {
  const byDate = new Map(dailyEntries.map((entry) => [entry.date, entry]));
  const days = [];
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = formatDayKey(date);
    const entry = byDate.get(key);
    days.push({
      date: key,
      label: offset === 0 ? "今天" : `${date.getMonth() + 1}/${date.getDate()}`,
      newWords: Number(entry?.newWords) || 0,
      reviews: Number(entry?.reviews) || 0,
      total: Number(entry?.total) || 0,
    });
  }
  return days;
}

export function todayVocabEntry(dailyEntries, now = new Date()) {
  const key = formatDayKey(now);
  return dailyEntries.find((entry) => entry.date === key) || null;
}

export function planRemainingFor(plan, dailyEntries, now = new Date()) {
  const today = todayVocabEntry(dailyEntries, now);
  return Math.max(0, plan.dailyNew - (Number(today?.newWords) || 0));
}

export async function loadVocabSnapshot() {
  const [states, daily] = await Promise.all([listVocabStates(), listVocabDaily()]);
  return {
    states,
    stateById: new Map(states.map((state) => [state.id, state])),
    daily,
    dailyByDate: new Map(daily.map((entry) => [entry.date, entry])),
  };
}

export function formatReviewDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
