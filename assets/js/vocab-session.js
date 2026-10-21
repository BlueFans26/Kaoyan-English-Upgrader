import { applyReviewAnswer, isVocabDue } from "./vocabulary.js";

const INITIAL_BURST = 4;
const CADENCE = ["new", "new", "second", "new", "final"];
const MIN_GAP = 2;

export class LearningSession {
  constructor({ words, stateById, makeOptions }) {
    this.mode = "learn";
    this.makeOptions = makeOptions;
    this.entries = words
      .map((word) => {
        const state = stateById.get(word.id);
        const stage = Math.min(Math.max(Number(state?.stage) || 0, 0), 3);
        return { word, stage, lastStep: -10 };
      })
      .filter((entry) => entry.stage < 3);
    this.total = this.entries.length;
    this.completed = 0;
    this.step = 0;
    this.resets = 0;
    this.current = null;
    this.lastId = null;
  }

  get done() {
    return this.completed >= this.total;
  }

  queueStats() {
    let first = 0;
    let second = 0;
    let final = 0;
    for (const entry of this.entries) {
      if (entry.stage === 0) first += 1;
      else if (entry.stage === 1) second += 1;
      else if (entry.stage === 2) final += 1;
    }
    return { first, second, final };
  }

  pick(type) {
    const allowed = (stage) =>
      this.entries.filter(
        (entry) =>
          entry.stage === stage &&
          entry.word.id !== this.lastId &&
          (stage === 0 || this.step - entry.lastStep >= MIN_GAP),
      );
    const choose = (stages) => {
      for (const stage of stages) {
        const pool = allowed(stage);
        if (pool.length) {
          return [...pool].sort((a, b) => a.lastStep - b.lastStep)[0];
        }
      }
      return null;
    };
    const primary = type === "new" ? [0] : type === "second" ? [1] : [2];
    const fallback = type === "new" ? [0, 1, 2] : type === "second" ? [1, 2, 0] : [2, 1, 0];
    let entry = choose(primary);
    if (!entry) entry = choose(fallback);
    if (!entry) {
      const any = this.entries.filter((item) => item.stage < 3 && item.word.id !== this.lastId);
      const pool = any.length ? any : this.entries.filter((item) => item.stage < 3);
      entry = [...pool].sort((a, b) => a.lastStep - b.lastStep)[0] || null;
    }
    return entry;
  }

  next() {
    if (this.current) return this.current.question;
    if (this.done) return null;
    const type =
      this.step < INITIAL_BURST
        ? "new"
        : CADENCE[(this.step - INITIAL_BURST) % CADENCE.length];
    const entry = this.pick(type);
    if (!entry) return null;
    entry.lastStep = this.step;
    this.lastId = entry.word.id;
    const stage = entry.stage;
    const question = {
      word: entry.word,
      stage,
      phase: stage === 0 ? "first" : stage === 1 ? "second" : "final",
      options: stage < 2 ? this.makeOptions(entry.word) : [],
      sequence: this.step + 1,
    };
    this.step += 1;
    this.current = { entry, question };
    return question;
  }

  answer(correct) {
    if (!this.current) return null;
    const { entry, question } = this.current;
    const fromStage = entry.stage;
    if (!correct) {
      entry.stage = 0;
      this.resets += 1;
    } else if (fromStage >= 2) {
      entry.stage = 3;
      this.completed += 1;
    } else {
      entry.stage = fromStage + 1;
    }
    this.current = null;
    return {
      word: entry.word,
      correct,
      fromStage,
      stage: entry.stage,
      completed: entry.stage === 3,
    };
  }

  progress() {
    return {
      completed: this.completed,
      total: this.total,
      answered: this.step,
      resets: this.resets,
      ...this.queueStats(),
    };
  }
}

export class ReviewSession {
  constructor({ words, stateById, now = new Date() }) {
    this.mode = "review";
    this.entries = words
      .map((word) => ({ word, state: stateById.get(word.id) }))
      .filter((entry) => entry.state && isVocabDue(entry.state, now.getTime()))
      .sort((a, b) => new Date(a.state.nextReviewAt) - new Date(b.state.nextReviewAt));
    this.total = this.entries.length;
    this.answered = 0;
    this.passed = 0;
    this.failed = 0;
    this.index = 0;
    this.current = null;
  }

  get done() {
    return this.answered >= this.total;
  }

  next() {
    if (this.current) return this.current.question;
    if (this.index >= this.entries.length) return null;
    const entry = this.entries[this.index];
    this.index += 1;
    const question = {
      word: entry.word,
      phase: "final",
      options: [],
      review: true,
      sequence: this.index,
    };
    this.current = { entry, question };
    return question;
  }

  answer(passed, now = new Date()) {
    if (!this.current) return null;
    const { entry } = this.current;
    const state = applyReviewAnswer(entry.state, passed, now);
    entry.state = state;
    this.answered += 1;
    if (passed) this.passed += 1;
    else this.failed += 1;
    this.current = null;
    return {
      word: entry.word,
      state,
      passed,
      done: this.done,
    };
  }

  progress() {
    return {
      answered: this.answered,
      total: this.total,
      passed: this.passed,
      failed: this.failed,
    };
  }
}
