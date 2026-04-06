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
    try { return localStorage.getItem(THEME_KEY) || "auto"; } catch (_) { return "auto"; }
  }

  function setTheme(theme) {
    const val = theme === "dark" || theme === "light" || theme === "auto" ? theme : "auto";
    try { localStorage.setItem(THEME_KEY, val); } catch (_) {}
    // Enable transition only for user-triggered changes, not page-load application
    document.documentElement.classList.add("theme-animated");
    applyTheme(val);
    updateToggleIcons(val);
    setTimeout(function () { document.documentElement.classList.remove("theme-animated"); }, 400);
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

  // Re-apply theme when restored from bfcache (back/forward navigation)
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) {
      var theme = getStoredTheme();
      applyTheme(theme);
      updateToggleIcons(theme);
    }
  });

  // Listen for theme changes from other tabs via BroadcastChannel
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel("carded-theme");
      bc.onmessage = function (event) {
        try { localStorage.setItem(THEME_KEY, event.data); } catch (_) {}
        applyTheme(event.data);
        updateToggleIcons(event.data);
      };
    } catch (_) {}
  }

  // Fallback: storage event fires on other tabs when localStorage changes
  window.addEventListener("storage", function (event) {
    if (event.key === THEME_KEY && event.newValue) {
      applyTheme(event.newValue);
      updateToggleIcons(event.newValue);
    }
  });

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
