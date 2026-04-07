(function () {
  "use strict";

  // ─── Toast System ────────────────────────────────────────────────────────────

  let toastTimer = null;

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {"info"|"success"|"error"|"warning"} [type="info"]
   * @param {number} [duration=4000]
   */
  function showToast(message, type, duration) {
    const root = document.getElementById("toast-root");
    if (!root) return;
    clearTimeout(toastTimer);
    root.innerHTML = "";

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "alert");

    const text = document.createElement("p");
    text.textContent = message;
    toast.appendChild(text);

    const dismiss = document.createElement("button");
    dismiss.className = "icon-button";
    dismiss.setAttribute("aria-label", "Dismiss notification");
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", hideToast, { once: true });
    toast.appendChild(dismiss);

    root.appendChild(toast);

    const ms = typeof duration === "number" ? duration : 4000;
    toastTimer = setTimeout(hideToast, ms);
  }

  function hideToast() {
    const root = document.getElementById("toast-root");
    if (!root) return;
    const toast = root.querySelector(".toast");
    if (!toast) return;
    toast.classList.add("hide");
    setTimeout(function () {
      root.innerHTML = "";
    }, 180);
  }

  // ─── Modal System ─────────────────────────────────────────────────────────────

  let modalTriggerEl = null;
  let currentModal = null;
  let modalCloseTimer = null;

  /**
   * Show a modal dialog.
   * @param {object} options
   * @param {string} options.title
   * @param {string} [options.copy]
   * @param {{ label: string, value?: string, placeholder?: string, maxLength?: number }} [options.input]
   * @param {string} [options.confirmLabel="Confirm"]
   * @param {string} [options.cancelLabel="Cancel"]
   * @param {boolean} [options.danger=false]
   * @param {function} [options.onConfirm]
   * @param {function} [options.onCancel]
   */
  function showModal(options) {
    const root = document.getElementById("modal-root");
    if (!root) return;

    // Cancel any in-flight close animation
    if (modalCloseTimer) {
      clearTimeout(modalCloseTimer);
      modalCloseTimer = null;
      root.innerHTML = "";
    }

    modalTriggerEl = document.activeElement;
    currentModal = options;

    const danger = options.danger === true;
    const confirmClass = danger ? "danger-button" : "button";
    const confirmLabel = options.confirmLabel || "Confirm";
    const cancelLabel = options.cancelLabel || "Cancel";

    const maxLength = options.input && options.input.maxLength ? options.input.maxLength : null;
    const charCounterHtml = maxLength
      ? `<span class="char-counter" style="font-size:0.88rem;color:var(--text-secondary);text-align:right">${(options.input.value || "").length} / ${maxLength}</span>`
      : "";

    const inputHtml = options.input
      ? `<div class="field">
           <label for="modal-input">${escapeHtml(options.input.label || "")}</label>
           <input id="modal-input" class="input modal__input" type="text"
             value="${escapeHtml(options.input.value || "")}"
             placeholder="${escapeHtml(options.input.placeholder || "")}"
             ${maxLength ? `maxlength="${maxLength}"` : ""}
             autocomplete="off">
           ${charCounterHtml}
         </div>`
      : "";

    root.innerHTML = `
      <div class="modal-backdrop" aria-hidden="false">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="components-modal-title">
          <h2 id="components-modal-title">${escapeHtml(options.title)}</h2>
          ${options.copy ? `<p>${escapeHtml(options.copy)}</p>` : ""}
          ${inputHtml}
          <div class="modal__actions">
            <button class="ghost-button" id="modal-cancel-btn">${escapeHtml(cancelLabel)}</button>
            <button class="${confirmClass}" id="modal-confirm-btn">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>
    `;

    const modal = root.querySelector(".modal");
    const inputEl = root.querySelector("#modal-input");
    const confirmBtn = root.querySelector("#modal-confirm-btn");
    const cancelBtn = root.querySelector("#modal-cancel-btn");

    // Character counter update
    if (inputEl && maxLength) {
      const counter = root.querySelector(".char-counter");
      inputEl.addEventListener("input", function () {
        if (counter) counter.textContent = inputEl.value.length + " / " + maxLength;
      });
    }

    cancelBtn.addEventListener("click", function () {
      closeModal();
      if (typeof options.onCancel === "function") options.onCancel();
    });

    confirmBtn.addEventListener("click", function () {
      const value = inputEl ? inputEl.value : "";
      closeModal();
      if (typeof options.onConfirm === "function") options.onConfirm(value);
    });

    // Enter in input triggers confirm
    if (inputEl) {
      inputEl.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          confirmBtn.click();
        }
      });
    }

    // Esc closes modal
    modal.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelBtn.click();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modal.querySelectorAll(
        "input, button:not([disabled]), [tabindex]:not([tabindex='-1'])"
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) { event.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });

    // Auto-focus
    const focusTarget = inputEl || confirmBtn;
    if (focusTarget) {
      focusTarget.focus();
      if (focusTarget.tagName === "INPUT") focusTarget.select();
    }
  }

  function closeModal() {
    const root = document.getElementById("modal-root");
    if (!root) { currentModal = null; return; }
    const backdrop = root.querySelector(".modal-backdrop");
    currentModal = null;
    const trigger = modalTriggerEl;
    modalTriggerEl = null;
    if (backdrop && !backdrop.classList.contains("is-closing")) {
      backdrop.classList.add("is-closing");
      modalCloseTimer = setTimeout(function () {
        modalCloseTimer = null;
        root.innerHTML = "";
        if (trigger && typeof trigger.focus === "function") trigger.focus();
      }, 200);
    } else {
      root.innerHTML = "";
      if (trigger && typeof trigger.focus === "function") trigger.focus();
    }
  }

  // ─── Loading Spinner ──────────────────────────────────────────────────────────

  /**
   * Show a full-page loading overlay.
   */
  function showSpinner(message) {
    const existing = document.getElementById("components-spinner");
    if (existing) return;
    const overlay = document.createElement("div");
    overlay.id = "components-spinner";
    overlay.style.cssText = "position:fixed;inset:0;z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(8,8,11,0.72)";
    overlay.innerHTML = `
      <div class="auth-loading__spinner" aria-hidden="true"></div>
      ${message ? `<p style="color:var(--text-secondary)">${escapeHtml(message)}</p>` : ""}
    `;
    document.body.appendChild(overlay);
  }

  function hideSpinner() {
    const el = document.getElementById("components-spinner");
    if (el) el.remove();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  const escapeHtml = window.CardedUtils.escapeHtml;

  window.CardedComponents = {
    showToast,
    hideToast,
    showModal,
    closeModal,
    showSpinner,
    hideSpinner,
  };
})();
