(function () {
  "use strict";

  const SESSION_KEY = "carded_session";
  const PASSWORD_RECOVERY_KEY = "carded_password_recovery";
  const AUTH_PAGES = new Set(["signin.html", "signup.html"]);

  function requireSupabase() {
    if (!window.supabaseClient) {
      throw new Error("Supabase client is not initialized.");
    }
    return window.supabaseClient;
  }

  function getCurrentFileName() {
    const path = window.location.pathname.split("/").filter(Boolean);
    return path[path.length - 1] || "index.html";
  }

  function buildPageUrl(fileName) {
    return new URL(fileName, window.location.href).toString();
  }

  function storeSession(session) {
    if (!session) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearStoredSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function setPasswordRecovery(enabled) {
    if (enabled) {
      sessionStorage.setItem(PASSWORD_RECOVERY_KEY, "1");
    } else {
      sessionStorage.removeItem(PASSWORD_RECOVERY_KEY);
    }
  }

  function isPasswordRecoveryMode() {
    return sessionStorage.getItem(PASSWORD_RECOVERY_KEY) === "1";
  }

  function redirectToSignIn() {
    const returnTo = `${window.location.pathname}${window.location.hash || ""}`;
    const target = new URL("signin.html", window.location.href);
    if (getCurrentFileName() !== "signin.html") {
      target.searchParams.set("returnTo", returnTo);
    }
    window.location.replace(target.toString());
  }

  function redirectToIndex() {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo");
    if (returnTo) {
      window.location.replace(returnTo);
      return;
    }
    window.location.replace(buildPageUrl("index.html"));
  }

  function showToast(message) {
    const root = document.getElementById("toast-root");
    if (!root) return;
    root.innerHTML = `
      <div class="toast" role="status">
        <p>${escapeHtml(message)}</p>
      </div>
    `;
    window.setTimeout(() => {
      root.innerHTML = "";
    }, 4000);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function getSession() {
    const { data, error } = await requireSupabase().auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function signInWithEmail(email, password) {
    const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUpWithEmail(email, password) {
    const { data, error } = await requireSupabase().auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async function signInWithOAuth(provider) {
    const { data, error } = await requireSupabase().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: buildPageUrl("index.html"),
      },
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  }

  async function resetPassword(email) {
    const { data, error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: buildPageUrl("account.html"),
    });
    if (error) throw error;
    return data;
  }

  async function updatePassword(newPassword) {
    const { data, error } = await requireSupabase().auth.updateUser({ password: newPassword });
    if (error) throw error;
    setPasswordRecovery(false);
    return data;
  }

  async function authGuard() {
    const session = await getSession();
    if (!session) {
      redirectToSignIn();
      return null;
    }
    storeSession(session);
    return session;
  }

  function onAuthStateChange(callback) {
    return requireSupabase().auth.onAuthStateChange(callback);
  }

  function dispatchAuthEvent(event, session) {
    window.dispatchEvent(new CustomEvent("carded:auth-state", {
      detail: { event, session },
    }));
  }

  function registerGlobalAuthHandler() {
    onAuthStateChange(async (event, session) => {
      dispatchAuthEvent(event, session);

      if (event === "SIGNED_IN") {
        storeSession(session);
        setPasswordRecovery(false);
        window.dispatchEvent(new CustomEvent("carded:migration-check", {
          detail: { session },
        }));
        if (AUTH_PAGES.has(getCurrentFileName())) {
          redirectToIndex();
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        clearStoredSession();
        setPasswordRecovery(false);
        if (window.CardedSync && typeof window.CardedSync.unsubscribeAllRealtime === "function") {
          await window.CardedSync.unsubscribeAllRealtime();
        }
        if (window.CardedDB && typeof window.CardedDB.clearAllTables === "function") {
          await window.CardedDB.clearAllTables().catch(() => {});
        }
        if (!AUTH_PAGES.has(getCurrentFileName())) {
          redirectToSignIn();
        }
        return;
      }

      if (event === "TOKEN_REFRESHED") {
        console.debug("Supabase token refreshed.");
        if (session) storeSession(session);
        return;
      }

      if (event === "USER_UPDATED") {
        if (session) storeSession(session);
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        if (getCurrentFileName() !== "account.html") {
          window.location.replace(buildPageUrl("account.html"));
        } else {
          showToast("Set a new password to finish recovery.");
        }
      }
    });
  }

  registerGlobalAuthHandler();

  window.CardedAuth = {
    authGuard,
    getSession,
    isPasswordRecoveryMode,
    onAuthStateChange,
    redirectToIndex,
    resetPassword,
    showToast,
    signInWithEmail,
    signInWithOAuth,
    signOut,
    signUpWithEmail,
    updatePassword,
  };
})();
