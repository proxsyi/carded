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

  window.addEventListener("error", function () {
    renderFatalError("Something went wrong — please refresh.");
  });

  window.addEventListener("unhandledrejection", function () {
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
  };
})();
