export const EXAM_SUBJECT_KEY = "yingyu-daguan.exam.subject.v1";
export const DEFAULT_EXAM_SUBJECT = "english2";

export const EXAM_SUBJECTS = {
  english1: {
    key: "english1",
    label: "英语一",
    name: "英语（一）",
    short: "英一",
    exam: "英语一",
    suffix: "1",
  },
  english2: {
    key: "english2",
    label: "英语二",
    name: "英语（二）",
    short: "英二",
    exam: "英语二",
    suffix: "2",
  },
};

export function normalizeExamSubject(value) {
  return value === "english1" || value === "english2" ? value : DEFAULT_EXAM_SUBJECT;
}

export function loadExamSubject() {
  try {
    return normalizeExamSubject(localStorage.getItem(EXAM_SUBJECT_KEY));
  } catch {
    return DEFAULT_EXAM_SUBJECT;
  }
}

export function saveExamSubject(value) {
  const subjectKey = normalizeExamSubject(value);
  try {
    localStorage.setItem(EXAM_SUBJECT_KEY, subjectKey);
  } catch {
    // Storage may be unavailable in private modes; the in-memory setting still works.
  }
  return subjectKey;
}

export function examSubjectMeta(value) {
  return EXAM_SUBJECTS[normalizeExamSubject(value)];
}

export function paperIdFor(year, subjectKey) {
  return `${Number(year)}-${EXAM_SUBJECTS[normalizeExamSubject(subjectKey)].suffix}`;
}

const MANIFEST_URL = new URL("../data/papers/index.json", import.meta.url);
const PAPER_URL = (id) => new URL(`../data/papers/${id}.json`, import.meta.url);
let manifestPromise = null;
const paperPromises = new Map();

function assertPaperPayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.papers)) {
    throw new Error("客观题索引格式不正确。");
  }
  return payload;
}

export function loadPaperManifest({ force = false } = {}) {
  if (force) manifestPromise = null;
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`客观题索引读取失败（HTTP ${response.status}）。`);
        return response.json();
      })
      .then(assertPaperPayload)
      .catch((error) => {
        manifestPromise = null;
        throw error;
      });
  }
  return manifestPromise;
}

export function papersForSubject(manifest, subjectKey) {
  const meta = examSubjectMeta(subjectKey);
  return (manifest?.papers || [])
    .filter((paper) => paper.subjectKey === meta.key)
    .sort((a, b) => b.year - a.year);
}

export function findPaperMeta(manifest, id) {
  return (manifest?.papers || []).find((paper) => paper.id === id) || null;
}

export async function loadPaper(id) {
  if (!/^\d{4}-[12]$/.test(String(id || ""))) {
    throw new Error("真题编号不正确。");
  }
  if (!paperPromises.has(id)) {
    const promise = fetch(PAPER_URL(id))
      .then((response) => {
        if (!response.ok) throw new Error(`真题读取失败（HTTP ${response.status}）。`);
        return response.json();
      })
      .then((payload) => {
        if (!payload || payload.id !== id || !Array.isArray(payload.parts)) {
          throw new Error("真题文件格式不正确。");
        }
        return payload;
      })
      .catch((error) => {
        paperPromises.delete(id);
        throw error;
      });
    paperPromises.set(id, promise);
  }
  return paperPromises.get(id);
}
