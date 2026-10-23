import { decodeWhy, escapeHTML } from "./utils.js";

const ICONS = {
  overview:
    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.7V21h14V9.7"/><path d="M9.5 21v-6h5v6"/>',
  languages:
    '<path d="m5 8 6 6"/><path d="m4 14 6-6"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  fileText:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  camera:
    '<path d="M14.5 4h-5L8 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4Z"/><circle cx="12" cy="12.5" r="3.5"/>',
  type: '<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M8 19h8"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.3 2.3 4.7-4.8"/>',
  sparkles:
    '<path d="m12 3-1.7 4.3L6 9l4.3 1.7L12 15l1.7-4.3L18 9l-4.3-1.7Z"/><path d="M5 17v.01"/><path d="M19 17v.01"/><path d="M12 21v.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  play: '<path d="m7 4 13 8-13 8Z"/>',
  pause: '<path d="M8 5v14"/><path d="M16 5v14"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  note: '<path d="M4 4h16v12l-4 4H4Z"/><path d="M16 20v-4h4"/><path d="M8 9h8"/><path d="M8 13h5"/>',
  pencil: '<path d="m15 5 4 4L8 20l-5 1 1-5Z"/><path d="m13 7 4 4"/><path d="M15 5l4-4 4 4-4 4"/>',
  highlighter:
    '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>',
  bookOpen:
    '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:
    '<path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.1 3.1"/><path d="M6.6 6.6C3.6 8.4 2 12 2 12s3.5 7 10 7a11 11 0 0 0 5.4-1.4"/>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  uploadCloud:
    '<path d="M16 16l-4-4-4 4"/><path d="M12 12v9"/><path d="M20.4 17.5a5 5 0 0 0-1.4-9.8 7 7 0 0 0-13.7 2A4.5 4.5 0 0 0 6 20"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  alert:
    '<path d="M10.3 3.9 2.1 18a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  eraser: '<path d="m7 21-4-4a2 2 0 0 1 0-2.8l9.4-9.4a2 2 0 0 1 2.8 0l5.2 5.2a2 2 0 0 1 0 2.8L13 21"/><path d="M21 21H7"/><path d="m5.8 12.2 5.2 5.2"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 14 3-4 4 3 5-7"/>',
  refresh: '<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  circleHelp: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.6 2.6 0 1 1 4.1 2.1c-.9.6-1.7 1.1-1.7 2.4"/><path d="M12 17h.01"/>',
  minus: '<path d="M5 12h14"/>',
  cards:
    '<rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8 3h9a2 2 0 0 1 2 2v12"/><path d="M6.5 11h5"/><path d="M6.5 15h3.5"/>',
  volume:
    '<path d="M11 5 6.5 9H3v6h3.5L11 19Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/>',
  repeat:
    '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
};

export function icon(name, size = 20, className = "") {
  const paths = ICONS[name] || ICONS.info;
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function toastRegion() {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  return region;
}

export function toast(message, type = "success") {
  const region = toastRegion();
  while (region.children.length >= 4) region.firstElementChild.remove();
  const element = document.createElement("div");
  element.className = `toast toast-${type}`;
  element.setAttribute("role", type === "error" ? "alert" : "status");
  const iconName = type === "success" ? "checkCircle" : type === "error" ? "alert" : "info";
  element.innerHTML = `<span class="toast-icon">${icon(iconName, 18)}</span><span class="toast-message">${escapeHTML(message)}</span><button class="toast-close" type="button" aria-label="关闭提示">${icon("x", 15)}</button>`;
  const dismiss = () => {
    if (!element.isConnected) return;
    element.classList.add("is-leaving");
    setTimeout(() => element.remove(), 180);
  };
  element.querySelector(".toast-close").addEventListener("click", dismiss);
  region.appendChild(element);
  const timeout = setTimeout(dismiss, type === "error" ? 8000 : 4500);
  element.addEventListener("click", (event) => {
    if (event.target.closest(".toast-close")) clearTimeout(timeout);
  });
  return dismiss;
}

export function confirmDialog({
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "modal confirm-modal";
    dialog.innerHTML = `
      <div class="modal-card confirm-card">
        <div class="confirm-mark ${danger ? "is-danger" : ""}">${icon(danger ? "alert" : "info", 22)}</div>
        <div class="confirm-copy">
          <h2>${escapeHTML(title)}</h2>
          <p>${escapeHTML(message)}</p>
        </div>
        <div class="confirm-actions">
          <button class="btn btn-ghost" type="button" data-confirm-cancel autofocus>${escapeHTML(cancelText)}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-confirm-ok>${escapeHTML(confirmText)}</button>
        </div>
      </div>`;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      if (dialog.open) dialog.close();
      setTimeout(() => dialog.remove(), 0);
    };
    dialog.querySelector("[data-confirm-cancel]").addEventListener("click", () => finish(false));
    dialog.querySelector("[data-confirm-ok]").addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) finish(false);
    });
    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

