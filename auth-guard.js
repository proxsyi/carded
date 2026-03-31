(function () {
  "use strict";

  const RETURN_URL_KEY = "carded_return_url";
  const PUBLIC_PATHS = new Set([
    window.BASE_PATH,
    window.BASE_PATH + "/login",
    window.BASE_PATH + "/signin",
    window.BASE_PATH + "/signup",
    window.BASE_PATH + "/tos",
    window.BASE_PATH + "/privacy",
  ]);

  let authSubscription = null;

  function readHashParams() {
    return new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  }

  function storeReturnUrl(path) {
    window.CardedUtils.safeSet(RETURN_URL_KEY, path, window.sessionStorage);
  }

  function readReturnUrl() {
    return window.CardedUtils.safeGet(RETURN_URL_KEY, window.sessionStorage);
  }

  function consumeReturnUrl() {
    const value = readReturnUrl();
    window.CardedUtils.safeRemove(RETURN_URL_KEY, window.sessionStorage);
    return value;
  }

  function getCurrentAppPath() {
    return window.CardedUtils.currentPath();
  }

  function redirectToLogin() {
    const returnTo = getCurrentAppPath() + (window.location.search || "") + (window.location.hash || "");
    storeReturnUrl(returnTo);
    window.CardedUtils.redirectTo(window.BASE_PATH + "/login", null, true);
  }

  function redirectAuthedHome() {
    const returnTo = consumeReturnUrl();
    if (returnTo && window.CardedUtils.isAppPath(returnTo)) {
      window.location.replace(window.location.origin + returnTo);
      return;
    }
    window.CardedUtils.redirectTo(window.BASE_PATH + "/library", null, true);
  }

  async function getSession() {
    const response = await window.supabaseClient.auth.getSession();
    if (response.error) throw response.error;
    return response.data.session;
  }

  async function guardPage(options) {
    const config = options || {};
    const requiresAuth = Boolean(config.requiresAuth);
    const session = await getSession().catch(function () {
      return null;
    });

    if (requiresAuth && !session) {
      redirectToLogin();
      return null;
    }

    if (!requiresAuth && session && PUBLIC_PATHS.has(getCurrentAppPath())) {
      redirectAuthedHome();
      return session;
    }

    if (
      requiresAuth &&
      session &&
      getCurrentAppPath() === window.BASE_PATH + "/library"
    ) {
      const returnTo = readReturnUrl();
      if (returnTo && window.CardedUtils.isAppPath(returnTo) && returnTo !== window.BASE_PATH + "/library") {
        redirectAuthedHome();
        return session;
      }
    }

    return session;
  }

  function setupAuthListener() {
    if (authSubscription) return authSubscription;

    authSubscription = window.supabaseClient.auth.onAuthStateChange(function (event, session) {
      window.dispatchEvent(new CustomEvent("carded:auth-state", {
        detail: { event: event, session: session },
      }));

      if (event === "SIGNED_OUT" && !PUBLIC_PATHS.has(getCurrentAppPath())) {
        redirectToLogin();
      }
    });

    return authSubscription;
  }

  function maybeHandleRecoveryRedirect() {
    const type = readHashParams().get("type");
    if (type === "recovery" && getCurrentAppPath() === window.BASE_PATH) {
      window.location.replace(window.location.origin + window.BASE_PATH + "/account" + window.location.hash);
      return true;
    }
    return false;
  }

  setupAuthListener();

  window.CardedAuthGuard = {
    consumeReturnUrl,
    getSession,
    guardPage,
    maybeHandleRecoveryRedirect,
    readHashParams,
    redirectAuthedHome,
    redirectToLogin,
    setupAuthListener,
    storeReturnUrl,
  };
})();
