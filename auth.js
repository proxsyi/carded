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

  function isRateLimitError(error) {
    return error && (
      (error.status === 429) ||
      (typeof error.message === "string" && error.message.toLowerCase().includes("rate limit"))
    );
  }

  async function signInWithEmail(email, password) {
    const response = await window.supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (response.error) {
      if (isRateLimitError(response.error)) {
        throw new Error("Too many attempts. Please wait a minute and try again.");
      }
      // Enumeration-safe: don't reveal whether email or password was wrong
      throw new Error("Invalid email or password.");
    }
    return response.data;
  }

  async function signUpWithEmail(email, password) {
    const response = await window.supabaseClient.auth.signUp({ email: email, password: password });
    if (response.error) {
      if (isRateLimitError(response.error)) {
        throw new Error("Too many attempts. Please wait a minute and try again.");
      }
      // Enumeration-safe: don't confirm whether email already exists
      throw new Error("Unable to create account. Try signing in instead.");
    }
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

  const RESET_COOLDOWN_KEY = "carded_reset_cooldown";
  const RESET_COOLDOWN_MS = 30000;

  function isResetOnCooldown() {
    const ts = window.CardedUtils.safeGet(RESET_COOLDOWN_KEY, window.sessionStorage);
    return ts && Date.now() - Number(ts) < RESET_COOLDOWN_MS;
  }

  function startResetCooldown() {
    window.CardedUtils.safeSet(RESET_COOLDOWN_KEY, String(Date.now()), window.sessionStorage);
  }

  function resetCooldownRemaining() {
    const ts = window.CardedUtils.safeGet(RESET_COOLDOWN_KEY, window.sessionStorage);
    if (!ts) return 0;
    return Math.max(0, Math.ceil((RESET_COOLDOWN_MS - (Date.now() - Number(ts))) / 1000));
  }

  async function resetPassword(email) {
    if (isResetOnCooldown()) {
      throw new Error("Please wait " + resetCooldownRemaining() + "s before requesting another reset link.");
    }
    const response = await window.supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.BASE_PATH + "/account",
    });
    // Always start cooldown and show neutral message (enumeration-safe)
    startResetCooldown();
    if (response.error && isRateLimitError(response.error)) {
      throw new Error("Too many attempts. Please wait a minute and try again.");
    }
    // Don't reveal whether email exists — always succeed from user's perspective
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
    isResetOnCooldown,
    resetCooldownRemaining,
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
