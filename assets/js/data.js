import { PROMPTS } from "./prompts.js";
import { EXAM_MATERIALS } from "./exams.js";

export const SUBJECT_ORDER = ["translation", "letter", "essay"];

export const SUBJECTS = {
  translation: {
    key: "translation",
    label: "翻译",
    navLabel: "翻译批改",
    practiceLabel: "翻译练习",
    gradeTitle: "翻译批改",
    practiceTitle: "翻译练习",
    eyebrow: "TRANSLATION",
    total: 15,
    icon: "languages",
    tableVariant: "translation",
    gradeDescription: "逐句拆解译文，找到错译、漏译与表达上的真正失分点。",
    practiceDescription: "回看每一句译文与高分表达的差距，把修改理由真正读懂。",
    inputPlaceholder: "请粘贴或输入你的中文译文……",
    answerLabel: "你的译文",
    questionLabel: "翻译原文",
    optimizedLabel: "优化后的译文",
    optimizeTitle: "译文优化",
    optimizeHint: "划掉的原句与建议表达对照呈现，悬停或轻点建议表达查看原因。",
    sampleTitle: "参考译文",
    sampleHint: "参考译文只提供一种高质量表达路径，并非唯一答案。",
    wordUnit: "字",
    prompt: PROMPTS.translation,
  },
  letter: {
    key: "letter",
    label: "小作文",
    navLabel: "小作文批改",
    practiceLabel: "小作文练习",
    gradeTitle: "小作文批改",
    practiceTitle: "小作文练习",
    eyebrow: "LETTER WRITING",
    total: 10,
    icon: "pen",
    tableVariant: "writing",
    gradeDescription: "从内容要点、语言质量到篇章衔接，逐项打磨应用文。",
    practiceDescription: "对照逐句批改与高分表达，理解应用文如何写得准确、得体。",
    inputPlaceholder: "请粘贴或输入你的英文应用文正文……",
    answerLabel: "你的作答",
    questionLabel: "写作题目",
    optimizedLabel: "优化后的全文",
    optimizeTitle: "表达优化",
    optimizeHint: "划掉不够准确的表达，悬停或轻点右侧建议，查看修改理由。",
    sampleTitle: "范文",
    sampleHint: "点击或悬停任意句子，查看范文为什么这样写。",
    wordUnit: "词",
    prompt: PROMPTS.letter,
  },
  essay: {
    key: "essay",
    label: "大作文",
    navLabel: "大作文批改",
    practiceLabel: "大作文练习",
    gradeTitle: "大作文批改",
    practiceTitle: "大作文练习",
    eyebrow: "ESSAY WRITING",
    total: 15,
    icon: "fileText",
    tableVariant: "writing",
    gradeDescription: "审视立意、结构与语言，让整篇作文经得起高分标准推敲。",
    practiceDescription: "拆解逐句得失，读懂结构与表达为何需要调整。",
    inputPlaceholder: "请粘贴或输入你的英文作文……",
    answerLabel: "你的作答",
    questionLabel: "写作题目",
    optimizedLabel: "优化后的全文",
    optimizeTitle: "表达优化",
    optimizeHint: "划掉不够准确的表达，悬停或轻点右侧建议，查看修改理由。",
    sampleTitle: "范文",
    sampleHint: "点击或悬停任意句子，查看范文为什么这样写。",
    wordUnit: "词",
    prompt: PROMPTS.essay,
  },
};

export const MODE_LABELS = {
  true: "真题模式",
  mock: "模拟题模式",
};

/*
 * 真题材料入口
 * -------------
 * 2010–2025 英语二翻译 / 小作文 / 大作文，题目已按工作区 PDF 核对。
 * 翻译原文与作文题目参考 structured-kaoyan-english（题目数据可自由使用）；
 * 参考译文与范文为本站整理，仅用于本地学习。大作文图表取自
 * 《英语二大作文真题合集》，图片路径相对站点根目录。
 */
export const MATERIALS = EXAM_MATERIALS;

export function getMaterials(subjectKey) {
  return MATERIALS[subjectKey] || [];
}

export function getMaterial(subjectKey, materialId) {
  return getMaterials(subjectKey).find((item) => item.id === materialId) || null;
}

export function hasRealMaterials(subjectKey) {
  return getMaterials(subjectKey).some((item) => !item.isDemo);
}
