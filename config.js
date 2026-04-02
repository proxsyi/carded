(function () {
  "use strict";

  const BASE_PATH = "/carded";
  const APP_VERSION = "3.0.0";
  const DEBUG = false;
  const SUPABASE_URL = "https://uctnhfasholeuyxqulmd.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_TZwBeTxXXq2oAQac2LpJBQ_sYisHZWU";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase client library failed to load.");
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  window.BASE_PATH = BASE_PATH;
  window.APP_VERSION = APP_VERSION;
  window.DEBUG = DEBUG;
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  window.supabaseClient = supabase;
})();
