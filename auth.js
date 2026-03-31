(function () {
  "use strict";

  const PASSWORD_RECOVERY_KEY = "carded_password_recovery";

  function showToast(message) {
    const root = document.getElementById("toast-root");
    if (!root) return;
    root.textContent = "";
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    root.appendChild(toast);
    window.setTimeout(function () {
      toast.remove();
    }, 4000);
  }

  function setRecoveryFlag(enabled) {
    if (enabled) {
      window.CardedUtils.safeSet(PASSWORD_RECOVERY_KEY, "1", window.sessionStorage);
      return;
    }
    window.CardedUtils.safeRemove(PASSWORD_RECOVERY_KEY, window.sessionStorage);
  }

  function isPasswordRecoveryMode() {
    return window.CardedUtils.safeGet(PASSWORD_RECOVERY_KEY, window.sessionStorage) === "1";
  }

  async function signInWithEmail(email, password) {
    const response = await window.supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (response.error) throw response.error;
    return response.data;
  }

  async function signUpWithEmail(email, password) {
    const response = await window.supabaseClient.auth.signUp({ email: email, password: password });
    if (response.error) throw response.error;
    return response.data;
  }

  async function signInWithOAuth(provider) {
    const response = await window.supabaseClient.auth.signInWithOAuth({
      provider: provider,
      options: {
        redirectTo: window.location.origin + window.BASE_PATH + "/library",
      },
    });
    if (response.error) throw response.error;
    return response.data;
  }

  async function signOut() {
    const response = await window.supabaseClient.auth.signOut();
    if (response.error) throw response.error;
  }

  async function resetPassword(email) {
    const response = await window.supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.BASE_PATH + "/account",
    });
    if (response.error) throw response.error;
    return response.data;
  }

  async function updatePassword(newPassword) {
    const response = await window.supabaseClient.auth.updateUser({ password: newPassword });
    if (response.error) throw response.error;
    setRecoveryFlag(false);
    return response.data;
  }

  window.addEventListener("carded:auth-state", function (event) {
    if (event.detail.event === "PASSWORD_RECOVERY") {
      setRecoveryFlag(true);
      if (window.CardedUtils.currentPath() !== window.BASE_PATH + "/account") {
        window.CardedUtils.redirectTo(window.BASE_PATH + "/account", null, true);
      }
    }
  });

  window.CardedAuth = {
    isPasswordRecoveryMode,
    resetPassword,
    setRecoveryFlag,
    showToast,
    signInWithEmail,
    signInWithOAuth,
    signOut,
    signUpWithEmail,
    updatePassword,
  };
})();
