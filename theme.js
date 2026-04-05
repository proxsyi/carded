(function () {
  "use strict";

  const THEME_KEY = "carded_theme";

  /**
   * Apply theme to <html> element.
   * @param {"dark"|"light"|"auto"} theme
   */
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else if (theme === "dark") {
      root.removeAttribute("data-theme");
    } else {
      // auto — follow system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        root.removeAttribute("data-theme");
      } else {
        root.setAttribute("data-theme", "light");
      }
    }
  }

  function getStoredTheme() {
    return window.CardedUtils
      ? window.CardedUtils.safeGet(THEME_KEY) || "auto"
      : (localStorage.getItem(THEME_KEY) || "auto");
  }

  function setTheme(theme) {
    const val = theme === "dark" || theme === "light" || theme === "auto" ? theme : "auto";
    if (window.CardedUtils) {
      window.CardedUtils.safeSet(THEME_KEY, val);
    } else {
      try { localStorage.setItem(THEME_KEY, val); } catch (_) {}
    }
    document.documentElement.classList.add("theme-switching");
    void document.documentElement.offsetHeight; // force separate style recalc so !important transitions are active before color change
    applyTheme(val);
    setTimeout(function () { document.documentElement.classList.remove("theme-switching"); }, 400);
    updateToggleIcons(val);
    // Notify other tabs
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const bc = new BroadcastChannel("carded-theme");
        bc.postMessage(val);
        bc.close();
      } catch (_) {}
    }
  }

  function cycleTheme() {
    const current = getStoredTheme();
    const next = current === "dark" ? "light" : current === "light" ? "auto" : "dark";
    setTheme(next);
  }

  function updateToggleIcons(theme) {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      const eff = effectiveTheme(theme);
      btn.setAttribute("aria-label", eff === "dark" ? "Switch to light theme" : "Switch to dark theme");
      btn.querySelector(".theme-icon-sun") && (btn.querySelector(".theme-icon-sun").style.display = eff === "dark" ? "none" : "");
      btn.querySelector(".theme-icon-moon") && (btn.querySelector(".theme-icon-moon").style.display = eff === "dark" ? "" : "none");
    });
  }

  function effectiveTheme(theme) {
    if (theme === "light") return "light";
    if (theme === "dark") return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  // Listen for system preference changes when theme is "auto"
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    if (getStoredTheme() === "auto") {
      applyTheme("auto");
      updateToggleIcons("auto");
    }
  });

  // Listen for theme changes from other tabs
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel("carded-theme");
      bc.onmessage = function (event) {
        document.documentElement.classList.add("theme-switching");
        void document.documentElement.offsetHeight;
        applyTheme(event.data);
        setTimeout(function () { document.documentElement.classList.remove("theme-switching"); }, 400);
        updateToggleIcons(event.data);
      };
    } catch (_) {}
  }

  // Initialize on load
  function init() {
    const theme = getStoredTheme();
    applyTheme(theme);
    updateToggleIcons(theme);

    // Wire up all toggle buttons
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", cycleTheme);
    });
  }

  // Apply theme immediately (before DOMContentLoaded) to avoid flash
  applyTheme(getStoredTheme());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CardedTheme = {
    applyTheme,
    cycleTheme,
    effectiveTheme,
    getStoredTheme,
    setTheme,
    updateToggleIcons,
  };
})();
