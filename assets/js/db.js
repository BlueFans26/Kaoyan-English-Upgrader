const DB_NAME = "yingyu-daguan";
const DB_VERSION = 3;
const RECORDS_STORE = "records";
const VOCAB_STATE_STORE = "vocabState";
const VOCAB_DAILY_STORE = "vocabDaily";
const PAPER_STATE_STORE = "paperStates";

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持本地数据库，无法保存学习记录。"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDS_STORE)) {
        const store = database.createObjectStore(RECORDS_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }
      if (!database.objectStoreNames.contains(VOCAB_STATE_STORE)) {
        const store = database.createObjectStore(VOCAB_STATE_STORE, { keyPath: "id" });
        store.createIndex("nextReviewAt", "nextReviewAt", { unique: false });
        store.createIndex("stage", "stage", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
      if (!database.objectStoreNames.contains(VOCAB_DAILY_STORE)) {
        database.createObjectStore(VOCAB_DAILY_STORE, { keyPath: "date" });
      }
      if (!database.objectStoreNames.contains(PAPER_STATE_STORE)) {
        database.createObjectStore(PAPER_STATE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地数据库。"));
    request.onblocked = () => reject(new Error("本地数据库被其他页面占用，请关闭其他标签页后重试。"));
  });
  return databasePromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地数据操作失败。"));
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("本地数据写入失败。"));
    transaction.onabort = () => reject(transaction.error || new Error("本地数据写入被中止。"));
  });
}

export async function listRecords() {
  const database = await openDatabase();
  const transaction = database.transaction(RECORDS_STORE, "readonly");
  const records = await requestToPromise(transaction.objectStore(RECORDS_STORE).getAll());
  return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function saveRecord(record) {
  const database = await openDatabase();
  const transaction = database.transaction(RECORDS_STORE, "readwrite");
  await requestToPromise(transaction.objectStore(RECORDS_STORE).put(record));
  return record;
}

export async function saveRecords(records) {
  if (!records.length) return;
  const database = await openDatabase();
  const transaction = database.transaction(RECORDS_STORE, "readwrite");
  const store = transaction.objectStore(RECORDS_STORE);
  for (const record of records) store.put(record);
  await transactionToPromise(transaction);
}

export async function deleteRecord(id) {
  const database = await openDatabase();
  const transaction = database.transaction(RECORDS_STORE, "readwrite");
  await requestToPromise(transaction.objectStore(RECORDS_STORE).delete(id));
}

export async function clearRecords() {
  const database = await openDatabase();
  const transaction = database.transaction(RECORDS_STORE, "readwrite");
  await requestToPromise(transaction.objectStore(RECORDS_STORE).clear());
}

export async function listVocabStates() {
  const database = await openDatabase();
  const transaction = database.transaction(VOCAB_STATE_STORE, "readonly");
  return requestToPromise(transaction.objectStore(VOCAB_STATE_STORE).getAll());
}

export async function saveVocabState(state) {
  const database = await openDatabase();
  const transaction = database.transaction(VOCAB_STATE_STORE, "readwrite");
  await requestToPromise(transaction.objectStore(VOCAB_STATE_STORE).put(state));
  return state;
}

export async function saveVocabStates(states) {
  if (!states.length) return;
  const database = await openDatabase();
  const transaction = database.transaction(VOCAB_STATE_STORE, "readwrite");
  const store = transaction.objectStore(VOCAB_STATE_STORE);
  for (const state of states) store.put(state);
  await transactionToPromise(transaction);
}

export async function listVocabDaily() {
  const database = await openDatabase();
  const transaction = database.transaction(VOCAB_DAILY_STORE, "readonly");
  return requestToPromise(transaction.objectStore(VOCAB_DAILY_STORE).getAll());
}

export async function countDueVocab(now = new Date()) {
  const database = await openDatabase();
  const transaction = database.transaction(VOCAB_STATE_STORE, "readonly");
  const index = transaction.objectStore(VOCAB_STATE_STORE).index("nextReviewAt");
  return requestToPromise(index.count(IDBKeyRange.upperBound(now.toISOString())));
}

export async function completeVocabWord(state, kind, dateKey) {
  const database = await openDatabase();
  const transaction = database.transaction([VOCAB_STATE_STORE, VOCAB_DAILY_STORE], "readwrite");
  transaction.objectStore(VOCAB_STATE_STORE).put(state);
  const dailyStore = transaction.objectStore(VOCAB_DAILY_STORE);
  const request = dailyStore.get(dateKey);
  request.onsuccess = () => {
    const entry = request.result || { date: dateKey, newWords: 0, reviews: 0, total: 0 };
    if (kind === "new") entry.newWords += 1;
    else entry.reviews += 1;
    entry.total = entry.newWords + entry.reviews;
    entry.updatedAt = new Date().toISOString();
    dailyStore.put(entry);
  };
  await transactionToPromise(transaction);
  return state;
}

export async function clearVocabData() {
  const database = await openDatabase();
  const transaction = database.transaction([VOCAB_STATE_STORE, VOCAB_DAILY_STORE], "readwrite");
  transaction.objectStore(VOCAB_STATE_STORE).clear();
  transaction.objectStore(VOCAB_DAILY_STORE).clear();
  await transactionToPromise(transaction);
}

export async function getPaperState(id) {
  const database = await openDatabase();
  const transaction = database.transaction(PAPER_STATE_STORE, "readonly");
  return requestToPromise(transaction.objectStore(PAPER_STATE_STORE).get(id));
}

export async function listPaperStates() {
  const database = await openDatabase();
  const transaction = database.transaction(PAPER_STATE_STORE, "readonly");
  return requestToPromise(transaction.objectStore(PAPER_STATE_STORE).getAll());
}

export async function savePaperState(state) {
  const database = await openDatabase();
  const transaction = database.transaction(PAPER_STATE_STORE, "readwrite");
  await requestToPromise(transaction.objectStore(PAPER_STATE_STORE).put(state));
  return state;
}

export async function clearPaperStates() {
  const database = await openDatabase();
  const transaction = database.transaction(PAPER_STATE_STORE, "readwrite");
  await requestToPromise(transaction.objectStore(PAPER_STATE_STORE).clear());
}
