(function () {
  "use strict";

  var OVERLAY_ID = "carded-shortcuts-overlay";

  function isInputFocused() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  function isOverlayOpen() {
    return Boolean(document.getElementById(OVERLAY_ID));
  }

  function hideShortcutsOverlay() {
    var el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
  }

  function showShortcutsOverlay() {
    if (isOverlayOpen()) return;

    var backdrop = document.createElement("div");
    backdrop.id = OVERLAY_ID;
    backdrop.className = "modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Keyboard shortcuts");

    backdrop.innerHTML =
      '<div class="modal shortcuts-modal">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
      '    <h2 style="margin:0">Keyboard shortcuts</h2>' +
      '    <button class="ghost-button" id="shortcuts-close-btn" type="button" aria-label="Close"' +
      '      style="font-size:1.1rem;line-height:1;padding:4px 8px">&#x2715;</button>' +
      '  </div>' +
      '  <table class="shortcut-table">' +
      '    <thead><tr><th>Action</th><th>Key</th></tr></thead>' +
      '    <tbody>' +
      '      <tr><td colspan="2" class="shortcut-group">Library</td></tr>' +
      '      <tr><td>New set</td><td><kbd>N</kbd></td></tr>' +
      '      <tr><td>New folder</td><td><kbd>F</kbd></td></tr>' +
      '      <tr><td>Focus search</td><td><kbd>/</kbd></td></tr>' +
      '      <tr><td>Close modal</td><td><kbd>Esc</kbd></td></tr>' +
      '      <tr><td colspan="2" class="shortcut-group">Study</td></tr>' +
      '      <tr><td>Flip card</td><td><kbd>Space</kbd></td></tr>' +
      '      <tr><td>Go back</td><td><kbd>Esc</kbd></td></tr>' +
      '      <tr><td colspan="2" class="shortcut-group">Global</td></tr>' +
      '      <tr><td>Toggle theme</td><td><kbd>T</kbd></td></tr>' +
      '      <tr><td>Show shortcuts</td><td><kbd>?</kbd></td></tr>' +
      '      <tr><td>Go to library</td><td><kbd>H</kbd></td></tr>' +
      '    </tbody>' +
      '  </table>' +
      '</div>';

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) hideShortcutsOverlay();
    });

    document.body.appendChild(backdrop);

    var closeBtn = document.getElementById("shortcuts-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", hideShortcutsOverlay);
      closeBtn.focus();
    }
  }

  document.addEventListener("keydown", function (e) {
    if (isInputFocused()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    var key = e.key;

    // Esc: close shortcuts overlay if open (stop propagation so app.js doesn't also handle it)
    if (key === "Escape") {
      if (isOverlayOpen()) {
        e.stopImmediatePropagation();
        hideShortcutsOverlay();
      }
      return;
    }

    // While overlay is open, swallow all other shortcuts
    if (isOverlayOpen()) return;

    switch (key) {
      case "?":
        showShortcutsOverlay();
        break;
      case "t":
      case "T":
        if (window.CardedTheme) window.CardedTheme.cycleTheme();
        break;
      case "h":
      case "H":
        if (window.BASE_PATH) window.location.assign(window.BASE_PATH + "/library");
        break;
    }
  }, true); // capture phase so it fires before app.js's bubble-phase listener

  window.CardedShortcuts = {
    hideShortcutsOverlay,
    isOverlayOpen,
    showShortcutsOverlay,
  };
})();
