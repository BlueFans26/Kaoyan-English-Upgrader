import {
  DEFAULT_API_CONFIG,
  isApiConfigured,
  saveApiConfig,
  testApiConnection,
} from "./api.js";
import { saveRecords, clearRecords, clearPaperStates } from "./db.js";
import {
  EXAM_SUBJECTS,
  loadExamSubject,
  normalizeExamSubject,
  saveExamSubject,
} from "./papers.js";
import { escapeHTML, downloadTextFile } from "./utils.js";
import { confirmDialog, icon, toast } from "./ui.js";

function normalizeImportedRecords(payload) {
  const source = Array.isArray(payload) ? payload : payload?.records;
  if (!Array.isArray(source)) throw new Error("备份文件格式不正确，未找到 records 数组。");
  return source.filter((record) => {
    const score = record?.score;
    const scoreIsValid =
      score === null || score === undefined || Number.isFinite(Number(score));
    return (
      record &&
      typeof record === "object" &&
      typeof record.id === "string" &&
      ["translation", "letter", "essay"].includes(record.type) &&
      scoreIsValid &&
      record.result &&
      typeof record.result === "object"
    );
  });
}

export function openSettings(app) {
  const existing = document.querySelector(".settings-modal");
  if (existing) {
    existing.remove();
  }
  const config = app.state.config;
  const currentSubject = normalizeExamSubject(
    app.state.examSubject || loadExamSubject(),
  );
  const dialog = document.createElement("dialog");
  dialog.className = "modal settings-modal";
  dialog.innerHTML = `
    <div class="modal-card settings-card">
      <header class="settings-head">
        <div>
          <span class="eyebrow">SETTINGS &amp; DATA</span>
          <h2>设置</h2>
          <p>接口配置与学习数据都只保存在这台设备上。</p>
        </div>
        <button type="button" class="icon-btn modal-close" data-settings-close aria-label="关闭设置">${icon("x", 20)}</button>
      </header>
      <div class="settings-body">
        <section class="settings-section">
          <div class="settings-section-head">
            <span class="settings-section-icon">${icon("target", 19)}</span>
            <div>
              <h3>备考科目</h3>
              <p>客观题真题按科目筛选，英语一、英语二各收录 2010–2025 年 16 套试卷。</p>
            </div>
            <span class="status-pill is-on" data-subject-status>${escapeHTML(EXAM_SUBJECTS[currentSubject].label)}</span>
          </div>
          <div class="exam-subject-options" role="radiogroup" aria-label="备考科目">
            <label class="exam-subject-option">
              <input type="radio" name="examSubject" value="english1" ${currentSubject === "english1" ? "checked" : ""}>
              <span class="exam-subject-body">
                <span class="exam-subject-top"><strong>英语（一）</strong><span class="exam-subject-mark">ENGLISH I</span></span>
                <span class="exam-subject-desc">新题型涵盖排序、匹配与小标题；客观题 60 分。</span>
              </span>
            </label>
            <label class="exam-subject-option">
              <input type="radio" name="examSubject" value="english2" ${currentSubject === "english2" ? "checked" : ""}>
              <span class="exam-subject-body">
                <span class="exam-subject-top"><strong>英语（二）</strong><span class="exam-subject-mark">ENGLISH II</span></span>
                <span class="exam-subject-desc">新题型以匹配、小标题为主；客观题 60 分。</span>
              </span>
            </label>
          </div>
          <p class="settings-inline-note">科目设置用于筛选客观题真题；现有翻译与作文批改材料仍以英语二为主。</p>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <span class="settings-section-icon">${icon("sparkles", 19)}</span>
            <div>
              <h3>AI 批改接口</h3>
              <p>使用 OpenAI 兼容的 Chat Completions 接口。真题文本作答可用纯文本模型；图片作答需模型支持图片输入。</p>
            </div>
            <span class="status-pill ${isApiConfigured(config) ? "is-on" : ""}" data-api-status>${isApiConfigured(config) ? "已配置" : "未配置"}</span>
          </div>
          <form class="settings-form" data-settings-form novalidate>
            <label class="field">
              <span class="field-label">Endpoint</span>
              <input class="input" type="url" name="baseUrl" autocomplete="off" spellcheck="false" placeholder="https://api.openai.com/v1" value="${escapeHTML(config.baseUrl)}">
              <span class="field-hint">填写到 <code>/v1</code> 即可；程序会自动补全 <code>/chat/completions</code>。本地模型地址也可填此处。</span>
            </label>
            <label class="field">
              <span class="field-label">模型名称</span>
              <input class="input" type="text" name="model" autocomplete="off" spellcheck="false" placeholder="例如 gpt-4o-mini / qwen-vl-max" value="${escapeHTML(config.model)}">
            </label>
            <label class="field">
              <span class="field-label">API Key <em>本地模型可留空</em></span>
              <span class="secret-field">
                <input class="input" type="password" name="apiKey" autocomplete="off" spellcheck="false" placeholder="sk-..." value="${escapeHTML(config.apiKey)}">
                <button type="button" class="secret-toggle" data-toggle-secret aria-label="显示 API Key">${icon("eye", 18)}</button>
              </span>
            </label>
            <div class="callout callout-soft">
              ${icon("lock", 17)}
              <p>密钥仅写入浏览器 localStorage，不会发送到本应用以外的服务器。清理浏览器数据会同时删除密钥、批改记录与背单词进度，批改记录建议定期导出备份。</p>
            </div>
            <div class="settings-form-actions">
              <button type="button" class="btn btn-ghost" data-test-api>${icon("refresh", 16)} 测试连接</button>
              <span class="connection-test-status" data-test-status role="status"></span>
              <button type="submit" class="btn btn-primary">${icon("check", 16)} 保存配置</button>
            </div>
          </form>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <span class="settings-section-icon">${icon("database", 19)}</span>
            <div>
              <h3>本地学习数据</h3>
              <p>当前保存 <strong data-record-count>${app.state.records.length}</strong> 条批改记录；背单词进度、客观题作答与荧光笔勾画也保存在本机。导出备份当前只包含批改记录。</p>
            </div>
          </div>
          <div class="data-actions">
            <button type="button" class="btn btn-ghost" data-export-data>${icon("download", 16)} 导出备份</button>
            <button type="button" class="btn btn-ghost" data-import-data>${icon("uploadCloud", 16)} 导入备份</button>
            <button type="button" class="btn btn-ghost btn-danger-text" data-clear-papers>${icon("target", 16)} 清空客观题进度</button>
            <button type="button" class="btn btn-ghost btn-danger-text" data-clear-data>${icon("trash", 16)} 清空记录</button>
            <input type="file" accept="application/json,.json" data-import-input hidden>
          </div>
        </section>

        <section class="settings-about">
          <span>${icon("bookOpen", 17)} 考研英语综合备考站</span>
          <span>本地优先 · v0.1</span>
        </section>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  dialog.showModal();

  const form = dialog.querySelector("[data-settings-form]");
  const statusPill = dialog.querySelector("[data-api-status]");
  const testButton = dialog.querySelector("[data-test-api]");
  const testStatus = dialog.querySelector("[data-test-status]");
  const importInput = dialog.querySelector("[data-import-input]");
  const subjectStatus = dialog.querySelector("[data-subject-status]");
  let testing = false;

  dialog.querySelectorAll('input[name="examSubject"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      const nextSubject = saveExamSubject(input.value);
      app.setExamSubject?.(nextSubject);
      subjectStatus.textContent = EXAM_SUBJECTS[nextSubject].label;
      toast(`备考科目已切换为${EXAM_SUBJECTS[nextSubject].name}。`);
    });
  });

  const close = () => {
    if (dialog.open) dialog.close();
    setTimeout(() => dialog.remove(), 0);
  };
  const clearTestStatus = () => {
    testStatus.className = "connection-test-status";
    testStatus.textContent = "";
  };
  const readFormConfig = () => ({
    baseUrl: form.elements.baseUrl.value.trim(),
    apiKey: form.elements.apiKey.value.trim(),
    model: form.elements.model.value.trim(),
  });

  dialog.querySelector("[data-settings-close]").addEventListener("click", close);
  dialog.addEventListener("close", () => setTimeout(() => dialog.remove(), 0));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  form.addEventListener("input", clearTestStatus);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextConfig = readFormConfig();
    if (!nextConfig.baseUrl || !nextConfig.model) {
      toast("请填写 Endpoint 与模型名称。", "error");
      (!nextConfig.baseUrl ? form.elements.baseUrl : form.elements.model).focus();
      return;
    }
    try {
      const parsed = new URL(nextConfig.baseUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      toast("Endpoint 不是有效的 http(s) 地址。", "error");
      form.elements.baseUrl.focus();
      return;
    }
    const saved = saveApiConfig(nextConfig);
    app.setConfig(saved);
    statusPill.textContent = "已配置";
    statusPill.classList.add("is-on");
    toast("AI 接口配置已保存。");
    close();
  });

  dialog.querySelector("[data-toggle-secret]").addEventListener("click", (event) => {
    const input = form.elements.apiKey;
    const button = event.currentTarget;
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    button.setAttribute("aria-label", isPassword ? "隐藏 API Key" : "显示 API Key");
    button.innerHTML = icon(isPassword ? "eyeOff" : "eye", 18);
  });

  testButton.addEventListener("click", async () => {
    if (testing) return;
    const testConfig = readFormConfig();
    if (!testConfig.baseUrl || !testConfig.model) {
      testStatus.className = "connection-test-status is-error";
      testStatus.textContent = "请先填写 Endpoint 与模型名称。";
      return;
    }
    testing = true;
    testButton.disabled = true;
    testButton.classList.add("is-loading");
    testStatus.className = "connection-test-status is-pending";
    testStatus.textContent = "正在连接模型…";
    try {
      await testApiConnection(testConfig);
      testStatus.className = "connection-test-status is-success";
      testStatus.textContent = "连接成功，模型已响应。";
    } catch (error) {
      testStatus.className = "connection-test-status is-error";
      testStatus.textContent = error?.message || "连接失败，请检查配置。";
    } finally {
      testing = false;
      testButton.disabled = false;
      testButton.classList.remove("is-loading");
    }
  });

  dialog.querySelector("[data-export-data]").addEventListener("click", () => {
    if (!app.state.records.length) {
      toast("暂无可导出的批改记录。", "info");
      return;
    }
    const payload = {
      app: "考研英语综合备考站",
      version: 1,
      exportedAt: new Date().toISOString(),
      records: app.state.records,
    };
    const datePart = new Date().toISOString().slice(0, 10);
    downloadTextFile(`考研英语综合备考站-学习数据-${datePart}.json`, JSON.stringify(payload, null, 2));
    toast("备份文件已导出。");
  });

  dialog.querySelector("[data-clear-papers]").addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "清空客观题进度",
      message:
        "将删除所有年份的作答、批改结果与荧光笔勾画，且无法恢复。仅清除客观题进度，不影响批改记录和背单词。",
      confirmText: "清空进度",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await clearPaperStates();
      app.refreshRoute?.();
      toast("客观题作答与勾画已清空。");
    } catch (error) {
      toast(error?.message || "清空客观题进度失败。", "error");
    }
  });

  dialog.querySelector("[data-import-data]").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const records = normalizeImportedRecords(payload);
      if (!records.length) throw new Error("文件中没有可导入的有效记录。");
      const confirmed = await confirmDialog({
        title: "导入学习数据",
        message: `将导入 ${records.length} 条批改记录，同 ID 的已有记录会被覆盖。继续吗？`,
        confirmText: "导入",
      });
      if (!confirmed) return;
      await saveRecords(records);
      await app.reloadRecords();
      dialog.querySelector("[data-record-count]").textContent = app.state.records.length;
      toast(`已导入 ${records.length} 条记录。`);
    } catch (error) {
      toast(error?.message || "导入失败，请检查备份文件。", "error");
    }
  });

  dialog.querySelector("[data-clear-data]").addEventListener("click", async () => {
    if (!app.state.records.length) {
      toast("当前没有可清空的记录。", "info");
      return;
    }
    const confirmed = await confirmDialog({
      title: "清空全部批改记录",
      message: `将永久删除本机保存的 ${app.state.records.length} 条记录与作答图片，且无法恢复。建议先导出备份。`,
      confirmText: "永久清空",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await clearRecords();
      await app.reloadRecords();
      dialog.querySelector("[data-record-count]").textContent = "0";
      toast("本地批改记录已清空。");
    } catch (error) {
      toast(error?.message || "清空记录失败。", "error");
    }
  });

  return { close };
}
