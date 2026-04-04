(function () {
  "use strict";

  var COMPLETE_KEY = "carded_walkthrough_complete";
  var PENDING_KEY = "carded_walkthrough_pending";
  var STEP_DURATION = 7000; // ms per step
  var TRANSITION_DURATION = 400; // ms

  var state = {
    active: false,
    currentStep: 0,
    progressTimer: null,
    progressStart: 0,
    progressRaf: null,
    skipConfirm: false,
  };

  var els = {
    backdrop: null,
    spotlight: null,
    tooltip: null,
    progressBar: null,
    titleEl: null,
    descEl: null,
    prevBtn: null,
    nextBtn: null,
    skipBtn: null,
    stepCounter: null,
    skipConfirmEl: null,
  };

  var STEPS = [
    {
      title: "Welcome to your library!",
      desc: "This is where all your folders and flashcard sets live. Let\u2019s take a quick tour!",
      target: null, // full-screen intro, no spotlight
    },
    {
      title: "Create folders and sets",
      desc: "Organize your flashcards into folders, or create standalone sets. Use the buttons in the top-right to get started.",
      targetSelector: "[data-action='create-folder']",
      targetPadding: 8,
    },
    {
      title: "Study your cards",
      desc: "Click any set to open it, then hit Study to begin. Choose Flip mode to test yourself or Quiz mode for multiple choice.",
      targetSelector: ".set-tile",
      targetPadding: 6,
    },
    {
      title: "Track your progress",
      desc: "Your stats, streaks, and accuracy live in Settings. Cards you miss show up more often until you\u2019ve got them down.",
      targetSelector: ".account-link",
      targetPadding: 6,
    },
    {
      title: "Go offline anytime",
      desc: "Carded works fully offline. Install it as an app for the best experience: on Chrome tap the install icon in the address bar; on iOS tap Share \u2192 Add to Home Screen.",
      target: null, // full-screen
    },
    {
      title: "Keyboard shortcuts",
      desc: "Use these shortcuts to navigate faster. Press \u00a0\ufe0f?\u00a0\ufe0f anytime to see them again.",
      target: null, // show shortcuts overlay
      isShortcutStep: true,
    },
  ];

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
  }

  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function isActive() {
    return state.active;
  }

  function clearTimers() {
    if (state.progressTimer) { clearTimeout(state.progressTimer); state.progressTimer = null; }
    if (state.progressRaf) { cancelAnimationFrame(state.progressRaf); state.progressRaf = null; }
  }

  function getTargetRect(step) {
    if (!step.targetSelector) return null;
    var el = document.querySelector(step.targetSelector);
    if (!el) return null;
    var rect = el.getBoundingClientRect();
    var pad = step.targetPadding || 0;
    return {
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
  }

  function positionSpotlight(rect) {
    if (!els.spotlight) return;
    if (!rect) {
      els.spotlight.style.opacity = "0";
      return;
    }
    els.spotlight.style.opacity = "1";
    els.spotlight.style.top = rect.top + "px";
    els.spotlight.style.left = rect.left + "px";
    els.spotlight.style.width = rect.width + "px";
    els.spotlight.style.height = rect.height + "px";
  }

  function positionTooltip(rect) {
    if (!els.tooltip) return;
    var tooltip = els.tooltip;
    var vpW = window.innerWidth;
    var vpH = window.innerHeight;
    var tooltipW = Math.min(340, vpW - 32);

    tooltip.style.width = tooltipW + "px";
    tooltip.style.maxWidth = tooltipW + "px";

    if (!rect) {
      // Center on screen
      tooltip.style.top = "50%";
      tooltip.style.left = "50%";
      tooltip.style.transform = "translate(-50%, -50%)";
      return;
    }

    tooltip.style.transform = "";

    // Try to place below the spotlight, then above, then to the right
    var tooltipH = tooltip.offsetHeight || 160;
    var margin = 16;
    var preferredTop = rect.top + rect.height + margin;
    var preferredLeft = rect.left + rect.width / 2 - tooltipW / 2;

    // Clamp horizontally
    preferredLeft = Math.max(16, Math.min(preferredLeft, vpW - tooltipW - 16));

    if (preferredTop + tooltipH < vpH - 16) {
      tooltip.style.top = preferredTop + "px";
      tooltip.style.left = preferredLeft + "px";
    } else {
      // Place above
      var aboveTop = rect.top - tooltipH - margin;
      if (aboveTop > 16) {
        tooltip.style.top = aboveTop + "px";
        tooltip.style.left = preferredLeft + "px";
      } else {
        // Place to the right or center
        tooltip.style.top = Math.max(16, vpH / 2 - tooltipH / 2) + "px";
        var rightLeft = rect.left + rect.width + margin;
        if (rightLeft + tooltipW < vpW - 16) {
          tooltip.style.left = rightLeft + "px";
        } else {
          tooltip.style.left = Math.max(16, rect.left - tooltipW - margin) + "px";
        }
      }
    }
  }

  function startProgressBar() {
    if (!els.progressBar) return;
    clearTimers();
    state.progressStart = Date.now();
    els.progressBar.style.transition = "none";
    els.progressBar.style.width = "0%";

    function tick() {
      if (!state.active) return;
      var elapsed = Date.now() - state.progressStart;
      var pct = Math.min(100, (elapsed / STEP_DURATION) * 100);
      els.progressBar.style.width = pct + "%";
      if (pct < 100) {
        state.progressRaf = requestAnimationFrame(tick);
      }
    }

    state.progressRaf = requestAnimationFrame(tick);

    state.progressTimer = setTimeout(function () {
      if (state.active) nextStep();
    }, STEP_DURATION);
  }

  function showStep(index) {
    if (!state.active) return;
    state.currentStep = index;
    state.skipConfirm = false;

    var step = STEPS[index];
    var isLast = index === STEPS.length - 1;

    // Update text
    if (els.titleEl) els.titleEl.textContent = step.title;
    if (els.descEl) els.descEl.textContent = step.desc;
    if (els.stepCounter) els.stepCounter.textContent = (index + 1) + " / " + STEPS.length;
    if (els.prevBtn) els.prevBtn.disabled = index === 0;
    if (els.nextBtn) els.nextBtn.textContent = isLast ? "Done" : "Next";
    if (els.skipConfirmEl) {
      els.skipConfirmEl.style.display = "none";
      state.skipConfirm = false;
    }
    if (els.skipBtn) els.skipBtn.style.display = isLast ? "none" : "";

    // Shortcut step: show shortcuts overlay
    if (step.isShortcutStep && window.CardedShortcuts) {
      window.CardedShortcuts.showShortcutsOverlay();
    } else if (window.CardedShortcuts) {
      window.CardedShortcuts.hideShortcutsOverlay();
    }

    var rect = getTargetRect(step);

    // Animate transition
    els.tooltip.style.opacity = "0";
    if (els.spotlight) els.spotlight.style.opacity = "0";

    setTimeout(function () {
      if (!state.active) return;
      positionSpotlight(rect);
      positionTooltip(rect);
      els.tooltip.style.opacity = "1";
      startProgressBar();
    }, TRANSITION_DURATION / 2);
  }

  function nextStep() {
    if (!state.active) return;
    if (state.currentStep < STEPS.length - 1) {
      showStep(state.currentStep + 1);
    } else {
      finish();
    }
  }

  function prevStep() {
    if (!state.active) return;
    if (state.currentStep > 0) {
      showStep(state.currentStep - 1);
    }
  }

  function finish() {
    safeSet(COMPLETE_KEY, "true");
    teardown();
  }

  function teardown() {
    clearTimers();
    state.active = false;
    state.skipConfirm = false;

    if (window.CardedShortcuts) window.CardedShortcuts.hideShortcutsOverlay();

    if (els.backdrop && els.backdrop.parentNode) {
      els.backdrop.style.opacity = "0";
      setTimeout(function () {
        if (els.backdrop && els.backdrop.parentNode) els.backdrop.parentNode.removeChild(els.backdrop);
      }, 300);
    }

    els.backdrop = null;
    els.spotlight = null;
    els.tooltip = null;
    els.progressBar = null;
    els.titleEl = null;
    els.descEl = null;
    els.prevBtn = null;
    els.nextBtn = null;
    els.skipBtn = null;
    els.stepCounter = null;
    els.skipConfirmEl = null;

    window.removeEventListener("resize", onResize);
  }

  function showSkipConfirm() {
    if (!els.skipConfirmEl) return;
    state.skipConfirm = true;
    clearTimers();
    els.skipConfirmEl.style.display = "";
    els.skipConfirmEl.querySelector("[data-wt-confirm-skip]") && els.skipConfirmEl.querySelector("[data-wt-confirm-skip]").focus();
  }

  function hideSkipConfirm() {
    if (!els.skipConfirmEl) return;
    state.skipConfirm = false;
    els.skipConfirmEl.style.display = "none";
    startProgressBar();
  }

  function confirmSkip() {
    if (state.skipConfirm) {
      teardown();
    } else {
      showSkipConfirm();
    }
  }

  function onResize() {
    if (!state.active) return;
    var step = STEPS[state.currentStep];
    var rect = getTargetRect(step);
    positionSpotlight(rect);
    positionTooltip(rect);
  }

  function buildOverlay() {
    // Backdrop (dark overlay)
    var backdrop = document.createElement("div");
    backdrop.className = "wt-backdrop";
    backdrop.setAttribute("aria-hidden", "true");

    // Spotlight hole
    var spotlight = document.createElement("div");
    spotlight.className = "wt-spotlight";
    backdrop.appendChild(spotlight);

    // Tooltip
    var tooltip = document.createElement("div");
    tooltip.className = "wt-tooltip";
    tooltip.setAttribute("role", "dialog");
    tooltip.setAttribute("aria-modal", "true");
    tooltip.setAttribute("aria-label", "Walkthrough");

    tooltip.innerHTML =
      '<div class="wt-header">' +
      '  <span class="wt-step-counter" aria-live="polite"></span>' +
      '  <button class="ghost-button wt-skip-btn" type="button" style="font-size:0.82rem;color:var(--text-secondary)">Skip tour</button>' +
      '</div>' +
      '<h3 class="wt-title"></h3>' +
      '<p class="wt-desc"></p>' +
      '<div class="wt-skip-confirm" style="display:none;margin-top:8px;padding:10px;border-radius:8px;background:var(--bg-tertiary)">' +
      '  <p style="margin:0 0 8px;font-size:0.88rem">End the tour? You can replay it from Settings \u2192 Preferences.</p>' +
      '  <div style="display:flex;gap:8px">' +
      '    <button class="danger-button" data-wt-confirm-skip type="button" style="font-size:0.85rem;padding:6px 14px">End tour</button>' +
      '    <button class="ghost-button" data-wt-cancel-skip type="button" style="font-size:0.85rem;padding:6px 14px">Continue</button>' +
      '  </div>' +
      '</div>' +
      '<div class="wt-progress-track">' +
      '  <div class="wt-progress-bar"></div>' +
      '</div>' +
      '<div class="wt-actions">' +
      '  <button class="ghost-button wt-prev-btn" type="button" aria-label="Previous step">' +
      '    &#x23EA; Back' +
      '  </button>' +
      '  <button class="button wt-next-btn" type="button">Next</button>' +
      '</div>';

    backdrop.appendChild(tooltip);
    return { backdrop, spotlight, tooltip };
  }

  function start() {
    if (state.active) return;
    safeRemove(PENDING_KEY);

    var built = buildOverlay();
    els.backdrop = built.backdrop;
    els.spotlight = built.spotlight;
    els.tooltip = built.tooltip;

    els.progressBar = els.tooltip.querySelector(".wt-progress-bar");
    els.titleEl = els.tooltip.querySelector(".wt-title");
    els.descEl = els.tooltip.querySelector(".wt-desc");
    els.prevBtn = els.tooltip.querySelector(".wt-prev-btn");
    els.nextBtn = els.tooltip.querySelector(".wt-next-btn");
    els.skipBtn = els.tooltip.querySelector(".wt-skip-btn");
    els.stepCounter = els.tooltip.querySelector(".wt-step-counter");
    els.skipConfirmEl = els.tooltip.querySelector(".wt-skip-confirm");

    els.backdrop.style.opacity = "0";
    document.body.appendChild(els.backdrop);

    // Fade in
    requestAnimationFrame(function () {
      els.backdrop.style.transition = "opacity 0.3s ease";
      els.backdrop.style.opacity = "1";
    });

    state.active = true;
    state.currentStep = 0;

    // Wire buttons
    els.prevBtn.addEventListener("click", prevStep);
    els.nextBtn.addEventListener("click", nextStep);
    els.skipBtn.addEventListener("click", showSkipConfirm);
    els.tooltip.querySelector("[data-wt-confirm-skip]").addEventListener("click", function () { teardown(); });
    els.tooltip.querySelector("[data-wt-cancel-skip]").addEventListener("click", hideSkipConfirm);

    window.addEventListener("resize", onResize);

    showStep(0);
  }

  function maybeAutoStart() {
    if (safeGet(PENDING_KEY) === "true") {
      // Small delay to let the page finish rendering
      setTimeout(start, 600);
    }
  }

  // Auto-start if pending flag is set (triggered from setup page or "Show again" button)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeAutoStart);
  } else {
    maybeAutoStart();
  }

  window.CardedWalkthrough = {
    confirmSkip,
    isActive,
    maybeAutoStart,
    start,
    stop: teardown,
  };
})();
