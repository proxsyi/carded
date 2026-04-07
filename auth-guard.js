(function () {
  "use strict";

  const RETURN_URL_KEY = "carded_return_url";
  const LOCAL_MODE_KEY = "carded_local_mode";
  const IOS_SESSION_KEY = "carded_ios_session";
  const PUBLIC_PATHS = new Set([
    window.BASE_PATH,
    window.BASE_PATH + "/login",
    window.BASE_PATH + "/signin",
    window.BASE_PATH + "/signup",
    window.BASE_PATH + "/tos",
    window.BASE_PATH + "/privacy",
  ]);

  function isLocalMode() {
    return window.CardedUtils && window.CardedUtils.safeGet(LOCAL_MODE_KEY) === "true";
  }

  function enterLocalMode() {
    window.CardedUtils && window.CardedUtils.safeSet(LOCAL_MODE_KEY, "true");
  }

  function exitLocalMode() {
    window.CardedUtils && window.CardedUtils.safeRemove(LOCAL_MODE_KEY);
  }

  // iOS PWA: WebKit kills sessionStorage on app restart. We back up tokens to
  // localStorage and restore them before Supabase's own getSession() runs.
  function persistSessionTokens(session) {
    if (!session || !session.access_token) {
      window.CardedUtils.safeRemove(IOS_SESSION_KEY);
      return;
    }
    window.CardedUtils.safeSet(IOS_SESSION_KEY, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }));
  }

  async function restoreSessionFromStorage() {
    const raw = window.CardedUtils.safeGet(IOS_SESSION_KEY);
    if (!raw) return;
    try {
      const tokens = JSON.parse(raw);
      if (tokens && tokens.access_token && tokens.refresh_token) {
        await window.supabaseClient.auth.setSession(tokens);
      }
    } catch (_) {}
  }

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
    const onboardingDone = window.CardedUtils.safeGet("carded_onboarding_complete");
    if (!onboardingDone) {
      window.CardedUtils.redirectTo(window.BASE_PATH + "/setup", null, true);
      return;
    }
    window.CardedUtils.redirectTo(window.BASE_PATH + "/library", null, true);
  }

  async function getSession() {
    let response = await window.supabaseClient.auth.getSession();
    if (response.error) throw response.error;
    let session = response.data.session;

    // iOS PWA fallback: if Supabase has no session in memory, try to restore
    // tokens we persisted to localStorage on the previous run.
    if (!session) {
      await restoreSessionFromStorage();
      response = await window.supabaseClient.auth.getSession();
      session = response.data ? response.data.session : null;
    }
    // If session token looks expired, attempt refresh
    if (session && session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
      const refreshResponse = await window.supabaseClient.auth.refreshSession().catch(function () {
        return { data: { session: null }, error: new Error("Refresh failed") };
      });
      if (refreshResponse.data && refreshResponse.data.session) {
        return refreshResponse.data.session;
      }
      // Refresh failed → treat as signed out
      return null;
    }
    return session;
  }

  async function guardPage(options) {
    const config = options || {};
    const requiresAuth = Boolean(config.requiresAuth);

    // Local mode: bypass all Supabase auth checks
    if (isLocalMode()) {
      if (PUBLIC_PATHS.has(getCurrentAppPath()) && getCurrentAppPath() !== window.BASE_PATH) {
        // On login/signup pages in local mode → redirect to library
        window.CardedUtils.redirectTo(window.BASE_PATH + "/library", null, true);
        return null;
      }
      // Return a fake local session object so pages work
      return { user: { id: "local-user", email: "", user_metadata: {} }, local: true };
    }

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

    // Check for pending account deletion on authenticated pages (except the recovery page itself)
    if (
      session &&
      getCurrentAppPath() !== window.BASE_PATH + "/pending-deletion" &&
      window.CardedSupabaseDB
    ) {
      try {
        const deletionRecord = await window.CardedSupabaseDB.checkPendingDeletion(session.user.id);
        if (deletionRecord) {
          window.CardedUtils.redirectTo(window.BASE_PATH + "/pending-deletion", null, true);
          return null;
        }
      } catch (_e) {
        // Non-fatal: proceed normally if check fails
      }
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
      // Keep localStorage backup in sync so iOS PWA can restore on next launch
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        persistSessionTokens(session);
      } else if (event === "SIGNED_OUT") {
        persistSessionTokens(null);
      }

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
      window.location.replace(window.location.origin + window.BASE_PATH + "/account/" + window.location.hash);
      return true;
    }
    return false;
  }

  setupAuthListener();

  window.CardedAuthGuard = {
    consumeReturnUrl,
    enterLocalMode,
    exitLocalMode,
    getSession,
    guardPage,
    isLocalMode,
    maybeHandleRecoveryRedirect,
    readHashParams,
    redirectAuthedHome,
    redirectToLogin,
    setupAuthListener,
    storeReturnUrl,
  };
})();
