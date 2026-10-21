import { gradeSubmission, isApiConfigured } from "../api.js";
import { getMaterial, getMaterials, hasRealMaterials, MODE_LABELS, SUBJECTS } from "../data.js";
import {
  escapeAttr,
  escapeHTML,
  imageFileToData,
  parseModelOutput,
  truncate,
  uid,
} from "../utils.js";
import { icon, openProgressDialog, toast } from "../ui.js";

const MAX_ANSWER_IMAGES = 5;

const TEXT_HINTS = {
  translation: "建议先完整译完，再通读一遍检查漏译与搭配。文本作答默认卷面整洁。",
  letter: "应用文建议 100 词左右。注意称呼、正文与落款格式，文本作答默认卷面整洁。",
  essay: "大作文建议 150 词以上。文本作答默认卷面整洁，AI 仍会从内容、结构与语言评分。",
};

function safeDataImage(value) {
  return /^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(String(value || "")) ? value : "";
}

function materialImageSrc(value) {
  const raw = String(value?.dataUrl || value || "");
  if (safeDataImage(raw)) return raw;
  return /^assets\/images\/exams\/[a-z0-9/_-]+\.(?:jpe?g|png|webp)$/i.test(raw) ? raw : "";
}

function uploaderMarkup({ target, images, max, title, hint, isTouch, compact = false }) {
  const canAdd = images.length < max;
  const previews = images.length
    ? `<div class="image-preview-grid ${compact ? "is-compact" : ""}">
        ${images
          .map(
            (image, index) => `<figure class="image-preview">
              <img src="${escapeAttr(safeDataImage(image.dataUrl))}" alt="${escapeHTML(title)} ${index + 1}">
              <button type="button" class="image-remove" data-action="remove-image" data-target="${target}" data-index="${index}" aria-label="移除第 ${index + 1} 张图片">${icon("x", 14)}</button>
              <figcaption>图 ${index + 1}</figcaption>
            </figure>`,
          )
          .join("")}
      </div>`
    : "";
  const input = `
    <input type="file" accept="image/*" ${target !== "question" ? "multiple" : ""} data-image-input="${target}" data-capture="false" hidden>
    <input type="file" accept="image/*" capture="environment" data-image-input="${target}" data-capture="true" hidden>`;
  if (!canAdd) {
    return `<div class="image-uploader">${previews}<p class="upload-limit">已达到 ${max} 张上限，可先移除再上传。</p>${input}</div>`;
  }
  return `<div class="image-uploader">
    ${previews}
    ${previews ? `<div class="upload-more-label">${images.length}/${max} 张，可继续添加</div>` : ""}
    <div class="upload-actions ${isTouch ? "is-touch" : ""}">
      <button type="button" class="upload-drop" data-action="pick-image" data-target="${target}" data-capture="false">
        <span class="upload-drop-icon">${icon("upload", 21)}</span>
        <span><strong>${images.length ? "继续上传" : "上传图片"}</strong><small>从设备选择 ${target === "question" ? "题干" : "作答"}图片</small></span>
      </button>
      ${
        isTouch
          ? `<button type="button" class="camera-button" data-action="pick-image" data-target="${target}" data-capture="true">
              <span>${icon("camera", 21)}</span><strong>拍照</strong><small>直接拍摄${target === "question" ? "题干" : "作答"}</small>
            </button>`
          : ""
      }
    </div>
    <p class="upload-hint">${hint}</p>
    ${input}
  </div>`;
}