export function openProgressDialog({
  title = "正在批改",
  description = "AI 正在阅读题干与作答，请稍候。",
  cancelLabel = "取消批改",
  onCancel,
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "modal progress-modal";
  dialog.innerHTML = `
    <div class="modal-card progress-card">
      <div class="progress-visual" aria-hidden="true">
        <span class="progress-orbit"></span>
        <span class="progress-core">${icon("sparkles", 24)}</span>
      </div>
      <div class="progress-copy">
        <span class="eyebrow">AI EVALUATION</span>
        <h2 data-progress-title>${escapeHTML(title)}</h2>
        <p data-progress-description aria-live="polite">${escapeHTML(description)}</p>
      </div>
      <div class="progress-meta">
        <span data-progress-time>已等待 0 秒</span>
        <span class="progress-separator"></span>
        <span>通常需要 20–90 秒</span>
      </div>
      <button class="btn btn-ghost progress-cancel" type="button" data-progress-cancel>${escapeHTML(cancelLabel)}</button>
      <p class="progress-note">${icon("shield", 15)} 请保持页面开启，批改完成后会自动保存到本机。</p>
    </div>`;
  const startedAt = Date.now();
  const timeElement = dialog.querySelector("[data-progress-time]");
  const titleElement = dialog.querySelector("[data-progress-title]");
  const descriptionElement = dialog.querySelector("[data-progress-description]");
  const cancelButton = dialog.querySelector("[data-progress-cancel]");
  let closed = false;
  const interval = setInterval(() => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    timeElement.textContent = `已等待 ${seconds} 秒`;
  }, 1000);
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    if (dialog.open) dialog.close();
    setTimeout(() => dialog.remove(), 0);
  };
  cancelButton.addEventListener("click", () => {
    if (cancelButton.disabled) return;
    cancelButton.disabled = true;
    cancelButton.textContent = "正在取消…";
    titleElement.textContent = "正在停止批改";
    descriptionElement.textContent = "请求即将中止，不会保存本次记录。";
    onCancel?.();
  });
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  document.body.appendChild(dialog);
  dialog.showModal();
  return {
    update(nextTitle, nextDescription) {
      if (closed) return;
      if (nextTitle) titleElement.textContent = nextTitle;
      if (nextDescription) descriptionElement.textContent = nextDescription;
    },
    close,
  };
}

let whyPopoverInstance = null;

