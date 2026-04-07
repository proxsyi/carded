(function () {
  "use strict";

  function debugLog() {
    if (!window.DEBUG) return;
    console.log.apply(console, arguments);
  }

  function safeGet(key, storage) {
    try {
      return (storage || window.localStorage).getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSet(key, value, storage) {
    try {
      (storage || window.localStorage).setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function safeRemove(key, storage) {
    try {
      (storage || window.localStorage).removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function currentPath() {
    return window.location.pathname.replace(/\/+$/, "") || "/";
  }

  function normalizeAppPath(path) {
    if (!path || path === "/") return window.BASE_PATH;
    const normalized = path.startsWith("/") ? path : "/" + path;
    return normalized.replace(/\/+$/, "");
  }

  function buildAppUrl(path, searchParams) {
    const url = new URL(window.location.origin + normalizeAppPath(path));
    if (searchParams) {
      Object.keys(searchParams).forEach(function (key) {
        const value = searchParams[key];
        if (value !== null && value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      });
    }
    return url.toString();
  }

  function isAppPath(path) {
    return typeof path === "string" && path.startsWith(window.BASE_PATH);
  }

  function redirectTo(path, searchParams, replace) {
    const target = buildAppUrl(path, searchParams);
    if (replace) {
      window.location.replace(target);
      return;
    }
    window.location.assign(target);
  }

  function renderFatalError(message) {
    var root = document.getElementById("global-error-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "global-error-root";
      root.className = "global-error";
      document.body.appendChild(root);
    }
    root.textContent = message || "Something went wrong — please refresh.";
  }

  window.addEventListener("error", function (event) {
    if (window.Sentry) window.Sentry.captureException(event.error || new Error("Unhandled error"));
    renderFatalError("Something went wrong — please refresh.");
  });

  window.addEventListener("unhandledrejection", function (event) {
    if (window.Sentry) window.Sentry.captureException(event.reason || new Error("Unhandled rejection"));
    renderFatalError("Something went wrong — please refresh.");
  });

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(message) {
    if (window.CardedComponents && typeof window.CardedComponents.showToast === "function") {
      window.CardedComponents.showToast(message);
      return;
    }
    // Fallback for pages that load utils.js before components.js
    const root = document.getElementById("toast-root");
    if (!root) return;
    root.textContent = "";
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    const p = document.createElement("p");
    p.textContent = message;
    toast.appendChild(p);
    root.appendChild(toast);
    window.setTimeout(function () { toast.remove(); }, 4000);
  }

  function withLoading(button, asyncFn) {
    if (!button || button.disabled) return Promise.resolve();
    button.disabled = true;
    button.dataset.loading = "true";
    return Promise.resolve()
      .then(asyncFn)
      .finally(function () {
        button.disabled = false;
        button.dataset.loading = "false";
      });
  }

  window.CardedUtils = {
    buildAppUrl,
    currentPath,
    debugLog,
    escapeHtml,
    isAppPath,
    normalizeAppPath,
    redirectTo,
    renderFatalError,
    safeGet,
    safeRemove,
    safeSet,
    showToast,
    withLoading,
  };
})();