function renderMaterialPanel(subject, draft) {
  const materials = getMaterials(subject.key);
  if (!materials.length) {
    return `<div class="empty-material">
      <span>${icon("bookOpen", 24)}</span>
      <h3>真题材料正在整理中</h3>
      <p>题库暂未录入 ${escapeHTML(subject.label)} 题目。可以先用模拟题模式完成一次自测。</p>
      <button type="button" class="btn btn-ghost btn-small" data-action="switch-mode" data-mode="mock">切换到${MODE_LABELS.mock}</button>
    </div>`;
  }
  const material = getMaterial(subject.key, draft.materialId) || materials[0];
  if (material && draft.materialId !== material.id) draft.materialId = material.id;
  const demoNote = !hasRealMaterials(subject.key)
    ? `<div class="notice notice-warm">${icon("info", 16)}<p>真题题库尚未录入，当前展示的是<strong>非真题演示材料</strong>，用于完整走通真题模式。可直接在 <code>assets/js/data.js</code> 中替换题库。</p></div>`
    : "";
  const images = (material.questionImages || []).map(materialImageSrc).filter(Boolean);
  return `${demoNote}
    <label class="select-field">
      <span class="field-label">选择真题年份</span>
      <span class="select-wrap">
        <select class="select" data-material-select>
          ${materials
            .map(
              (item) =>
                `<option value="${escapeAttr(item.id)}" ${item.id === material.id ? "selected" : ""}>${escapeHTML(item.yearLabel || `${item.year} 年`)} · ${escapeHTML(item.title)}</option>`,
            )
            .join("")}
        </select>
        ${icon("chevronDown", 17)}
      </span>
    </label>
    <article class="material-card">
      <header class="material-card-head">
        <div class="material-meta">
          <span class="tag">${escapeHTML(material.yearLabel || `${material.year} 年`)}</span>
          ${material.isDemo ? `<span class="tag tag-muted">演示材料</span>` : ""}
        </div>
        <h3>${escapeHTML(material.title)}</h3>
        ${material.subtitle ? `<p>${escapeHTML(material.subtitle)}</p>` : ""}
      </header>
      ${
        material.questionText
          ? `<div class="material-question">${escapeHTML(material.questionText)}</div>`
          : `<div class="material-question is-empty">题干见下方图片。</div>`
      }
      ${
        images.length
          ? `<div class="material-images">${images.map((src, index) => `<img src="${escapeAttr(src)}" alt="题干图片 ${index + 1}">`).join("")}</div>`
          : ""
      }
    </article>`;
}

function renderRecentSide(subject, records) {
  const typed = records.filter((record) => record.type === subject.key).slice(0, 3);
  if (!typed.length) {
    return `<div class="aside-empty">${icon("clock", 19)}<p>完成第一次批改后，记录会保存在这里。</p></div>`;
  }
  return `<div class="aside-records">
    ${typed
      .map(
        (record) => `<a href="#/practice/${subject.key}?record=${encodeURIComponent(record.id)}" class="aside-record">
          <span class="aside-record-score">${record.score !== null && record.score !== undefined && Number.isFinite(Number(record.score)) ? `${Number(record.score)}` : "—"}<small>/${subject.total}</small></span>
          <span class="aside-record-main">
            <strong>${escapeHTML(truncate(record.title || "批改记录", 24))}</strong>
            <small>${escapeHTML(MODE_LABELS[record.mode] || "批改")}</small>
          </span>
          ${icon("chevronRight", 15)}
        </a>`,
      )
      .join("")}
  </div>`;
}