export function initWhyPopover(root) {
  whyPopoverInstance?.cleanup();
  let popover = document.getElementById("why-popover");
  if (!popover) {
    popover = document.createElement("div");
    popover.id = "why-popover";
    popover.className = "why-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "为什么这样写");
    popover.hidden = true;
    popover.innerHTML = `
      <div class="why-popover-head">
        <span>${icon("sparkles", 15)} 为什么这样写</span>
        <button type="button" class="why-popover-close" aria-label="关闭说明">${icon("x", 15)}</button>
      </div>
      <div class="why-popover-body"></div>`;
    document.body.appendChild(popover);
  }
  const bodyElement = popover.querySelector(".why-popover-body");
  const closeButton = popover.querySelector(".why-popover-close");
  let activeTrigger = null;
  let pinned = false;
  let hideTimer = null;
  const controller = new AbortController();

  const close = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (activeTrigger) activeTrigger.setAttribute("aria-expanded", "false");
    activeTrigger = null;
    pinned = false;
    popover.hidden = true;
    popover.classList.remove("is-visible");
  };

  const position = (trigger) => {
    const rect = trigger.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const margin = 12;
    let left = rect.left + rect.width / 2 - popRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popRect.width - margin));
    let top = rect.bottom + 10;
    if (top + popRect.height > window.innerHeight - margin) {
      top = rect.top - popRect.height - 10;
    }
    top = Math.max(margin, top);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  };

  const show = (trigger, shouldPin = false) => {
    const why = decodeWhy(trigger.dataset.why);
    if (!why) return;
    if (activeTrigger && activeTrigger !== trigger) {
      activeTrigger.setAttribute("aria-expanded", "false");
    }
    activeTrigger = trigger;
    if (shouldPin) pinned = true;
    trigger.setAttribute("aria-expanded", "true");
    bodyElement.replaceChildren();
    const paragraph = document.createElement("p");
    paragraph.textContent = why;
    bodyElement.appendChild(paragraph);
    popover.hidden = false;
    popover.classList.add("is-visible");
    requestAnimationFrame(() => position(trigger));
  };

  const scheduleHide = () => {
    if (pinned) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(close, 160);
  };

  const triggerFromEvent = (event) => event.target.closest("[data-why]");

  root.addEventListener(
    "pointerover",
    (event) => {
      if (event.pointerType === "touch") return;
      const trigger = triggerFromEvent(event);
      if (!trigger || !root.contains(trigger)) return;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (activeTrigger !== trigger || popover.hidden) show(trigger, false);
    },
    { signal: controller.signal },
  );
  root.addEventListener(
    "pointerout",
    (event) => {
      if (event.pointerType === "touch") return;
      const trigger = triggerFromEvent(event);
      if (!trigger) return;
      if (event.relatedTarget && trigger.contains(event.relatedTarget)) return;
      scheduleHide();
    },
    { signal: controller.signal },
  );
  root.addEventListener(
    "click",
    (event) => {
      const trigger = triggerFromEvent(event);
      if (!trigger) return;
      event.preventDefault();
      if (activeTrigger === trigger && pinned) {
        close();
      } else {
        show(trigger, true);
      }
    },
    { signal: controller.signal },
  );
  root.addEventListener(
    "focusin",
    (event) => {
      const trigger = triggerFromEvent(event);
      if (trigger && activeTrigger !== trigger) show(trigger, false);
    },
    { signal: controller.signal },
  );
  root.addEventListener(
    "focusout",
    (event) => {
      const trigger = triggerFromEvent(event);
      if (!trigger) return;
      scheduleHide();
    },
    { signal: controller.signal },
  );

  const outsideHandler = (event) => {
    if (popover.contains(event.target)) return;
    if (root.contains(event.target.closest?.("[data-why]"))) return;
    close();
  };
  const keyHandler = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("pointerdown", outsideHandler, { signal: controller.signal });
  document.addEventListener("keydown", keyHandler, { signal: controller.signal });
  popover.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target.closest(".why-popover-close")) {
        event.preventDefault();
        close();
      }
    },
    { signal: controller.signal },
  );
  closeButton.addEventListener("click", close, { signal: controller.signal });
  window.addEventListener("scroll", () => {
    if (!popover.hidden) close();
  }, { passive: true, signal: controller.signal });
  window.addEventListener("resize", close, { passive: true, signal: controller.signal });

  const cleanup = () => {
    controller.abort();
    close();
  };
  whyPopoverInstance = { cleanup };
  return cleanup;
}
