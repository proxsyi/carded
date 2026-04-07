(function () {
  "use strict";

  const BASE_PATH = "/carded";
  const APP_VERSION = "4.0.0";
  const DEBUG = false;
  const DELETION_GRACE_PERIOD_DAYS = 30;
  const SUPABASE_URL = "https://uctnhfasholeuyxqulmd.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_TZwBeTxXXq2oAQac2LpJBQ_sYisHZWU";
  // Set SENTRY_DSN to your project DSN from sentry.io to enable error reporting.
  const SENTRY_DSN = "";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase client library failed to load.");
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { experimentalManualLinking: true },
  });

  window.BASE_PATH = BASE_PATH;
  window.APP_VERSION = APP_VERSION;
  window.DEBUG = DEBUG;
  window.DELETION_GRACE_PERIOD_DAYS = DELETION_GRACE_PERIOD_DAYS;
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  window.supabaseClient = supabase;

  if (SENTRY_DSN) {
    const sentryScript = document.createElement("script");
    sentryScript.src = "https://browser.sentry-cdn.com/7.119.0/bundle.min.js";
    sentryScript.crossOrigin = "anonymous";
    sentryScript.onload = function () {
      if (window.Sentry) {
        window.Sentry.init({
          dsn: SENTRY_DSN,
          release: APP_VERSION,
          environment: DEBUG ? "development" : "production",
        });
      }
    };
    document.head.appendChild(sentryScript);
  }
})();