export function renderGrade(container, app, subjectKey) {
  const subject = SUBJECTS[subjectKey];
  const materials = getMaterials(subjectKey);
  if (!app.state.drafts[subjectKey]) {
    app.state.drafts[subjectKey] = {
      mode: "true",
      materialId: materials[0]?.id || "",
      answerMode: "image",
      questionImages: [],
      answerImages: [],
      answerText: "",
    };
  }
  const draft = app.state.drafts[subjectKey];
  if (!getMaterial(subjectKey, draft.materialId) && materials[0]) draft.materialId = materials[0].id;

  const config = app.state.config;
  const controller = new AbortController();
  let submitting = false;
  let processingImages = false;
  let activeAbort = null;
  let progressDialog = null;
  let phaseTimer = null;
  let disposed = false;

  const headerHtml = () => `
    <header class="page-head grade-page-head">
      <div class="page-head-copy">
        <span class="eyebrow">${escapeHTML(subject.eyebrow)} / AI FEEDBACK</span>
        <div class="title-with-badge">
          <h1>${escapeHTML(subject.gradeTitle)}</h1>
          <span class="total-badge">满分 ${subject.total}</span>
        </div>
        <p>${escapeHTML(subject.gradeDescription)}</p>
      </div>
      <div class="page-head-actions">
        ${isApiConfigured(config) ? `<span class="api-mini-status is-on"><i></i> AI 已就绪</span>` : `<button type="button" class="btn btn-ghost btn-small" data-open-settings>${icon("settings", 16)} 配置 AI</button>`}
        <a href="#/practice/${subjectKey}" class="btn btn-soft">${icon("bookOpen", 16)} 练习记录</a>
      </div>
    </header>`;

  container.innerHTML = `
    <div class="page grade-page">
      ${headerHtml()}
      <div class="mode-switch" role="tablist" aria-label="题目来源">
        <button type="button" role="tab" class="mode-tab ${draft.mode === "true" ? "is-active" : ""}" data-action="switch-mode" data-mode="true" aria-selected="${draft.mode === "true"}">
          <span class="mode-number">01</span>
          <span><strong>真题模式</strong><small>选择年份，使用内置题目与参考材料</small></span>
        </button>
        <button type="button" role="tab" class="mode-tab ${draft.mode === "mock" ? "is-active" : ""}" data-action="switch-mode" data-mode="mock" aria-selected="${draft.mode === "mock"}">
          <span class="mode-number">02</span>
          <span><strong>模拟题模式</strong><small>上传题干图片，用自己的题目自测</small></span>
        </button>
      </div>
      <div class="grading-layout">
        <section class="panel grade-form-panel" aria-label="提交批改">
          <div id="grade-form-area"></div>
        </section>
        <aside class="grading-aside">
          <section class="aside-card aside-guide">
            <span class="eyebrow">HOW IT WORKS</span>
            <h2>一次完整批改</h2>
            <ol class="guide-steps">
              <li><span>1</span><div><strong>给 AI 看题目</strong><p>${draft.mode === "true" ? "选择真题，系统会连同参考材料一起送入模型。" : "上传一张清晰的题干图片。"}</p></div></li>
              <li><span>2</span><div><strong>上传你的作答</strong><p>拍照或输入文本，两种方式使用同一套评分标准。</p></div></li>
              <li><span>3</span><div><strong>逐句读懂修改</strong><p>批改完成后自动保存，前往练习页对照优化与范文。</p></div></li>
            </ol>
          </section>
          <section class="aside-card">
            <div class="aside-card-head">
              <h2>最近批改</h2>
              ${app.state.records.some((record) => record.type === subjectKey) ? `<a href="#/practice/${subjectKey}">全部</a>` : ""}
            </div>
            ${renderRecentSide(subject, app.state.records)}
          </section>
          <section class="aside-card aside-privacy">
            ${icon("shield", 18)}
            <div><strong>本地优先</strong><p>作答与批改记录仅保存在当前浏览器；只有提交批改时，内容才会发送到你配置的 AI 接口。</p></div>
          </section>
        </aside>
      </div>
    </div>`;

  const formArea = container.querySelector("#grade-form-area");
  const modeTabs = container.querySelectorAll("[data-action='switch-mode'][role='tab']");

  const renderForm = () => {
    const material = getMaterial(subjectKey, draft.materialId) || materials[0];
    const errorMarkup = draft.error
      ? `<div class="inline-notice is-danger" role="alert">
          ${icon("alert", 18)}
          <p>${escapeHTML(draft.error)}</p>
          <button type="button" class="notice-dismiss" data-action="dismiss-error" aria-label="关闭错误提示">${icon("x", 15)}</button>
        </div>`
      : "";
    const configured = isApiConfigured(app.state.config);
    const apiNotice = configured
      ? ""
      : `<div class="inline-notice is-warning">
          ${icon("sparkles", 18)}
          <p>AI 接口尚未配置，配置 Endpoint 与模型后才能开始批改。</p>
          <button type="button" class="btn btn-soft btn-tiny" data-open-settings>现在配置</button>
        </div>`;

    const questionSection =
      draft.mode === "true"
        ? renderMaterialPanel(subject, draft)
        : `<div class="mock-question-head">
            <div>
              <span class="field-label">题干图片 <em>必填</em></span>
              <p>模拟题的题干仅接受图片，请确保题目要求清晰完整。</p>
            </div>
            <span class="tag tag-muted">仅图片</span>
          </div>
          ${uploaderMarkup({
            target: "question",
            images: draft.questionImages,
            max: 1,
            title: "题干图片",
            hint: "支持 JPG、PNG、WebP。文字越清晰，题干识别越稳定。",
            isTouch: app.state.isTouch,
            compact: true,
          })}`;

    const answerTextArea = `
      <div class="textarea-wrap">
        <textarea class="answer-textarea" data-answer-text placeholder="${escapeAttr(subject.inputPlaceholder)}" spellcheck="false">${escapeHTML(draft.answerText)}</textarea>
        <div class="textarea-foot">
          <span>${TEXT_HINTS[subjectKey]}</span>
          <span class="answer-count" data-answer-count>0 ${subject.wordUnit}</span>
        </div>
      </div>`;

    formArea.innerHTML = `
      ${apiNotice}
      ${errorMarkup}
      <div class="form-step">
        <div class="form-step-head">
          <span class="step-index">01</span>
          <div><h2>${draft.mode === "true" ? "选择题目" : "上传题干"}</h2><p>${draft.mode === "true" ? "题目和内部参考材料将一并交给 AI。" : "题干只支持图片上传。"}</p></div>
        </div>
        ${questionSection}
      </div>
      <div class="form-divider"></div>
      <div class="form-step">
        <div class="form-step-head">
          <span class="step-index">02</span>
          <div><h2>提交你的作答</h2><p>图片或文本二选一，选择后再提交批改。</p></div>
        </div>
        <div class="answer-mode-switch" role="group" aria-label="作答提交方式">
          <button type="button" class="answer-mode ${draft.answerMode === "image" ? "is-active" : ""}" data-action="answer-mode" data-answer-mode="image" aria-pressed="${draft.answerMode === "image"}">${icon("image", 17)} 图片作答</button>
          <button type="button" class="answer-mode ${draft.answerMode === "text" ? "is-active" : ""}" data-action="answer-mode" data-answer-mode="text" aria-pressed="${draft.answerMode === "text"}">${icon("type", 17)} 文本作答</button>
          <span class="answer-mode-hint">${draft.answerMode === "text" ? "默认卷面整洁" : app.state.isTouch ? "可拍照或从相册上传" : "点击上传作答图片"}</span>
        </div>
        ${
          draft.answerMode === "text"
            ? answerTextArea
            : uploaderMarkup({
                target: "answer",
                images: draft.answerImages,
                max: MAX_ANSWER_IMAGES,
                title: "作答图片",
                hint: `支持多张，最多 ${MAX_ANSWER_IMAGES} 张。拍摄时让页面平整、光线充足，识别会更准确。`,
                isTouch: app.state.isTouch,
              })
        }
      </div>
      <div class="form-divider"></div>
      <div class="submit-bar">
        <div class="submit-note">
          <span>${icon("shield", 15)} 批改后自动保存到本机</span>
          <span>本题满分 ${subject.total} 分</span>
        </div>
        <button type="button" class="btn btn-primary btn-grade" data-action="submit-grade">
          ${icon("sparkles", 18)}
          <span>开始 AI 批改</span>
          ${icon("arrowRight", 16)}
        </button>
      </div>`;

    if (draft.answerMode === "text") {
      updateAnswerCount();
    }
  };

  const updateAnswerCount = () => {
    const countElement = formArea.querySelector("[data-answer-count]");
    if (!countElement) return;
    const text = draft.answerText || "";
    const count =
      subject.wordUnit === "字"
        ? text.replace(/\s+/g, "").length
        : (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
    countElement.textContent = `${count} ${subject.wordUnit}`;
  };

  const updateModeTabs = () => {
    modeTabs.forEach((tab) => {
      const active = tab.dataset.mode === draft.mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    const guideFirst = container.querySelector(".guide-steps li:first-child p");
    if (guideFirst) {
      guideFirst.textContent =
        draft.mode === "true" ? "选择真题，系统会连同参考材料一起送入模型。" : "上传一张清晰的题干图片。";
    }
  };

  const processImages = async (target, files) => {
    if (processingImages) {
      toast("图片还在处理中，请稍候。", "info");
      return;
    }
    const max = target === "question" ? 1 : MAX_ANSWER_IMAGES;
    const array = target === "question" ? draft.questionImages : draft.answerImages;
    const remaining = max - array.length;
    if (remaining <= 0) {
      toast(`最多上传 ${max} 张图片。`, "error");
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    if (Array.from(files).length > remaining) {
      toast(`最多上传 ${max} 张图片，超出的图片已忽略。`, "info");
    }
    processingImages = true;
    const uploadButtons = formArea.querySelectorAll(
      `[data-action="pick-image"][data-target="${target}"]`,
    );
    uploadButtons.forEach((button) => button.classList.add("is-processing"));
    try {
      for (const file of selected) {
        try {
          const image = await imageFileToData(file);
          array.push(image);
        } catch (error) {
          toast(error?.message || "图片处理失败。", "error");
        }
      }
      draft.error = "";
      renderForm();
    } finally {
      processingImages = false;
    }
  };

  const showProgress = () => {
    const phases = [
      ["正在识读题干与作答", "AI 正在提取文字与题目要求。"],
      ["正在逐句比对采分点", "对照评分标准，分析每一句的得失。"],
      ["正在生成优化表达", "整理高分作答、修改理由与范文。"],
      ["正在整理批改结果", "长文本需要多一点时间，请稍候。"],
    ];
    progressDialog = openProgressDialog({
      title: phases[0][0],
      description: phases[0][1],
      onCancel: () => activeAbort?.abort(),
    });
    let phaseIndex = 0;
    let elapsed = 0;
    phaseTimer = setInterval(() => {
      elapsed += 6;
      phaseIndex = Math.min(phases.length - 1, Math.floor(elapsed / 18));
      progressDialog?.update(phases[phaseIndex][0], phases[phaseIndex][1]);
    }, 6000);
  };

  const finishProgress = () => {
    if (phaseTimer) {
      clearInterval(phaseTimer);
      phaseTimer = null;
    }
    progressDialog?.close();
    progressDialog = null;
  };

  const validate = () => {
    if (!isApiConfigured(app.state.config)) {
      app.openSettings();
      return false;
    }
    if (draft.mode === "true") {
      if (!getMaterial(subjectKey, draft.materialId)) {
        draft.error = "请选择一道真题材料。";
        return false;
      }
    } else if (!draft.questionImages.length) {
      draft.error = "请先上传题干图片。";
      return false;
    }
    if (draft.answerMode === "image") {
      if (!draft.answerImages.length) {
        draft.error = "请上传至少一张作答图片，或切换为文本作答。";
        return false;
      }
    } else if (!draft.answerText.trim()) {
      draft.error = "请输入作答内容后再提交。";
      return false;
    }
    return true;
  };

  const submitGrade = async () => {
    if (submitting) return;
    draft.error = "";
    if (!validate()) {
      renderForm();
      if (draft.error) toast(draft.error, "error");
      return;
    }
    submitting = true;
    activeAbort = new AbortController();
    showProgress();
    const startedAt = Date.now();
    const material = draft.mode === "true" ? getMaterial(subjectKey, draft.materialId) : null;
    const questionImages = draft.mode === "mock" ? [...draft.questionImages] : [];
    const recordQuestionImages =
      draft.mode === "mock" ? [...questionImages] : [...(material?.questionImages || [])];
    const answerImages = draft.answerMode === "image" ? [...draft.answerImages] : [];
    const answerText = draft.answerMode === "text" ? draft.answerText.trim() : "";

    try {
      const response = await gradeSubmission({
        subject,
        mode: draft.mode,
        material,
        questionImages,
        answerType: draft.answerMode,
        answerText,
        answerImages,
        config: app.state.config,
        signal: activeAbort.signal,
      });
      const parsed = parseModelOutput(response.content, subject, {
        truncated: response.truncated === true,
      });
      const generatedAt = new Date();
      const record = {
        version: 1,
        id: uid("record"),
        type: subject.key,
        typeLabel: subject.label,
        mode: draft.mode,
        title:
          draft.mode === "true"
            ? material?.title || `${subject.label}真题`
            : `模拟题自测 · ${generatedAt.getMonth() + 1}/${generatedAt.getDate()}`,
        year: material?.year || "",
        yearLabel: material?.yearLabel || "",
        materialId: material?.id || "",
        questionText: material?.questionText || "",
        questionImages: recordQuestionImages,
        answerMode: draft.answerMode,
        answerText,
        answerImages,
        score: Number.isFinite(parsed.score) ? parsed.score : null,
        total: subject.total,
        result: parsed,
        model: response.responseModel || app.state.config.model,
        usage: response.usage || null,
        durationMs: Date.now() - startedAt,
        createdAt: generatedAt.toISOString(),
      };
      finishProgress();
      await app.persistRecord(record);
      draft.questionImages = [];
      draft.answerImages = [];
      draft.answerText = "";
      draft.error = "";
      if (Number.isFinite(parsed.score)) {
        if (parsed.truncated) {
          toast("批改完成，但模型输出达到长度上限；已保存可解析的部分，建议换用输出上限更高的模型重试。", "info");
        } else {
          toast("批改完成，记录已保存。");
        }
      } else {
        toast("批改完成，但模型返回格式不完整；原始输出已保留，可在练习页查看。", "info");
      }
      app.navigate(`/practice/${subjectKey}?record=${encodeURIComponent(record.id)}`);
    } catch (error) {
      finishProgress();
      if (error?.name === "AbortError" || activeAbort.signal.aborted) {
        if (!disposed) toast("已取消本次批改。", "info");
      } else if (!disposed) {
        draft.error = error?.message || "批改失败，请稍后重试。";
        renderForm();
        toast("批改失败，作答内容已保留，可修改后重试。", "error");
      }
    } finally {
      submitting = false;
      activeAbort = null;
      if (!disposed) {
        const submitButton = formArea.querySelector("[data-action='submit-grade']");
        submitButton?.classList.remove("is-loading");
      }
    }
  };

  container.addEventListener(
    "click",
    (event) => {
      const actionElement = event.target.closest("[data-action]");
      if (!actionElement) return;
      const action = actionElement.dataset.action;
      if (action === "switch-mode") {
        const nextMode = actionElement.dataset.mode;
        if (!["true", "mock"].includes(nextMode) || nextMode === draft.mode) return;
        draft.mode = nextMode;
        draft.error = "";
        updateModeTabs();
        renderForm();
      } else if (action === "answer-mode") {
        const nextMode = actionElement.dataset.answerMode;
        if (!["image", "text"].includes(nextMode) || nextMode === draft.answerMode) return;
        draft.answerMode = nextMode;
        draft.error = "";
        renderForm();
      } else if (action === "pick-image") {
        const target = actionElement.dataset.target;
        const capture = actionElement.dataset.capture === "true";
        const input = formArea.querySelector(
          `[data-image-input="${target}"][data-capture="${capture}"]`,
        );
        input?.click();
      } else if (action === "remove-image") {
        const target = actionElement.dataset.target;
        const index = Number(actionElement.dataset.index);
        const array = target === "question" ? draft.questionImages : draft.answerImages;
        if (Number.isInteger(index) && index >= 0) array.splice(index, 1);
        draft.error = "";
        renderForm();
      } else if (action === "dismiss-error") {
        draft.error = "";
        renderForm();
      } else if (action === "submit-grade") {
        submitGrade();
      }
    },
    { signal: controller.signal },
  );

  container.addEventListener(
    "change",
    (event) => {
      if (event.target.matches("[data-material-select]")) {
        draft.materialId = event.target.value;
        draft.error = "";
        renderForm();
      } else if (event.target.matches("[data-image-input]")) {
        const input = event.target;
        const target = input.dataset.imageInput;
        const files = Array.from(input.files || []);
        input.value = "";
        if (files.length) processImages(target, files);
      }
    },
    { signal: controller.signal },
  );

  container.addEventListener(
    "input",
    (event) => {
      if (event.target.matches("[data-answer-text]")) {
        draft.answerText = event.target.value;
        updateAnswerCount();
      }
    },
    { signal: controller.signal },
  );

  renderForm();

  return () => {
    disposed = true;
    controller.abort();
    activeAbort?.abort();
    finishProgress();
  };
}
