(function () {
  "use strict";

  const BASE_PATH = "/carded";
  const APP_VERSION = "4.0.0";
  const DEBUG = false;
  const DELETION_GRACE_PERIOD_DAYS = 30;
  const SUPABASE_URL = "https://uctnhfasholeuyxqulmd.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_TZwBeTxXXq2oAQac2LpJBQ_sYisHZWU";

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
})();
